/**
 * The thin tool loop (ADR-0010): a bounded generateText run over typed
 * tools. Deliberately NOT a framework — workers compose this inside
 * Trigger.dev durable steps; orchestration stays in code we own.
 *
 * Every run is recorded (who, which worker, which model, tokens,
 * outcome) through RunRecorder — the seam TASK-0037's session logs and
 * spend accounting plug into. Caps are per-run hard limits: maxSteps
 * bounds tool iterations, maxOutputTokens bounds each generation.
 */
import { generateText, stepCountIs, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';

export interface RunInfo {
  tenantId: string;
  /** Worker identity, e.g. 'record-keeper', 'research-assistant'. */
  worker: string;
  /** Agent principal id once TASK-0037 lands; absent for system runs. */
  actorId?: string | undefined;
}

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface RunRecord extends RunInfo {
  model: string;
  steps: number;
  usage: RunUsage;
  outcome: 'completed' | 'error';
  errorMessage?: string | undefined;
}

export interface RunRecorder {
  record: (run: RunRecord) => Promise<void>;
}

/** Default for tests and not-yet-wired contexts. */
export const noopRunRecorder: RunRecorder = {
  record: () => Promise.resolve(),
};

export interface ToolLoopInput {
  model: LanguageModel;
  run: RunInfo;
  system?: string | undefined;
  prompt?: string | undefined;
  messages?: ModelMessage[] | undefined;
  tools?: ToolSet | undefined;
  /** Hard cap on tool-loop iterations (spend guard, ai-system.md). */
  maxSteps?: number;
  /** Hard cap per generation (spend guard). */
  maxOutputTokens?: number;
  recorder?: RunRecorder;
  abortSignal?: AbortSignal | undefined;
}

export interface ToolLoopResult {
  text: string;
  steps: number;
  usage: RunUsage;
  finishReason: string;
}

function modelName(model: LanguageModel): string {
  return typeof model === 'string' ? model : model.modelId;
}

function toRunUsage(usage: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
}): RunUsage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

export async function runToolLoop(input: ToolLoopInput): Promise<ToolLoopResult> {
  const {
    model,
    run,
    system,
    prompt,
    messages,
    tools,
    maxSteps = 8,
    maxOutputTokens = 4096,
    recorder = noopRunRecorder,
    abortSignal,
  } = input;

  try {
    const shared = {
      model,
      stopWhen: stepCountIs(maxSteps),
      maxOutputTokens,
      ...(system !== undefined ? { system } : {}),
      ...(tools !== undefined ? { tools } : {}),
      ...(abortSignal !== undefined ? { abortSignal } : {}),
    };
    const result =
      messages !== undefined
        ? await generateText({ ...shared, messages })
        : await generateText({ ...shared, prompt: prompt ?? '' });

    const usage = toRunUsage(result.usage);
    await recorder.record({
      ...run,
      model: modelName(model),
      steps: result.steps.length,
      usage,
      outcome: 'completed',
    });

    return {
      text: result.text,
      steps: result.steps.length,
      usage,
      finishReason: result.finishReason,
    };
  } catch (error) {
    await recorder.record({
      ...run,
      model: modelName(model),
      steps: 0,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      outcome: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
