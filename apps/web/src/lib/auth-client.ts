import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * better-auth browser client (ADR-0008). Same-origin: dev uses the Vite
 * proxy; production serves app + api behind one domain so session cookies
 * stay first-party.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
