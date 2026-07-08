/**
 * Agent principals (TASK-0037, PROJECT.md law 2): agents are identities
 * with SCOPED GRANTS, never roles. `loadAgentPrincipal` builds the
 * PrincipalContext that `can()` evaluates — the same permission path
 * humans go through, structurally.
 */
import { agentGrants, agents, writeAuditEntry, type TenantTransaction } from '@drovano/db';
import { GRANTABLE_ACTIONS, type PrincipalContext } from '@drovano/permissions';
import { asc, eq } from 'drizzle-orm';

import { AgentsError } from './errors.js';

export interface Actor {
  kind: 'human' | 'agent' | 'integration' | 'system';
  id?: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  worker: string;
  active: boolean;
  createdAt: Date;
}

export interface CreateAgentInput {
  tenantId: string;
  name: string;
  /** Worker kind, e.g. 'record-keeper', 'research-assistant'. */
  worker: string;
  actor: Actor;
}

export async function createAgent(
  tx: TenantTransaction,
  input: CreateAgentInput,
): Promise<AgentSummary> {
  const [created] = await tx
    .insert(agents)
    .values({
      tenantId: input.tenantId,
      name: input.name,
      worker: input.worker,
      createdBy: input.actor.id ?? 'system',
    })
    .returning({
      id: agents.id,
      name: agents.name,
      worker: agents.worker,
      active: agents.active,
      createdAt: agents.createdAt,
    });
  if (created === undefined) {
    throw new Error('agent insert returned no row');
  }

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'agent.create',
    resourceType: 'agent',
    resourceId: created.id,
    detail: { name: input.name, worker: input.worker },
  });

  return created;
}

export async function listAgents(tx: TenantTransaction): Promise<AgentSummary[]> {
  return tx
    .select({
      id: agents.id,
      name: agents.name,
      worker: agents.worker,
      active: agents.active,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .orderBy(asc(agents.createdAt));
}

export interface SetAgentGrantsInput {
  tenantId: string;
  agentId: string;
  /** The full grant set — replaces existing grants (idempotent). */
  actions: string[];
  actor: Actor;
}

export async function setAgentGrants(
  tx: TenantTransaction,
  input: SetAgentGrantsInput,
): Promise<void> {
  for (const action of input.actions) {
    if (!GRANTABLE_ACTIONS.has(action)) {
      throw new AgentsError(
        'invalid-grant',
        `'${action}' is not grantable to agents. Grantable: ${[...GRANTABLE_ACTIONS].join(', ')}.`,
      );
    }
  }

  const [agent] = await tx
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1);
  if (agent === undefined) {
    throw new AgentsError('unknown-agent', 'No agent with that id exists.');
  }

  await tx.delete(agentGrants).where(eq(agentGrants.agentId, input.agentId));
  if (input.actions.length > 0) {
    await tx.insert(agentGrants).values(
      input.actions.map((action) => ({
        tenantId: input.tenantId,
        agentId: input.agentId,
        action,
        grantedBy: input.actor.id ?? 'system',
      })),
    );
  }

  await writeAuditEntry(tx, {
    tenantId: input.tenantId,
    actorKind: input.actor.kind,
    ...(input.actor.id !== undefined ? { actorId: input.actor.id } : {}),
    action: 'agent.grants-set',
    resourceType: 'agent',
    resourceId: input.agentId,
    detail: { actions: input.actions },
  });
}

/** Build the PrincipalContext an agent acts as — `can()` evaluates this. */
export async function loadAgentPrincipal(
  tx: TenantTransaction,
  input: { tenantId: string; agentId: string },
): Promise<PrincipalContext> {
  const [agent] = await tx
    .select({ id: agents.id, active: agents.active })
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1);
  if (agent === undefined) {
    throw new AgentsError('unknown-agent', 'No agent with that id exists.');
  }

  // Inactive agents keep their identity but lose every grant (fail closed).
  const grants = agent.active
    ? await tx
        .select({ action: agentGrants.action })
        .from(agentGrants)
        .where(eq(agentGrants.agentId, input.agentId))
    : [];

  return {
    kind: 'agent',
    userId: input.agentId,
    tenantId: input.tenantId,
    organizationRole: null,
    workspaceRoles: new Map(),
    agentGrants: new Set(grants.map((grant) => grant.action)),
  };
}
