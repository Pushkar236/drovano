/**
 * @drovano/agents — agent trust infrastructure (TASK-0037).
 *
 * Agents are first-class principals with scoped grants; their writes
 * are provisional proposals until a human accepts them; every harness
 * run is journaled to ai_runs and counted against the tenant spend cap.
 */
export { AgentsError, type AgentsErrorCode } from './errors.js';
export {
  createAgent,
  listAgents,
  loadAgentPrincipal,
  setAgentGrants,
  type Actor,
  type AgentSummary,
  type CreateAgentInput,
  type SetAgentGrantsInput,
} from './agents.js';
export {
  createProposal,
  listProposals,
  reviewProposal,
  type CreateProposalInput,
  type ListProposalsInput,
  type ProposalSummary,
  type ProposedValue,
  type ReviewProposalInput,
} from './proposals.js';
export {
  AI_MONTHLY_TOKEN_CAP,
  assertSpendWithinCap,
  createDbRunRecorder,
  spendThisMonth,
  type DbRunRecorderOptions,
} from './runs.js';
