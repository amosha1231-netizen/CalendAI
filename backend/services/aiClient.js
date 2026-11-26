// ──────────────────────────────────────────────
// The one place the backend talks to an AI model
// ──────────────────────────────────────────────
// Main provider: Claude (Anthropic API, model claude-haiku-5-5), used whenever
// ANTHROPIC_API_KEY is set. Anthropic does not train its models on data sent
// through its API, which is what Google's "Limited Use" rule requires for
// Google Calendar data (OAuth verification of the Calendar scopes).
//
// Transitional fallback: if ANTHROPIC_API_KEY is NOT set but OPENROUTER_API_KEY
// is, the old OpenRouter/DeepSeek path keeps the app working until the new key
// is added on Render. Once ANTHROPIC_API_KEY is set, nothing is ever sent to
// OpenRouter/DeepSeek: there is deliberately no fallback from Claude to another
// provider, so Google user data cannot leak to a provider that trains on it.
// ──────────────────────────────────────────────
const pricing = require('../config/pricing');

const CLAUDE_MODEL = 'claude-haiku-5-5';
const LEGACY_MODEL = 'deepseek/deepseek-chat';
const LEGACY_VISION_MODEL = 'google/gemini-2.0-flash-exp';

let anthropicClient = null;
let openrouterClient = null;

function anthropicKey() {
  const k = process.env.ANTHROPIC_API_KEY?.trim();
  return k ? k : null;
}

function openrouterKey() {
  const k = process.env.OPENROUTER_API_KEY?.trim();
  return k && k !== 'your_openrouter_api_key_here' ? k : null;
}

/** 'anthropic' | 'openrouter' | null */
function activeProvider() {
  if (anthropicKey()) return 'anthropic';
  if (openrouterKey()) return 'openrouter';
  return null;
}

function isAIConfigured() {
  return activeProvider() !== null;
}

/** Model name used for billing/logs for the given request kind. */
function activeModelName(kind = 'text') {
  const p = activeProvider();
  if (p === 'anthropic') return CLAUDE_MODEL;
  if (p === 'openrouter') return kind === 'vision' ? LEGACY_VISION_MODEL : LEGACY_MODEL;
  return null;
}

function getAnthropic() {
  if (!anthropicClient) {
    const sdk = require('@anthropic-ai/sdk');
    const Anthropic = sdk.default || sdk;
    anthropicClient = new Anthropic({ apiKey: anthropicKey(), maxRetries: 3, timeout: 60_000 });
    console.log(`✅ AI: Claude via Anthropic API (${CLAUDE_MODEL})`);
  }
  return anthropicClient;
}

function getOpenRouter() {
  if (!openrouterClient) {
    const { OpenAI } = require('openai');
    openrouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouterKey(),
      maxRetries: 4,
      defaultHeaders: {
        'HTTP-Referer': process.env.BASE_URL || 'https://calendai.org',
        'X-Title': 'CalendAI',
      },
    });
    console.warn('⚠️ AI: ANTHROPIC_API_KEY is not set, using the old OpenRouter/DeepSeek path. Set ANTHROPIC_API_KEY on Render.');
  }
  return openrouterClient;
}

/**
 * Cost in USD of one Claude call, from its token usage and the prices in
 * config/pricing.js (cache writes at 1.25x input, cache reads at 0.1x input).
 */
function claudeCostUSD(u) {
  const price = pricing.claudePrices[CLAUDE_MODEL];
  const input = u.input_tokens || 0;
  const cacheWrite = u.cache_creation_input_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const output = u.output_tokens || 0;
  return (
    (input * price.input + cacheWrite * price.input * 1.25 + cacheRead * price.input * 0.1 + output * price.output)
    / 1_000_000
  );
}

/** Usage in the shape billing expects (prompt/completion/total tokens + cost). */
function claudeUsage(u) {
  if (!u) return null;
  const prompt = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const completion = u.output_tokens || 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    cost: claudeCostUSD(u),
  };
}

function openrouterUsage(completion) {
  const u = completion && completion.usage;
  if (!u) return null;
  const usage = {
    prompt_tokens: u.prompt_tokens || 0,
    completion_tokens: u.completion_tokens || 0,
    total_tokens: u.total_tokens || 0,
  };
  const cost = u.cost == null ? NaN : Number(u.cost);
  if (Number.isFinite(cost) && cost >= 0) usage.cost = cost;
  return usage;
}

/**
 * Pull the JSON object out of a model reply. Claude has no JSON mode here, so
 * the reply may be wrapped in ```json fences or have a sentence around it.
 */
function extractJsonObject(text) {
  const s = String(text || '').trim();
  if (!s) return {};
  try { return JSON.parse(s); } catch { /* try harder below */ }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* keep going */ }
  }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) return JSON.parse(s.slice(start, end + 1));
  throw new SyntaxError('AI reply did not contain a JSON object');
}

const JSON_ONLY_NOTE = '\n\nOutput format: reply with ONE valid JSON object only. No markdown, no code fences, no text before or after it.';

/**
 * Ask the model for a JSON object.
 * @param {Object} args
 * @param {string} args.system   System instruction.
 * @param {string} args.user     User prompt text.
 * @param {{ data: string, mimeType: string }} [args.image] Optional base64 image.
 * @param {number} [args.maxTokens]
 * @param {string} [args.label]  For logs.
 * @returns {Promise<{ parsed: Object, usage: Object|null, modelName: string }>}
 */
async function completeJson({ system, user, image = null, maxTokens = 8000, label = 'ai' }) {
  const provider = activeProvider();
  if (!provider) throw new Error('AI is not configured');
  const kind = image ? 'vision' : 'text';
  const modelName = activeModelName(kind);
  const started = Date.now();

  if (provider === 'anthropic') {
    const content = [];
    if (image) {
      content.push({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.data } });
    }
    content.push({ type: 'text', text: user });

    const response = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      // Parsing a request into JSON is quick work: keep thinking light.
      output_config: { effort: 'low' },
      system: system + JSON_ONLY_NOTE,
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('AI declined the request');
    }
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const usage = claudeUsage(response.usage);
    console.log(`[AI] ${label} ${modelName} answered in ${Date.now() - started}ms`
      + (usage ? ` (in ${usage.prompt_tokens}, out ${usage.completion_tokens}, $${usage.cost.toFixed(6)})` : ''));
    if (response.stop_reason === 'max_tokens') {
      console.warn(`[AI] ${label} hit max_tokens (${maxTokens})`);
    }
    return { parsed: extractJsonObject(text), usage, modelName };
  }

  // Transitional OpenRouter path (only while ANTHROPIC_API_KEY is missing).
  const userContent = image
    ? [
        { type: 'text', text: user },
        { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}`, detail: 'high' } },
      ]
    : user;
  const completion = await getOpenRouter().chat.completions.create({
    model: modelName,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
    usage: { include: true }, // OpenRouter returns the real charged cost in usage.cost
    ...(image ? { max_tokens: 4096 } : {}),
  });
  const raw = completion.choices?.[0]?.message?.content || '{}';
  const usage = openrouterUsage(completion);
  console.log(`[AI] ${label} ${modelName} answered in ${Date.now() - started}ms`);
  return { parsed: extractJsonObject(raw), usage, modelName };
}

// For tests.
function _resetClients() { anthropicClient = null; openrouterClient = null; }

module.exports = {
  CLAUDE_MODEL,
  isAIConfigured,
  activeProvider,
  activeModelName,
  completeJson,
  extractJsonObject,
  claudeUsage,
  claudeCostUSD,
  _resetClients,
};
