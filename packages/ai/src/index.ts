export {
  AiDisabledError,
  createModelRouter,
  type ModelRouter,
  type ModelRouterEnv,
  type ModelRouterOverrides,
  type ModelTier,
} from './router.js';
export {
  noopRunRecorder,
  runToolLoop,
  type RunInfo,
  type RunRecord,
  type RunRecorder,
  type RunUsage,
  type ToolLoopInput,
  type ToolLoopResult,
} from './loop.js';
export {
  defineScenario,
  runScenarios,
  type Scenario,
  type ScenarioDefinition,
  type ScenarioOutcome,
} from './scenario.js';
// Re-export the AI SDK's tool helper so workers define typed tools
// without importing 'ai' directly (single upgrade point).
export { tool } from 'ai';
