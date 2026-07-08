/**
 * Pure-logic tests (no network, no database): token crypto, OAuth
 * URL/exchange, and the Gmail/Calendar response parsing — all through
 * injected fetch stubs (TESTING.md: no live external calls in CI).
 */
import { describe, expect, it } from 'vitest';

import {
  buildAuthUrl,
  createTokenCipher,
  exchangeCode,
  getMessage,
  GOOGLE_SCOPES,
  listAddedSince,
  listEvents,
  parseAddress,
  parseAddressList,
} from '../src/index.js';

const SECRET = 'integration-test-secret-at-least-32-chars-long'; // gitleaks:allow — fake

function stubFetch(routes: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (match === undefined) throw new Error(`no stub for ${url}`);
    const { status = 200, body } = match[1];
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
}

describe('token cipher', () => {
  it('round-trips and rejects tampering', () => {
    const cipher = createTokenCipher(SECRET);
    const ciphertext = cipher.encrypt('ya29.a0AfH6-token-value');
    expect(ciphertext).not.toContain('ya29');
    expect(cipher.decrypt(ciphertext)).toBe('ya29.a0AfH6-token-value');

    const [iv, tag, data] = ciphertext.split(':') as [string, string, string];
    const flipped = Buffer.from(data, 'base64');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(() => cipher.decrypt(`${iv}:${tag}:${flipped.toString('base64')}`)).toThrow();
    expect(() => createTokenCipher('short')).toThrow(/32/);
  });
});

describe('oauth', () => {
  it('builds the consent URL with offline access and all scopes', () => {
    const url = new URL(
      buildAuthUrl({ clientId: 'cid', redirectUri: 'https://app.example/cb' }, 'state-1'),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('scope')).toBe(GOOGLE_SCOPES.join(' '));
  });

  it('exchanges a code and resolves the account email', async () => {
    const fetchImpl = stubFetch({
      'https://oauth2.googleapis.com/token': {
        body: {
          access_token: 'at-1',
          refresh_token: 'rt-1',
          expires_in: 3600,
          scope: 'openid email',
        },
      },
      'https://openidconnect.googleapis.com/v1/userinfo': {
        body: { email: 'jane@acme.example' },
      },
    });
    const tokens = await exchangeCode(
      { clientId: 'cid', clientSecret: 'cs', redirectUri: 'https://app.example/cb', fetchImpl },
      'auth-code',
    );
    expect(tokens.email).toBe('jane@acme.example');
    expect(tokens.refreshToken).toBe('rt-1');
    expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('fails actionably when Google returns no refresh token', async () => {
    const fetchImpl = stubFetch({
      'https://oauth2.googleapis.com/token': {
        body: { access_token: 'at-1', expires_in: 3600, scope: 'openid' },
      },
    });
    await expect(
      exchangeCode(
        { clientId: 'cid', clientSecret: 'cs', redirectUri: 'https://x/cb', fetchImpl },
        'code',
      ),
    ).rejects.toMatchObject({ name: 'GoogleError', code: 'oauth-failed' });
  });
});

describe('gmail parsing', () => {
  it('parses addresses in every common shape', () => {
    expect(parseAddress('Jane Doe <Jane@Acme.example>')).toEqual({
      name: 'Jane Doe',
      email: 'jane@acme.example',
    });
    expect(parseAddress('"Doe, Jane" <jane@acme.example>')).toEqual({
      name: 'Doe, Jane',
      email: 'jane@acme.example',
    });
    expect(parseAddress('jane@acme.example')).toEqual({ name: null, email: 'jane@acme.example' });
    expect(parseAddress('not an address')).toBeNull();
    expect(
      parseAddressList('"Doe, Jane" <jane@acme.example>, bob@globex.example').map((a) => a.email),
    ).toEqual(['jane@acme.example', 'bob@globex.example']);
  });

  it('reads a message and the incremental history', async () => {
    const fetchImpl = stubFetch({
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1': {
        body: {
          id: 'msg-1',
          threadId: 'thr-1',
          historyId: '777',
          internalDate: '1783500000000',
          snippet: 'Quick follow-up on the proposal…',
          payload: {
            headers: [
              { name: 'From', value: 'Jane Doe <jane@acme.example>' },
              { name: 'To', value: 'sales@drovano.example' },
              { name: 'Cc', value: 'bob@globex.example' },
              { name: 'Subject', value: 'Re: proposal' },
            ],
          },
        },
      },
      'https://gmail.googleapis.com/gmail/v1/users/me/history': {
        body: {
          historyId: '900',
          history: [
            { messagesAdded: [{ message: { id: 'msg-1' } }] },
            { messagesAdded: [{ message: { id: 'msg-2' } }, { message: { id: 'msg-1' } }] },
          ],
        },
      },
    });

    const message = await getMessage({ accessToken: 'at', fetchImpl }, 'msg-1');
    expect(message.from?.email).toBe('jane@acme.example');
    expect(message.to.map((a) => a.email)).toEqual(['sales@drovano.example', 'bob@globex.example']);
    expect(message.subject).toBe('Re: proposal');
    expect(message.date.getTime()).toBe(1783500000000);

    const history = await listAddedSince({ accessToken: 'at', fetchImpl }, '777');
    expect(history.ids).toEqual(['msg-1', 'msg-2']); // deduped
    expect(history.historyId).toBe('900');
  });

  it('maps an expired history cursor to sync-token-expired', async () => {
    const fetchImpl = stubFetch({
      'https://gmail.googleapis.com/gmail/v1/users/me/history': { status: 404, body: {} },
    });
    await expect(listAddedSince({ accessToken: 'at', fetchImpl }, '1')).rejects.toMatchObject({
      code: 'sync-token-expired',
    });
  });
});

describe('calendar parsing', () => {
  it('lists events and surfaces the next sync token', async () => {
    const fetchImpl = stubFetch({
      'https://www.googleapis.com/calendar/v3/calendars/primary/events': {
        body: {
          items: [
            {
              id: 'ev-1',
              summary: 'Kickoff',
              start: { dateTime: '2026-07-09T10:00:00Z' },
              end: { dateTime: '2026-07-09T11:00:00Z' },
              attendees: [{ email: 'Jane@Acme.example', displayName: 'Jane' }],
            },
            { id: 'ev-2', status: 'cancelled' },
          ],
          nextSyncToken: 'sync-2',
        },
      },
    });
    const result = await listEvents({ accessToken: 'at', fetchImpl });
    expect(result.events.map((e) => e.id)).toEqual(['ev-1', 'ev-2']);
    expect(result.events[0]?.attendees).toEqual([{ email: 'jane@acme.example', name: 'Jane' }]);
    expect(result.events[1]?.status).toBe('cancelled');
    expect(result.nextSyncToken).toBe('sync-2');
  });

  it('maps 410 GONE to sync-token-expired', async () => {
    const fetchImpl = stubFetch({
      'https://www.googleapis.com/calendar/v3/calendars/primary/events': {
        status: 410,
        body: {},
      },
    });
    await expect(
      listEvents({ accessToken: 'at', fetchImpl }, { syncToken: 'old' }),
    ).rejects.toMatchObject({ code: 'sync-token-expired' });
  });
});
