/**
 * Google Calendar REST client (TASK-0032): incremental sync via
 * syncToken; a 410 GONE means the token expired and the caller does a
 * full resync. Plain fetch, injectable.
 */
import { z } from 'zod';

import { GoogleError } from './errors.js';

const BASE = 'https://www.googleapis.com/calendar/v3';

export interface CalendarClientOptions {
  accessToken: string;
  fetchImpl?: typeof fetch | undefined;
}

const EventTime = z.object({
  dateTime: z.string().optional(),
  date: z.string().optional(),
});

const EventsResponse = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        status: z.string().optional(),
        summary: z.string().optional(),
        start: EventTime.optional(),
        end: EventTime.optional(),
        attendees: z
          .array(z.object({ email: z.string(), displayName: z.string().optional() }))
          .optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
  nextSyncToken: z.string().optional(),
});

export interface CalendarEvent {
  id: string;
  status: string;
  summary: string;
  start: Date | null;
  end: Date | null;
  attendees: { email: string; name: string | null }[];
}

function toDate(time: z.infer<typeof EventTime> | undefined): Date | null {
  if (time?.dateTime !== undefined) return new Date(time.dateTime);
  if (time?.date !== undefined) return new Date(`${time.date}T00:00:00Z`);
  return null;
}

/**
 * Lists primary-calendar events. Pass `syncToken` for incremental sync;
 * omit it for the initial window (from `timeMin`, default: 30 days
 * back). Returns the events plus the next sync token to store.
 */
export async function listEvents(
  options: CalendarClientOptions,
  input: { syncToken?: string | undefined; timeMin?: Date | undefined } = {},
): Promise<{ events: CalendarEvent[]; nextSyncToken: string | null }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const params = new URLSearchParams({ singleEvents: 'true', maxResults: '250' });
    if (input.syncToken !== undefined) {
      params.set('syncToken', input.syncToken);
    } else {
      const timeMin = input.timeMin ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      params.set('timeMin', timeMin.toISOString());
    }
    if (pageToken !== undefined) params.set('pageToken', pageToken);

    const response = await fetchImpl(`${BASE}/calendars/primary/events?${params.toString()}`, {
      headers: { authorization: `Bearer ${options.accessToken}` },
    });
    if (response.status === 410) {
      throw new GoogleError(
        'sync-token-expired',
        'Calendar sync token expired — full resync needed.',
      );
    }
    if (!response.ok) {
      throw new GoogleError('api-error', `Calendar API answered ${String(response.status)}.`);
    }
    const payload = EventsResponse.parse(await response.json());
    for (const item of payload.items ?? []) {
      events.push({
        id: item.id,
        status: item.status ?? 'confirmed',
        summary: item.summary ?? '',
        start: toDate(item.start),
        end: toDate(item.end),
        attendees: (item.attendees ?? []).map((attendee) => ({
          email: attendee.email.toLowerCase(),
          name: attendee.displayName ?? null,
        })),
      });
    }
    pageToken = payload.nextPageToken;
    nextSyncToken = payload.nextSyncToken ?? nextSyncToken;
  } while (pageToken !== undefined);

  return { events, nextSyncToken };
}
