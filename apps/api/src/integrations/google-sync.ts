/**
 * Gmail ingestion (TASK-0032 phase 2): maps synced messages onto the
 * record graph. Composition lives at the app tier — @drovano/google
 * (fetch + cursors) + @drovano/crm (records) + @drovano/retrieval
 * (chunks) never import each other.
 *
 * Mapping per message (prompt-04 design): the COUNTERPARTY (sender,
 * unless that is the connected mailbox itself — then the first other
 * recipient) becomes a Person, matched by email and created when
 * absent; a Company is matched/created by the email domain (never for
 * consumer mail providers) and linked; the message metadata is indexed
 * for retrieval anchored to the person, so permission-filtered search
 * finds it. Deterministic integration data writes directly as the
 * system actor — provisional-until-accepted applies to AI inference,
 * not to sync (agents propose; sync records what happened).
 */
import {
  getMessage,
  GoogleError,
  listAddedSince,
  listConnections,
  listMessageIds,
  updateCursors,
  withFreshAccessToken,
  type ConnectionSummary,
  type EmailAddress,
  type GmailMessage,
  type OAuthConfig,
  type TokenCipher,
} from '@drovano/google';
import {
  createRecord,
  queryRecords,
  updateRecordValues,
  type Actor,
  type HydratedRecord,
} from '@drovano/crm';
import { objectDefinitions, withTenant, type Database, type TenantTransaction } from '@drovano/db';
import { indexSource, type Embedder } from '@drovano/retrieval';
import { inArray } from 'drizzle-orm';
import { v5 as uuidv5 } from 'uuid';

/** Fixed namespace for deriving chunk source ids from Gmail message ids. */
const GMAIL_SOURCE_NAMESPACE = 'c4e6f3b0-3f0a-4b0e-9a4d-6b1e2f7c8d90';

/** Consumer mail providers never imply an employer. */
const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
]);

const SYSTEM_ACTOR: Actor = { kind: 'system' };

export interface GoogleSyncDeps {
  db: Database;
  oauth: OAuthConfig;
  cipher: TokenCipher;
  /** Dense retrieval when embeddings are enabled; BM25-only otherwise. */
  embedder?: Embedder | undefined;
  fetchImpl?: typeof fetch | undefined;
  /** Upper bound on messages ingested per run (each is one API call). */
  maxMessages?: number | undefined;
}

export interface GmailSyncInput {
  tenantId: string;
  connectionId: string;
}

export interface GmailSyncResult {
  /** 'full' on first sync or when the stored history cursor expired. */
  mode: 'full' | 'incremental';
  fetched: number;
  /** Messages that produced at least one retrieval chunk. */
  indexed: number;
  peopleCreated: number;
  companiesCreated: number;
  /** The stored Gmail history cursor after this run. */
  cursor: string | null;
}

function emailText(message: GmailMessage): string {
  const format = (address: EmailAddress): string =>
    address.name === null ? address.email : `${address.name} <${address.email}>`;
  return [
    `Subject: ${message.subject}`,
    `From: ${message.from === null ? '' : format(message.from)}`,
    `To: ${message.to.map(format).join(', ')}`,
    `Date: ${message.date.toISOString()}`,
    '',
    message.snippet,
  ].join('\n');
}

/** The person this message is ABOUT: the non-mailbox party. */
function counterparty(message: GmailMessage, ownEmail: string): EmailAddress | null {
  if (message.from !== null && message.from.email !== ownEmail) return message.from;
  return message.to.find((recipient) => recipient.email !== ownEmail) ?? null;
}

async function findOneByValue(
  tx: TenantTransaction,
  objectId: string,
  attributeKey: string,
  value: string,
): Promise<HydratedRecord | undefined> {
  const page = await queryRecords(tx, {
    objectId,
    config: {
      filters: [{ attributeKey, op: 'eq', value }],
      sorts: [],
      columns: [],
    },
    limit: 1,
  });
  return page.items[0];
}

interface GraphIds {
  personObjectId: string;
  companyObjectId: string;
}

async function resolveGraphIds(tx: TenantTransaction): Promise<GraphIds> {
  const rows = await tx
    .select({ id: objectDefinitions.id, key: objectDefinitions.key })
    .from(objectDefinitions)
    .where(inArray(objectDefinitions.key, ['person', 'company']));
  const personObjectId = rows.find((row) => row.key === 'person')?.id;
  const companyObjectId = rows.find((row) => row.key === 'company')?.id;
  if (personObjectId === undefined || companyObjectId === undefined) {
    throw new GoogleError(
      'api-error',
      'This workspace has no person/company objects — reprovision the standard objects first.',
    );
  }
  return { personObjectId, companyObjectId };
}

/** Match by domain, else create "Acme" from acme.example. Consumer domains → null. */
async function ensureCompany(
  tx: TenantTransaction,
  tenantId: string,
  graph: GraphIds,
  email: string,
  counters: { companiesCreated: number },
): Promise<string | null> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (domain === undefined || CONSUMER_DOMAINS.has(domain)) return null;
  // The domain attribute is url-typed — store (and match) the canonical
  // https form so every writer agrees on one representation.
  const canonical = `https://${domain}`;
  const existing = await findOneByValue(tx, graph.companyObjectId, 'domain', canonical);
  if (existing !== undefined) return existing.id;
  const label = domain.split('.')[0] ?? domain;
  const created = await createRecord(tx, {
    tenantId,
    objectId: graph.companyObjectId,
    values: {
      name: label.charAt(0).toUpperCase() + label.slice(1),
      domain: canonical,
    },
    actor: SYSTEM_ACTOR,
  });
  counters.companiesCreated += 1;
  return created.id;
}

export async function syncGmailConnection(
  deps: GoogleSyncDeps,
  input: GmailSyncInput,
): Promise<GmailSyncResult> {
  const maxMessages = deps.maxMessages ?? 25;

  // Short transaction: cursor + fresh token. Google I/O happens outside
  // any transaction — network latency must not hold locks.
  const { accessToken, connection } = await withTenant(deps.db, input.tenantId, async (tx) => {
    const found: ConnectionSummary | undefined = (await listConnections(tx)).find(
      (candidate) => candidate.id === input.connectionId,
    );
    if (found === undefined) {
      throw new GoogleError('unknown-connection', 'No Google connection with that id exists.');
    }
    const token = await withFreshAccessToken(tx, {
      connectionId: input.connectionId,
      cipher: deps.cipher,
      oauth: deps.oauth,
    });
    return { accessToken: token, connection: found };
  });

  const client = { accessToken, fetchImpl: deps.fetchImpl };
  let mode: GmailSyncResult['mode'] = 'full';
  let ids: string[] = [];
  let cursor: string | null = connection.gmailHistoryId;

  if (connection.gmailHistoryId !== null) {
    try {
      const delta = await listAddedSince(client, connection.gmailHistoryId);
      mode = 'incremental';
      ids = delta.ids.slice(0, maxMessages);
      cursor = delta.historyId;
    } catch (error) {
      // An expired cursor restarts from a fresh full window; anything
      // else (auth, quota, transport) is the caller's to handle.
      if (!(error instanceof GoogleError) || error.code !== 'sync-token-expired') throw error;
    }
  }
  if (mode === 'full') {
    ids = (await listMessageIds(client, { maxResults: maxMessages })).ids;
  }

  const messages: GmailMessage[] = [];
  for (const id of ids) {
    messages.push(await getMessage(client, id));
  }
  if (mode === 'full' && messages.length > 0) {
    // No history response to advance from — the newest message's
    // historyId is where incremental sync picks up.
    cursor = messages.reduce(
      (max, message) => (BigInt(message.historyId) > BigInt(max) ? message.historyId : max),
      messages[0]?.historyId ?? '0',
    );
  }

  // One transaction per batch: the graph writes, the chunks, and the
  // cursor advance commit together — a crash re-syncs the same window.
  return withTenant(deps.db, input.tenantId, async (tx) => {
    const graph = await resolveGraphIds(tx);
    const counters = { indexed: 0, peopleCreated: 0, companiesCreated: 0 };
    const ownEmail = connection.email.toLowerCase();

    for (const message of messages) {
      const other = counterparty(message, ownEmail);
      if (other === null) continue; // self-addressed; nothing to anchor to

      const companyId = await ensureCompany(tx, input.tenantId, graph, other.email, counters);

      let person = await findOneByValue(tx, graph.personObjectId, 'email', other.email);
      if (person === undefined) {
        person = await createRecord(tx, {
          tenantId: input.tenantId,
          objectId: graph.personObjectId,
          values: {
            email: other.email,
            ...(other.name !== null ? { name: other.name } : {}),
            ...(companyId !== null ? { company: companyId } : {}),
          },
          actor: SYSTEM_ACTOR,
        });
        counters.peopleCreated += 1;
      } else if (companyId !== null && person.values.company === undefined) {
        // Deterministic backfill only — existing values are never
        // overwritten by sync (that is the record keeper's job, via
        // proposals).
        await updateRecordValues(tx, {
          tenantId: input.tenantId,
          recordId: person.id,
          values: { company: companyId },
          actor: SYSTEM_ACTOR,
        });
      }

      const { chunkCount } = await indexSource(tx, {
        tenantId: input.tenantId,
        sourceType: 'email',
        sourceId: uuidv5(`gmail:${connection.id}:${message.id}`, GMAIL_SOURCE_NAMESPACE),
        recordId: person.id,
        text: emailText(message),
        embedder: deps.embedder,
      });
      if (chunkCount > 0) counters.indexed += 1;
    }

    if (cursor !== null && cursor !== connection.gmailHistoryId) {
      await updateCursors(tx, { connectionId: connection.id, gmailHistoryId: cursor });
    }

    return { mode, fetched: messages.length, cursor, ...counters };
  });
}
