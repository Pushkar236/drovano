import { describe, expect, it } from 'vitest';

import { can, type Action, type OrganizationRole, type PrincipalContext } from './service.js';

const WORKSPACE = '0197a000-0000-7000-8000-000000000001';
const OTHER_WORKSPACE = '0197a000-0000-7000-8000-000000000002';

function humanPrincipal(
  organizationRole: OrganizationRole | null,
  workspaceRoles: ReadonlyMap<string, 'admin' | 'member'> = new Map(),
): PrincipalContext {
  return {
    kind: 'human',
    userId: '0197a000-0000-7000-8000-00000000000a',
    tenantId: '0197a000-0000-7000-8000-00000000000b',
    organizationRole,
    workspaceRoles,
  };
}

/**
 * The exhaustive allow/deny matrix (TESTING.md rule 5). Every action is
 * asserted for every org role — additions to Action that miss a row here
 * fail the completeness check at the bottom.
 */
const ACTIONS: Action[] = [
  { type: 'organization.update' },
  { type: 'organization.delete' },
  { type: 'organization.invite-member' },
  { type: 'organization.remove-member', targetRole: 'member' },
  { type: 'organization.remove-member', targetRole: 'owner' },
  { type: 'workspace.create' },
  { type: 'workspace.view', workspaceId: WORKSPACE },
  { type: 'workspace.update', workspaceId: WORKSPACE },
  { type: 'workspace.delete', workspaceId: WORKSPACE },
  { type: 'workspace.manage-members', workspaceId: WORKSPACE },
  { type: 'record.view' },
  { type: 'record.create' },
  { type: 'record.update' },
  { type: 'record.delete' },
  { type: 'object.manage' },
  { type: 'list.create' },
  { type: 'api.manage' },
];

type MatrixKey = string;
const key = (action: Action): MatrixKey =>
  'targetRole' in action ? `${action.type}:${action.targetRole}` : action.type;

// organizationRole → actionKey → expected allowed (workspace role: none).
const ORG_ROLE_MATRIX: Record<'owner' | 'admin' | 'member', Record<MatrixKey, boolean>> = {
  owner: {
    'organization.update': true,
    'organization.delete': true,
    'organization.invite-member': true,
    'organization.remove-member:member': true,
    'organization.remove-member:owner': true,
    'workspace.create': true,
    'workspace.view': true,
    'workspace.update': true,
    'workspace.delete': true,
    'workspace.manage-members': true,
    'record.view': true,
    'record.create': true,
    'record.update': true,
    'record.delete': true,
    'object.manage': true,
    'list.create': true,
    'api.manage': true,
  },
  admin: {
    'organization.update': true,
    'organization.delete': false,
    'organization.invite-member': true,
    'organization.remove-member:member': true,
    'organization.remove-member:owner': false,
    'workspace.create': true,
    'workspace.view': true,
    'workspace.update': true,
    'workspace.delete': true,
    'workspace.manage-members': true,
    'record.view': true,
    'record.create': true,
    'record.update': true,
    'record.delete': true,
    'object.manage': true,
    'list.create': true,
    'api.manage': true,
  },
  member: {
    'organization.update': false,
    'organization.delete': false,
    'organization.invite-member': false,
    'organization.remove-member:member': false,
    'organization.remove-member:owner': false,
    'workspace.create': false,
    'workspace.view': false, // not a member of the workspace in this matrix
    'workspace.update': false,
    'workspace.delete': false,
    'workspace.manage-members': false,
    'record.view': true, // working the graph is every member's job
    'record.create': true,
    'record.update': true,
    'record.delete': false,
    'object.manage': false,
    'list.create': true, // lists are a member-level workflow tool
    'api.manage': false, // standing tenant-wide access is a manager concern
  },
};

describe('permission matrix by organization role (no workspace membership)', () => {
  for (const [role, expectations] of Object.entries(ORG_ROLE_MATRIX)) {
    for (const action of ACTIONS) {
      const expected = expectations[key(action)];
      it(`${role} → ${key(action)} = ${expected ? 'allow' : 'deny'}`, () => {
        const decision = can(humanPrincipal(role as OrganizationRole), action);
        expect(decision.allowed).toBe(expected);
        expect(decision.reason.length).toBeGreaterThan(0);
      });
    }
  }

  it('the matrix covers every action shape (completeness check)', () => {
    const covered = new Set(ACTIONS.map(key));
    for (const expectations of Object.values(ORG_ROLE_MATRIX)) {
      expect(new Set(Object.keys(expectations))).toEqual(covered);
    }
  });
});

describe('workspace-role refinements for org members', () => {
  it('workspace member: view yes, manage no', () => {
    const principal = humanPrincipal('member', new Map([[WORKSPACE, 'member']]));
    expect(can(principal, { type: 'workspace.view', workspaceId: WORKSPACE }).allowed).toBe(true);
    expect(can(principal, { type: 'workspace.update', workspaceId: WORKSPACE }).allowed).toBe(
      false,
    );
    expect(
      can(principal, { type: 'workspace.manage-members', workspaceId: WORKSPACE }).allowed,
    ).toBe(false);
  });

  it('workspace admin: view/update/manage-members yes; delete stays org-level', () => {
    const principal = humanPrincipal('member', new Map([[WORKSPACE, 'admin']]));
    expect(can(principal, { type: 'workspace.view', workspaceId: WORKSPACE }).allowed).toBe(true);
    expect(can(principal, { type: 'workspace.update', workspaceId: WORKSPACE }).allowed).toBe(true);
    expect(
      can(principal, { type: 'workspace.manage-members', workspaceId: WORKSPACE }).allowed,
    ).toBe(true);
    expect(can(principal, { type: 'workspace.delete', workspaceId: WORKSPACE }).allowed).toBe(
      false,
    );
  });

  it('roles never leak across workspaces', () => {
    const principal = humanPrincipal('member', new Map([[WORKSPACE, 'admin']]));
    expect(can(principal, { type: 'workspace.view', workspaceId: OTHER_WORKSPACE }).allowed).toBe(
      false,
    );
    expect(can(principal, { type: 'workspace.update', workspaceId: OTHER_WORKSPACE }).allowed).toBe(
      false,
    );
  });
});

describe('fail-closed defaults', () => {
  it('non-members of the organization are denied everything', () => {
    for (const action of ACTIONS) {
      expect(can(humanPrincipal(null), action).allowed).toBe(false);
    }
  });

  it('agent principals are denied everything until scoped grants exist (TASK-0037)', () => {
    const agent: PrincipalContext = {
      kind: 'agent',
      userId: '0197a000-0000-7000-8000-00000000000c',
      tenantId: '0197a000-0000-7000-8000-00000000000b',
      organizationRole: 'admin', // even a (mis)assigned role must not grant
      workspaceRoles: new Map([[WORKSPACE, 'admin']]),
    };
    for (const action of ACTIONS) {
      const decision = can(agent, action);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('TASK-0037');
    }
  });
});
