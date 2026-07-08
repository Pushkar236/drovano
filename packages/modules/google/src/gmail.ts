/**
 * Gmail REST client (TASK-0032): metadata-format reads (headers +
 * snippet — v1 ingestion needs senders/recipients/subjects, not full
 * bodies), resumable via the history API. Plain fetch, injectable.
 */
import { z } from 'zod';

import { GoogleError } from './errors.js';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailClientOptions {
  accessToken: string;
  fetchImpl?: typeof fetch | undefined;
}

async function gmailGet(options: GmailClientOptions, path: string): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${options.accessToken}` },
  });
  if (!response.ok) {
    throw new GoogleError(
      'api-error',
      `Gmail API answered ${String(response.status)} for ${path.split('?')[0] ?? path}.`,
    );
  }
  return response.json();
}

export interface EmailAddress {
  name: string | null;
  email: string;
}

/** 'Jane Doe <jane@acme.example>' | 'jane@acme.example' → parts. */
export function parseAddress(raw: string): EmailAddress | null {
  const bracketed = /^\s*"?([^"<]*?)"?\s*<([^>\s]+@[^>\s]+)>\s*$/.exec(raw);
  if (bracketed?.[2] !== undefined) {
    const name = bracketed[1]?.trim() ?? '';
    return { name: name === '' ? null : name, email: bracketed[2].toLowerCase() };
  }
  const bare = /^\s*([^\s@]+@[^\s@]+)\s*$/.exec(raw);
  if (bare?.[1] !== undefined) {
    return { name: null, email: bare[1].toLowerCase() };
  }
  return null;
}

export function parseAddressList(raw: string): EmailAddress[] {
  // Split on commas not inside quoted display names.
  return (raw.match(/(?:"[^"]*"|[^,])+/g) ?? [])
    .map((part) => parseAddress(part))
    .filter((address): address is EmailAddress => address !== null);
}

const MessageListResponse = z.object({
  messages: z.array(z.object({ id: z.string() })).optional(),
  nextPageToken: z.string().optional(),
});

/** First (full) sync: newest message ids, newest first. */
export async function listMessageIds(
  options: GmailClientOptions,
  input: { maxResults?: number | undefined; pageToken?: string | undefined } = {},
): Promise<{ ids: string[]; nextPageToken: string | undefined }> {
  const params = new URLSearchParams({ maxResults: String(input.maxResults ?? 50) });
  if (input.pageToken !== undefined) params.set('pageToken', input.pageToken);
  const payload = MessageListResponse.parse(
    await gmailGet(options, `/messages?${params.toString()}`),
  );
  return {
    ids: (payload.messages ?? []).map((message) => message.id),
    nextPageToken: payload.nextPageToken,
  };
}

const HistoryResponse = z.object({
  historyId: z.string(),
  history: z
    .array(
      z.object({
        messagesAdded: z.array(z.object({ message: z.object({ id: z.string() }) })).optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

/**
 * Incremental sync: message ids ADDED since the stored cursor, plus the
 * new cursor. A 404 means the cursor is too old — restart full sync.
 */
export async function listAddedSince(
  options: GmailClientOptions,
  startHistoryId: string,
): Promise<{ ids: string[]; historyId: string }> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let historyId = startHistoryId;
  do {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
    });
    if (pageToken !== undefined) params.set('pageToken', pageToken);
    let payload;
    try {
      payload = HistoryResponse.parse(await gmailGet(options, `/history?${params.toString()}`));
    } catch (error) {
      if (error instanceof GoogleError && error.message.includes('404')) {
        throw new GoogleError('sync-token-expired', 'Gmail history expired — full resync needed.');
      }
      throw error;
    }
    historyId = payload.historyId;
    for (const entry of payload.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        ids.push(added.message.id);
      }
    }
    pageToken = payload.nextPageToken;
  } while (pageToken !== undefined);
  return { ids: [...new Set(ids)], historyId };
}

const MessageResponse = z.object({
  id: z.string(),
  threadId: z.string(),
  historyId: z.string(),
  internalDate: z.string(),
  snippet: z.string().optional(),
  payload: z
    .object({
      headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    })
    .optional(),
});

export interface GmailMessage {
  id: string;
  threadId: string;
  historyId: string;
  date: Date;
  from: EmailAddress | null;
  to: EmailAddress[];
  subject: string;
  snippet: string;
}

export async function getMessage(
  options: GmailClientOptions,
  messageId: string,
): Promise<GmailMessage> {
  const params = new URLSearchParams({ format: 'metadata' });
  for (const header of ['From', 'To', 'Cc', 'Subject']) {
    params.append('metadataHeaders', header);
  }
  const payload = MessageResponse.parse(
    await gmailGet(options, `/messages/${messageId}?${params.toString()}`),
  );
  const headers = new Map(
    (payload.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]),
  );
  const to = [
    ...parseAddressList(headers.get('to') ?? ''),
    ...parseAddressList(headers.get('cc') ?? ''),
  ];
  return {
    id: payload.id,
    threadId: payload.threadId,
    historyId: payload.historyId,
    date: new Date(Number(payload.internalDate)),
    from: parseAddress(headers.get('from') ?? ''),
    to,
    subject: headers.get('subject') ?? '',
    snippet: payload.snippet ?? '',
  };
}
