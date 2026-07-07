import { members, withTenant, workspaceMembers, type Database } from '@drovano/db';
import type { OrganizationRole, PrincipalContext, WorkspaceRole } from '@drovano/permissions';
import { and, eq } from 'drizzle-orm';

const ORGANIZATION_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'member'];

function asOrganizationRole(role: string | undefined): OrganizationRole | null {
  return role !== undefined && (ORGANIZATION_ROLES as readonly string[]).includes(role)
    ? (role as OrganizationRole)
    : null;
}

export interface LoadPrincipalInput {
  userId: string;
  tenantId: string;
}

/**
 * Loads the PrincipalContext the permission service evaluates
 * (packages/permissions README): org role from the identity layer's
 * membership, workspace roles from the tenant-scoped edge. Called once
 * per request at context creation; `can()` stays pure.
 */
export async function loadPrincipalContext(
  db: Database,
  { userId, tenantId }: LoadPrincipalInput,
): Promise<PrincipalContext> {
  const [membership] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.organizationId, tenantId)))
    .limit(1);
  const organizationRole = asOrganizationRole(membership?.role);

  const workspaceRoles = new Map<string, WorkspaceRole>();
  if (organizationRole !== null) {
    const rows = await withTenant(db, tenantId, (tx) =>
      tx
        .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, userId)),
    );
    for (const row of rows) {
      workspaceRoles.set(row.workspaceId, row.role);
    }
  }

  return { kind: 'human', userId, tenantId, organizationRole, workspaceRoles };
}
