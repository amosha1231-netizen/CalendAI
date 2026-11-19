const test = require('node:test');
const assert = require('node:assert');
const { createChatCompletion, shouldTryNextModel } = require('../services/aiService');
const { _setLivePrices } = require('../services/modelPricing');

function apiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function fakeClient(answers) {
  const calls = [];
  return {
    calls,
    chat: { completions: { create: async (params, opts) => {
      calls.push({ model: params.model, opts });
      const a = answers[params.model];
      if (a instanceof Error) throw a;
      return { model: params.model, choices: [{ message: { content: '{"events":[]}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.00001 } };
    } } }
  };
}

test('a 429 on DeepSeek moves straight to the fallback model', async () => {
  _setLivePrices([]);
  delete process.env.AI_FALLBACK_MODELS;
  const client = fakeClient({ 'deepseek/deepseek-chat': apiError(429, '429 Provider returned error') });
  const { model, completion } = await createChatCompletion({ messages: [] }, client, 'deepseek/deepseek-chat');
  assert.strictEqual(model, 'openai/gpt-4o-mini');
  assert.ok(completion.usage);
  assert.deepStrictEqual(client.calls.map(c => c.model), ['deepseek/deepseek-chat', 'openai/gpt-4o-mini']);
  assert.ok(client.calls.every(c => c.opts.timeout > 0 && c.opts.maxRetries <= 1));
});

test('the primary answers when it is healthy, with no fallback call', async () => {
  const client = fakeClient({});
  const { model } = await createChatCompletion({ messages: [] }, client, 'deepseek/deepseek-chat');
  assert.strictEqual(model, 'deepseek/deepseek-chat');
  assert.strictEqual(client.calls.length, 1);
});

test('all models busy: the last error is thrown (route answers "AI busy")', async () => {
  const busy = apiError(429, 'busy');
  const client = fakeClient({ 'deepseek/deepseek-chat': busy, 'openai/gpt-4o-mini': busy, 'google/gemini-2.5-flash': busy });
  await assert.rejects(createChatCompletion({ messages: [] }, client, 'deepseek/deepseek-chat'), /busy/);
  assert.strictEqual(client.calls.length, 3);
});

test('a bad request that is not about the model is not retried on other models', async () => {
  const client = fakeClient({ 'deepseek/deepseek-chat': apiError(400, 'messages must not be empty') });
  await assert.rejects(createChatCompletion({ messages: [] }, client, 'deepseek/deepseek-chat'));
  assert.strictEqual(client.calls.length, 1);
});

test('fallbacks OpenRouter no longer lists are skipped', async () => {
  _setLivePrices([['deepseek/deepseek-chat', { input: 1, output: 1 }], ['google/gemini-2.5-flash', { input: 1, output: 1 }]]);
  const client = fakeClient({ 'deepseek/deepseek-chat': apiError(503, 'down') });
  const { model } = await createChatCompletion({ messages: [] }, client, 'deepseek/deepseek-chat');
  assert.strictEqual(model, 'google/gemini-2.5-flash');
  _setLivePrices([]);
});

test('AI_FALLBACK_MODELS overrides the fallback list', async () => {
  process.env.AI_FALLBACK_MODELS = 'x/model-a';
  const client = fakeClient({ 'deepseek/deepseek-chat': apiError(429, 'busy') });
  const { model } = await createChatCompletion({ messages: [] }, client, 'deepseek/deepseek-chat');
  assert.strictEqual(model, 'x/model-a');
  delete process.env.AI_FALLBACK_MODELS;
});

test('shouldTryNextModel', () => {
  assert.ok(shouldTryNextModel(apiError(429, 'x')));
  assert.ok(shouldTryNextModel(apiError(502, 'x')));
  assert.ok(shouldTryNextModel(new Error('Request timed out.')));
  assert.ok(shouldTryNextModel(apiError(400, 'foo is not a valid model ID')));
  assert.ok(!shouldTryNextModel(apiError(401, 'bad key')));
  assert.ok(!shouldTryNextModel(apiError(402, 'insufficient credits')));
});
