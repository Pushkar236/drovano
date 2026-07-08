/**
 * Eval scaffolding (TASK-0036, TESTING.md AI rules): scenarios are the
 * unit of AI evaluation. In CI they run against stubbed models (no live
 * calls, no cost, deterministic); the same definitions run against real
 * models on a schedule once keys exist. A scenario owns its setup and
 * its judgment — the runner only reports.
 */

export interface ScenarioDefinition<Result> {
  name: string;
  run: () => Promise<Result>;
  /** Throw (expect(), assert) to fail the scenario. */
  assert: (result: Result) => void | Promise<void>;
}

export interface Scenario {
  name: string;
  /** Runs the scenario and its assertion; throws on failure. */
  execute: () => Promise<void>;
}

export interface ScenarioOutcome {
  name: string;
  passed: boolean;
  errorMessage?: string | undefined;
  durationMs: number;
}

export function defineScenario<Result>(definition: ScenarioDefinition<Result>): Scenario {
  return {
    name: definition.name,
    execute: async () => {
      await definition.assert(await definition.run());
    },
  };
}

export async function runScenarios(scenarios: readonly Scenario[]): Promise<ScenarioOutcome[]> {
  const outcomes: ScenarioOutcome[] = [];
  for (const scenario of scenarios) {
    const startedAt = performance.now();
    try {
      await scenario.execute();
      outcomes.push({
        name: scenario.name,
        passed: true,
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      outcomes.push({
        name: scenario.name,
        passed: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: performance.now() - startedAt,
      });
    }
  }
  return outcomes;
}
