import type { Database } from '@drovano/db';
import { loadPrincipalContext, type Auth } from '@drovano/identity';
import type { PrincipalContext } from '@drovano/permissions';
import { noopWebhookDispatcher, type WebhookDispatcher } from '@drovano/platform';

import { noopInvalidationPublisher, type InvalidationPublisher } from './invalidation.js';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface RequestContext {
  db: Database;
  /** Publishes coarse cache-invalidation events after mutations (ADR-0003). */
  invalidation: InvalidationPublisher;
  /** Delivers signed webhook events after record mutations (TASK-0029). */
  webhooks: WebhookDispatcher;
  session: {
    user: SessionUser;
    /** The organization the session is acting in (better-auth org plugin). */
    activeOrganizationId: string | null;
  } | null;
  /** Loaded when a session has an active organization; what `can()` evaluates. */
  principal: PrincipalContext | null;
}

export interface CreateRequestContextInput {
  db: Database;
  auth: Auth;
  headers: Headers;
  invalidation?: InvalidationPublisher;
  webhooks?: WebhookDispatcher;
}

/**
 * Per-request context: resolve the better-auth session from cookies, then
 * load the principal once (docs/architecture/system-overview.md request
 * lifecycles). Procedures never query membership themselves.
 */
export async function createRequestContext({
  db,
  auth,
  headers,
  invalidation = noopInvalidationPublisher,
  webhooks = noopWebhookDispatcher,
}: CreateRequestContextInput): Promise<RequestContext> {
  const sessionResult = await auth.api.getSession({ headers });
  if (sessionResult === null) {
    return { db, invalidation, webhooks, session: null, principal: null };
  }

  const activeOrganizationId = sessionResult.session.activeOrganizationId ?? null;
  const session = {
    user: {
      id: sessionResult.user.id,
      email: sessionResult.user.email,
      name: sessionResult.user.name,
    },
    activeOrganizationId,
  };

  const principal =
    activeOrganizationId === null
      ? null
      : await loadPrincipalContext(db, {
          userId: session.user.id,
          tenantId: activeOrganizationId,
        });

  return { db, invalidation, webhooks, session, principal };
}
