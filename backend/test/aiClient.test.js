const test = require('node:test');
const assert = require('node:assert');

const aiClient = require('../services/aiClient');

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    aiClient._resetClients();
  }
}

test('Claude is used whenever ANTHROPIC_API_KEY is set, even if OpenRouter is configured', () => {
  withEnv({ ANTHROPIC_API_KEY: 'sk-test', OPENROUTER_API_KEY: 'or-test' }, () => {
    assert.strictEqual(aiClient.activeProvider(), 'anthropic');
    assert.strictEqual(aiClient.activeModelName(), 'claude-haiku-5-5');
    assert.strictEqual(aiClient.activeModelName('vision'), 'claude-haiku-5-5');
  });
});

test('falls back to OpenRouter only while ANTHROPIC_API_KEY is missing', () => {
  withEnv({ ANTHROPIC_API_KEY: null, OPENROUTER_API_KEY: 'or-test' }, () => {
    assert.strictEqual(aiClient.activeProvider(), 'openrouter');
    assert.strictEqual(aiClient.activeModelName(), 'deepseek/deepseek-chat');
  });
  withEnv({ ANTHROPIC_API_KEY: '  ', OPENROUTER_API_KEY: null }, () => {
    assert.strictEqual(aiClient.isAIConfigured(), false);
  });
});

test('Claude cost is computed from tokens at Haiku 5.5 prices', () => {
  const usage = aiClient.claudeUsage({ input_tokens: 10_000, output_tokens: 1_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
  assert.strictEqual(usage.prompt_tokens, 10_000);
  assert.strictEqual(usage.completion_tokens, 1_000);
  assert.strictEqual(usage.total_tokens, 11_000);
  // 10k × $0.10/M + 1k × $0.50/M = $0.0015
  assert.ok(Math.abs(usage.cost - 0.0015) < 1e-12);
});

test('cache reads and writes are priced at 0.1x and 1.25x input', () => {
  const cost = aiClient.claudeCostUSD({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 });
  assert.ok(Math.abs(cost - (0.125 + 0.01)) < 1e-12);
});

test('billing charges the computed Claude cost × markup', () => {
  const { calculateCost } = require('../services/tokenTracker');
  const usage = aiClient.claudeUsage({ input_tokens: 11_000, output_tokens: 500 });
  const info = calculateCost(usage, 'claude-haiku-5-5');
  assert.ok(info.rawCostUSD > 0);
  assert.ok(info.costUSD >= info.rawCostUSD * 3 - 1e-9);
});

test('JSON is extracted from plain, fenced, or wrapped replies', () => {
  assert.deepStrictEqual(aiClient.extractJsonObject('{"a":1}'), { a: 1 });
  assert.deepStrictEqual(aiClient.extractJsonObject('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepStrictEqual(aiClient.extractJsonObject('Here it is:\n{"a":{"b":3}}\nDone.'), { a: { b: 3 } });
  assert.deepStrictEqual(aiClient.extractJsonObject(''), {});
  assert.throws(() => aiClient.extractJsonObject('no json here'));
});
