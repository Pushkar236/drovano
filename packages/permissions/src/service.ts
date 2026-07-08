/**
 * The centralized permission service (SECURITY.md non-negotiable #6;
 * docs/architecture/data-model.md §5). Every access path — tRPC, public
 * API, automations, AI workers — consults `can()`; no module implements
 * its own role checks.
 *
 * Deliberately pure and framework-free (CODING_STANDARDS.md): callers
 * load the principal's memberships (one query at session resolution) and
 * this package only evaluates. That keeps decisions unit-testable as an
 * exhaustive matrix and cacheable per request.
 *
 * Deny-by-default: anything not explicitly allowed here is denied, and
 * every decision carries a reason for audit logs and error messages.
 */

/** Org-level roles, as persisted by the identity module (better-auth members). */
export type OrganizationRole = 'owner' | 'admin' | 'member';

/** Workspace-level roles (workspace_members.role). */
export type WorkspaceRole = 'admin' | 'member';

export interface PrincipalContext {
  /**
   * Agents are first-class principals (PROJECT.md law 2) but hold scoped
   * grants, not roles. Until the grant system lands (M3, TASK-0037),
   * agents are denied everything — fail closed, never pseudo-human.
   */
  kind: 'human' | 'agent';
  userId: string;
  tenantId: string;
  organizationRole: OrganizationRole | null;
  /** workspaceId → role, for workspaces the principal is a member of. */
  workspaceRoles: ReadonlyMap<string, WorkspaceRole>;
}

export type Action =
  | { type: 'organization.update' }
  | { type: 'organization.delete' }
  | { type: 'organization.invite-member' }
  | { type: 'organization.remove-member'; targetRole: OrganizationRole }
  | { type: 'workspace.create' }
  | { type: 'workspace.view'; workspaceId: string }
  | { type: 'workspace.update'; workspaceId: string }
  | { type: 'workspace.delete'; workspaceId: string }
  | { type: 'workspace.manage-members'; workspaceId: string }
  // The object graph (M2): records are tenant-level; record-/object-level
  // grants are the post-v1 seam (data-model.md §5).
  | { type: 'record.view' }
  | { type: 'record.create' }
  | { type: 'record.update' }
  | { type: 'record.delete' }
  | { type: 'object.manage' }
  // Lists are a member-level workflow tool (Attio model); entry mutations
  // ride record.update semantics in the routers.
  | { type: 'list.create' }
  // Platform surface (TASK-0029): API keys and webhooks grant standing
  // programmatic access to the whole tenant — an admin concern.
  | { type: 'api.manage' };

export interface Decision {
  allowed: boolean;
  /** Human-readable, audit-suitable explanation of the decision. */
  reason: string;
}

const allow = (reason: string): Decision => ({ allowed: true, reason });
const deny = (reason: string): Decision => ({ allowed: false, reason });

function isOrganizationManager(principal: PrincipalContext): boolean {
  return principal.organizationRole === 'owner' || principal.organizationRole === 'admin';
}

export function can(principal: PrincipalContext, action: Action): Decision {
  if (principal.kind === 'agent') {
    return deny('agent principals have no grants yet (scoped grants land in M3, TASK-0037)');
  }
  if (principal.organizationRole === null) {
    return deny('principal is not a member of this organization');
  }

  switch (action.type) {
    case 'organization.update':
    case 'organization.invite-member':
      return isOrganizationManager(principal)
        ? allow(`organization ${principal.organizationRole} may ${action.type}`)
        : deny(`organization members may not ${action.type}`);

    case 'organization.delete':
      return principal.organizationRole === 'owner'
        ? allow('organization owner may delete the organization')
        : deny('only the organization owner may delete the organization');

    case 'organization.remove-member':
      if (action.targetRole === 'owner') {
        return principal.organizationRole === 'owner'
          ? allow('an owner may remove another owner')
          : deny('only an owner may remove an owner');
      }
      return isOrganizationManager(principal)
        ? allow(`organization ${principal.organizationRole} may remove a ${action.targetRole}`)
        : deny('organization members may not remove members');

    case 'workspace.create':
      // Opinionated default (PRD §2): workspace topology is an admin
      // concern; members work inside workspaces, they don't mint them.
      return isOrganizationManager(principal)
        ? allow(`organization ${principal.organizationRole} may create workspaces`)
        : deny('only organization owners/admins may create workspaces');

    case 'workspace.delete':
      return isOrganizationManager(principal)
        ? allow(`organization ${principal.organizationRole} may delete workspaces`)
        : deny('only organization owners/admins may delete workspaces');

    case 'workspace.view': {
      if (isOrganizationManager(principal)) {
        return allow(`organization ${principal.organizationRole} may view all workspaces`);
      }
      return principal.workspaceRoles.has(action.workspaceId)
        ? allow('workspace member may view the workspace')
        : deny('principal is not a member of this workspace');
    }

    case 'record.view':
    case 'record.create':
    case 'record.update':
    case 'list.create':
      // Working the graph is every member's job (PRD §2 personas).
      return allow(`organization ${principal.organizationRole} may ${action.type}`);

    case 'record.delete':
      // Destructive: managers only until record-level grants exist.
      return isOrganizationManager(principal)
        ? allow(`organization ${principal.organizationRole} may delete records`)
        : deny('only organization owners/admins may delete records');

    case 'object.manage':
      // Schema shape is an admin concern (opinionated default, PRD §2).
      return isOrganizationManager(principal)
        ? allow(`organization ${principal.organizationRole} may manage object definitions`)
        : deny('only organization owners/admins may manage object definitions');

    case 'api.manage':
      // Keys/webhooks are standing tenant-wide access: managers only.
      return isOrganizationManager(principal)
        ? allow(`organization ${principal.organizationRole} may manage API keys and webhooks`)
        : deny('only organization owners/admins may manage API keys and webhooks');

    case 'workspace.update':
    case 'workspace.manage-members': {
      if (isOrganizationManager(principal)) {
        return allow(`organization ${principal.organizationRole} may ${action.type}`);
      }
      return principal.workspaceRoles.get(action.workspaceId) === 'admin'
        ? allow(`workspace admin may ${action.type}`)
        : deny(`only workspace admins may ${action.type}`);
    }
  }
}
