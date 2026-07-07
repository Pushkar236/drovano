import type { Database } from '@drovano/db';
import { sql } from 'drizzle-orm';

export interface ProvisionTenantInput {
  /** Equals the auth-layer organization id (1:1 mapping, schema/core.ts). */
  tenantId: string;
  name: string;
  creatorUserId: string;
}

/**
 * Provisions the tenant row, default "General" workspace, creator
 * membership, and the audit entry — atomically, via the SECURITY DEFINER
 * provision_tenant() function (migration 0003). Idempotent: provisioning
 * an existing tenant is a no-op, so hook retries are safe.
 */
export async function provisionTenant(db: Database, input: ProvisionTenantInput): Promise<void> {
  await db.execute(
    sql`select provision_tenant(${input.tenantId}::uuid, ${input.name}, ${input.creatorUserId}::uuid)`,
  );
}
