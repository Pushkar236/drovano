/**
 * Connection storage (TASK-0032): tokens rest encrypted; sync cursors
 * make ingestion resumable. `withFreshAccessToken` is the single entry
 * point API clients use — it refreshes (and persists) the access token
 * when it is close to expiry.
 */
import { googleConnections, type TenantTransaction } from '@drovano/db';
import { asc, eq } from 'drizzle-orm';

import type { TokenCipher } from './crypto.js';
import { GoogleError } from './errors.js';
import { refreshAccessToken, type ExchangedTokens, type OAuthConfig } from './oauth.js';

export interface ConnectionSummary {
  id: string;
  email: string;
  userId: string;
  scope: string;
  gmailHistoryId: string | null;
  calendarSyncToken: string | null;
  createdAt: Date;
}

export interface SaveConnectionInput {
  tenantId: string;
  userId: string;
  tokens: ExchangedTokens;
  cipher: TokenCipher;
}

/** Insert or replace the connection for (tenant, google account). */
export async function saveConnection(
  tx: TenantTransaction,
  input: SaveConnectionInput,
): Promise<ConnectionSummary> {
  const values = {
    tenantId: input.tenantId,
    userId: input.userId,
    email: input.tokens.email,
    accessTokenEnc: input.cipher.encrypt(input.tokens.accessToken),
    refreshTokenEnc: input.cipher.encrypt(input.tokens.refreshToken),
    accessTokenExpiresAt: input.tokens.expiresAt,
    scope: input.tokens.scope,
  };
  const [row] = await tx
    .insert(googleConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [googleConnections.tenantId, googleConnections.email],
      set: {
        userId: values.userId,
        accessTokenEnc: values.accessTokenEnc,
        refreshTokenEnc: values.refreshTokenEnc,
        accessTokenExpiresAt: values.accessTokenExpiresAt,
        scope: values.scope,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: googleConnections.id,
      email: googleConnections.email,
      userId: googleConnections.userId,
      scope: googleConnections.scope,
      gmailHistoryId: googleConnections.gmailHistoryId,
      calendarSyncToken: googleConnections.calendarSyncToken,
      createdAt: googleConnections.createdAt,
    });
  if (row === undefined) throw new Error('connection upsert returned no row');
  return row;
}

export async function listConnections(tx: TenantTransaction): Promise<ConnectionSummary[]> {
  return tx
    .select({
      id: googleConnections.id,
      email: googleConnections.email,
      userId: googleConnections.userId,
      scope: googleConnections.scope,
      gmailHistoryId: googleConnections.gmailHistoryId,
      calendarSyncToken: googleConnections.calendarSyncToken,
      createdAt: googleConnections.createdAt,
    })
    .from(googleConnections)
    .orderBy(asc(googleConnections.createdAt));
}

export async function removeConnection(tx: TenantTransaction, connectionId: string): Promise<void> {
  await tx.delete(googleConnections).where(eq(googleConnections.id, connectionId));
}

export interface UpdateCursorsInput {
  connectionId: string;
  gmailHistoryId?: string | undefined;
  calendarSyncToken?: string | undefined;
}

export async function updateCursors(
  tx: TenantTransaction,
  input: UpdateCursorsInput,
): Promise<void> {
  await tx
    .update(googleConnections)
    .set({
      ...(input.gmailHistoryId !== undefined ? { gmailHistoryId: input.gmailHistoryId } : {}),
      ...(input.calendarSyncToken !== undefined
        ? { calendarSyncToken: input.calendarSyncToken }
        : {}),
    })
    .where(eq(googleConnections.id, input.connectionId));
}

/** Refresh margin: tokens this close to expiry are renewed first. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * Returns a currently-valid access token for the connection, refreshing
 * and persisting it when needed.
 */
export async function withFreshAccessToken(
  tx: TenantTransaction,
  input: { connectionId: string; cipher: TokenCipher; oauth: OAuthConfig },
): Promise<string> {
  const [row] = await tx
    .select({
      accessTokenEnc: googleConnections.accessTokenEnc,
      refreshTokenEnc: googleConnections.refreshTokenEnc,
      accessTokenExpiresAt: googleConnections.accessTokenExpiresAt,
    })
    .from(googleConnections)
    .where(eq(googleConnections.id, input.connectionId))
    .limit(1);
  if (row === undefined) {
    throw new GoogleError('unknown-connection', 'No Google connection with that id exists.');
  }

  if (row.accessTokenExpiresAt.getTime() - Date.now() > EXPIRY_MARGIN_MS) {
    return input.cipher.decrypt(row.accessTokenEnc);
  }

  const refreshed = await refreshAccessToken(
    input.oauth,
    input.cipher.decrypt(row.refreshTokenEnc),
  );
  await tx
    .update(googleConnections)
    .set({
      accessTokenEnc: input.cipher.encrypt(refreshed.accessToken),
      accessTokenExpiresAt: refreshed.expiresAt,
    })
    .where(eq(googleConnections.id, input.connectionId));
  return refreshed.accessToken;
}
