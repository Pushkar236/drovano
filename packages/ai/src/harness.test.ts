import { tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  AiDisabledError,
  createModelRouter,
  defineScenario,
  noopRunRecorder,
  runScenarios,
  runToolLoop,
  type RunRecord,
} from './index.js';
import { createStubLanguageModel, textResponse, toolCallResponse } from './testing.js';

const RUN = { tenantId: '0197a000-0000-7000-8000-000000000001', worker: 'test-worker' };

describe('model router', () => {
  it('is disabled without keys and throws actionable errors', () => {
    const router = createModelRouter({});
    expect(router.languageEnabled).toBe(false);
    expect(router.embeddingsEnabled).toBe(false);
    expect(() => router.languageModel('fast')).toThrow(AiDisabledError);
    expect(() => router.embeddingModel()).toThrow(/OPENAI_API_KEY/);
  });

  it('routes tiers to Anthropic models when the key exists', () => {
    const router = createModelRouter({ ANTHROPIC_API_KEY: 'sk-test' }); // gitleaks:allow — fake
    expect(router.languageEnabled).toBe(true);
    const model = router.languageModel('fast');
    expect(typeof model === 'string' ? model : model.modelId).toContain('haiku');
    expect(router.embeddingsEnabled).toBe(false); // embeddings need OpenAI
  });

  it('falls back to OpenRouter free models when only that key exists (ADR-0014)', () => {
    const router = createModelRouter({ OPENROUTER_API_KEY: 'sk-or-test' }); // gitleaks:allow — fake
    expect(router.languageEnabled).toBe(true);
    const model = router.languageModel('balanced');
    expect(typeof model === 'string' ? model : model.modelId).toContain(':free');
    expect(router.embeddingsEnabled).toBe(false); // OpenRouter has no embeddings API
  });

  it('Anthropic outranks OpenRouter, and tier models are env-overridable', () => {
    const both = createModelRouter({
      ANTHROPIC_API_KEY: 'sk-test', // gitleaks:allow — fake
      OPENROUTER_API_KEY: 'sk-or-test', // gitleaks:allow — fake
    });
    const model = both.languageModel('fast');
    expect(typeof model === 'string' ? model : model.modelId).toContain('haiku');

    const overridden = createModelRouter({
      OPENROUTER_API_KEY: 'sk-or-test', // gitleaks:allow — fake
      OPENROUTER_FAST_MODEL: 'qwen/qwen3-coder:free',
    });
    const fast = overridden.languageModel('fast');
    expect(typeof fast === 'string' ? fast : fast.modelId).toBe('qwen/qwen3-coder:free');
  });

  it('test overrides serve models without any provider key', async () => {
    const stub = createStubLanguageModel([textResponse('hello')]);
    const router = createModelRouter({}, { languageModels: { balanced: stub } });
    expect(router.languageEnabled).toBe(true);
    const result = await runToolLoop({
      model: router.languageModel('balanced'),
      prompt: 'say hello',
      run: RUN,
    });
    expect(result.text).toBe('hello');
  });
});

describe('tool loop', () => {
  it('executes tools and records the run with usage', async () => {
    const lookups: string[] = [];
    const records: RunRecord[] = [];
    const model = createStubLanguageModel([
      toolCallResponse('lookup', { key: 'name' }),
      textResponse('The name is Acme.'),
    ]);

    const result = await runToolLoop({
      model,
      prompt: 'What is the name?',
      tools: {
        lookup: tool({
          description: 'Look up an attribute value',
          inputSchema: z.object({ key: z.string() }),
          execute: ({ key }) => {
            lookups.push(key);
            return Promise.resolve({ value: 'Acme' });
          },
        }),
      },
      run: RUN,
      recorder: { record: (run) => (records.push(run), Promise.resolve()) },
    });

    expect(lookups).toEqual(['name']);
    expect(result.text).toBe('The name is Acme.');
    expect(result.steps).toBe(2);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      tenantId: RUN.tenantId,
      worker: 'test-worker',
      outcome: 'completed',
    });
    expect(records[0]?.usage.totalTokens).toBeGreaterThan(0);
  });

  it('maxSteps bounds the loop even when the model keeps calling tools', async () => {
    // A model that would loop forever: every response is another tool call.
    const model = createStubLanguageModel([
      toolCallResponse('noop', {}),
      toolCallResponse('noop', {}),
      toolCallResponse('noop', {}),
      toolCallResponse('noop', {}),
    ]);
    const result = await runToolLoop({
      model,
      prompt: 'loop',
      tools: {
        noop: tool({
          description: 'Do nothing',
          inputSchema: z.object({}),
          execute: () => Promise.resolve({ ok: true }),
        }),
      },
      maxSteps: 2,
      run: RUN,
    });
    expect(result.steps).toBe(2); // hard cap held
  });

  it('records failed runs and rethrows', async () => {
    const records: RunRecord[] = [];
    const model = createStubLanguageModel([]); // no responses queued → error
    await expect(
      runToolLoop({
        model,
        prompt: 'boom',
        run: RUN,
        recorder: { record: (run) => (records.push(run), Promise.resolve()) },
      }),
    ).rejects.toThrow();
    expect(records[0]?.outcome).toBe('error');
  });

  it('noop recorder is the default and never interferes', async () => {
    await expect(noopRunRecorder.record({} as RunRecord)).resolves.toBeUndefined();
  });
});

describe('scenario runner (eval scaffolding)', () => {
  it('reports pass/fail per scenario without aborting the batch', async () => {
    const outcomes = await runScenarios([
      defineScenario({
        name: 'stubbed extraction answers correctly',
        run: () =>
          runToolLoop({
            model: createStubLanguageModel([textResponse('42')]),
            prompt: 'the answer?',
            run: RUN,
          }),
        assert: (result) => {
          expect(result.text).toBe('42');
        },
      }),
      defineScenario({
        name: 'deliberately failing scenario',
        run: () => Promise.resolve('wrong'),
        assert: (result) => {
          expect(result).toBe('right');
        },
      }),
    ]);

    expect(outcomes.map((outcome) => outcome.passed)).toEqual([true, false]);
    expect(outcomes[1]?.errorMessage).toBeDefined();
    expect(outcomes.every((outcome) => outcome.durationMs >= 0)).toBe(true);
  });
});
