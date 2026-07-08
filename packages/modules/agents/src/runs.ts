/**
 * Session logs + spend accounting (TASK-0037, ai-system.md): every
 * harness run lands in `ai_runs` via the RunRecorder seam, and the
 * monthly token sum backs the tenant spend cap. The cap is a constant
 * in v1 — per-tenant configuration arrives with billing (M4).
 */
import { aiRuns, withTenant, type Database, type TenantTransaction } from '@drovano/db';
import type { RunRecorder } from '@drovano/ai';
import { and, eq, gte, sql, sum } from 'drizzle-orm';

import { AgentsError } from './errors.js';

/** v1 tenant-wide monthly token budget (all workers combined). */
export const AI_MONTHLY_TOKEN_CAP = 5_000_000;

export interface DbRunRecorderOptions {
  /** Attribute runs to an agent row when the worker acts as one. */
  agentId?: string | undefined;
}

/**
 * RunRecorder that journals into ai_runs. Recording must never fail the
 * run it describes — errors are swallowed after a best-effort insert
 * (the run itself already completed or failed on its own terms).
 */
export function createDbRunRecorder(db: Database, options: DbRunRecorderOptions = {}): RunRecorder {
  return {
    record: async (run) => {
      try {
        await withTenant(db, run.tenantId, async (tx) => {
          await tx.insert(aiRuns).values({
            tenantId: run.tenantId,
            agentId: options.agentId ?? null,
            worker: run.worker,
            model: run.model,
            steps: run.steps,
            inputTokens: run.usage.inputTokens,
            outputTokens: run.usage.outputTokens,
            totalTokens: run.usage.totalTokens,
            outcome: run.outcome,
            errorMessage: run.errorMessage ?? null,
          });
        });
      } catch {
        // Journaling is best-effort; the run outcome stands regardless.
      }
    },
  };
}

/** Total tokens consumed by the tenant since the first of this month (UTC). */
export async function spendThisMonth(tx: TenantTransaction, tenantId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sum(aiRuns.totalTokens) })
    .from(aiRuns)
    .where(
      and(eq(aiRuns.tenantId, tenantId), gte(aiRuns.createdAt, sql`date_trunc('month', now())`)),
    );
  return row?.total === null || row?.total === undefined ? 0 : Number(row.total);
}

/** Call before starting a run; throws when the tenant is over budget. */
export async function assertSpendWithinCap(
  tx: TenantTransaction,
  tenantId: string,
  cap: number = AI_MONTHLY_TOKEN_CAP,
): Promise<void> {
  const spent = await spendThisMonth(tx, tenantId);
  if (spent >= cap) {
    throw new AgentsError(
      'spend-cap-exceeded',
      `This workspace has used ${String(spent)} of its ${String(cap)} monthly AI tokens.`,
    );
  }
}
