/**
 * Stub-model helpers for CI (TESTING.md AI rules: no live model calls in
 * tests). Wraps ai/test's MockLanguageModelV4 with the two shapes our
 * suites need: a plain text reply, and a tool call followed by a final
 * reply. Each generate result consumes one queued response.
 */
import { MockLanguageModelV4 } from 'ai/test';

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

function stubUsage(): GenerateResult['usage'] {
  return {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  };
}

export function textResponse(text: string): GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: stubUsage(),
    warnings: [],
  };
}

export function toolCallResponse(toolName: string, input: unknown): GenerateResult {
  return {
    content: [
      {
        type: 'tool-call',
        toolCallId: `call-${toolName}`,
        toolName,
        input: JSON.stringify(input),
      },
    ],
    finishReason: { unified: 'tool-calls', raw: 'tool_use' },
    usage: stubUsage(),
    warnings: [],
  };
}

/** A language model that replays the queued results in order. */
export function createStubLanguageModel(
  responses: GenerateResult[],
  modelId = 'stub-model',
): MockLanguageModelV4 {
  return new MockLanguageModelV4({ modelId, doGenerate: responses });
}
