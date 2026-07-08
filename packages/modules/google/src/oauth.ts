/**
 * Google OAuth 2.0 (TASK-0032): plain fetch against the token endpoint
 * — no SDK (supply-chain posture); `fetchImpl` is injectable so tests
 * never touch the network. Read-only scopes in v1 (ai-system.md:
 * ingestion first; send/write arrives with human-gated drafting).
 */
import { z } from 'zod';

import { GoogleError } from './errors.js';

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
] as const;

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch | undefined;
}

export function buildAuthUrl(
  config: Pick<OAuthConfig, 'clientId' | 'redirectUri'>,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    // Offline + consent → Google returns a refresh token every time.
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

const TokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  scope: z.string(),
});

const UserInfoResponse = z.object({ email: z.string() });

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry of the access token. */
  expiresAt: Date;
  scope: string;
  /** The Google account the tokens belong to. */
  email: string;
}

async function postToken(
  config: OAuthConfig,
  body: Record<string, string>,
): Promise<z.infer<typeof TokenResponse>> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...body,
    }).toString(),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new GoogleError(
      'oauth-failed',
      `Google token endpoint answered ${String(response.status)}: ${JSON.stringify(payload).slice(0, 200)}`,
    );
  }
  return TokenResponse.parse(payload);
}

export async function exchangeCode(config: OAuthConfig, code: string): Promise<ExchangedTokens> {
  const tokens = await postToken(config, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  });
  if (tokens.refresh_token === undefined) {
    throw new GoogleError(
      'oauth-failed',
      'Google returned no refresh token — the consent screen must use access_type=offline.',
    );
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  const infoResponse = await fetchImpl(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoResponse.ok) {
    throw new GoogleError('oauth-failed', 'Could not read the connected account email.');
  }
  const info = UserInfoResponse.parse(await infoResponse.json());

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scope: tokens.scope,
    email: info.email,
  };
}

export interface RefreshedToken {
  accessToken: string;
  expiresAt: Date;
}

export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
): Promise<RefreshedToken> {
  try {
    const tokens = await postToken(config, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    return {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    };
  } catch (error) {
    throw new GoogleError(
      'token-refresh-failed',
      `Refreshing the Google access token failed — the user may need to reconnect. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
