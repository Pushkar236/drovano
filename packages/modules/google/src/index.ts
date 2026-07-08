/**
 * @drovano/google — Google integration plumbing (TASK-0032 phase 1).
 *
 * OAuth connect + encrypted token storage + Gmail/Calendar clients
 * with resumable cursors. Mapping ingested data onto the record graph
 * composes at the app tier (modules never import modules).
 */
export {
  listConnections,
  removeConnection,
  saveConnection,
  updateCursors,
  withFreshAccessToken,
  type ConnectionSummary,
  type SaveConnectionInput,
  type UpdateCursorsInput,
} from './connections.js';
export { createTokenCipher, type TokenCipher } from './crypto.js';
export { GoogleError, type GoogleErrorCode } from './errors.js';
export {
  getMessage,
  listAddedSince,
  listMessageIds,
  parseAddress,
  parseAddressList,
  type EmailAddress,
  type GmailClientOptions,
  type GmailMessage,
} from './gmail.js';
export { listEvents, type CalendarClientOptions, type CalendarEvent } from './calendar.js';
export {
  buildAuthUrl,
  exchangeCode,
  GOOGLE_SCOPES,
  refreshAccessToken,
  type ExchangedTokens,
  type OAuthConfig,
  type RefreshedToken,
} from './oauth.js';
