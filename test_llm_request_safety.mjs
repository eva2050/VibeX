import assert from 'node:assert/strict';
import { callLLM } from './services/llm.js';

const originalFetch = globalThis.fetch;

async function withMockFetch(mockFetch, fn) {
  globalThis.fetch = mockFetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await withMockFetch(async (url, options = {}) => {
  const body = JSON.parse(options.body);
  assert.equal(String(url).includes('key='), false);
  assert.equal(options.headers['x-goog-api-key'], 'gemini-secret');
  assert.equal(body.generationConfig.temperature, 0.95);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }]
  }), { status: 200 });
}, async () => {
  const result = await callLLM('ping', {
    apiProvider: 'gemini',
    apiKey: 'gemini-secret',
    aiModel: 'models/gemini-2.5-flash'
  }, true);
  assert.equal(result, '{"ok":true}');
});

await withMockFetch(async (url, options = {}) => {
  assert.equal(String(url).includes('key='), false);
  assert.equal(options.headers['x-goog-api-key'], 'bad-key');
  return new Response(JSON.stringify({
    error: { code: 403, message: 'API key not valid' }
  }), { status: 403 });
}, async () => {
  await assert.rejects(
    callLLM('ping', { apiProvider: 'gemini', apiKey: 'bad-key' }),
    (error) => error.type === 'AUTH_ERROR'
  );
});

await withMockFetch(async () => new Response(JSON.stringify({
  error: { code: 429, message: 'quota exceeded' }
}), { status: 200 }), async () => {
  await assert.rejects(
    callLLM('ping', { apiProvider: 'gemini', apiKey: 'rate-key', __rateLimitRetryBaseDelayMs: 0 }),
    (error) => error.type === 'RATE_LIMIT'
  );
});

// A 429 should be retried with backoff (2 retries) before giving up, instead
// of surfacing on the very first attempt.
{
  let callCount = 0;
  await withMockFetch(async () => {
    callCount++;
    return new Response(JSON.stringify({
      error: { code: 429, message: 'quota exceeded' }
    }), { status: 200 });
  }, async () => {
    await assert.rejects(
      callLLM('ping', { apiProvider: 'gemini', apiKey: 'rate-key', __rateLimitRetryBaseDelayMs: 0 }),
      (error) => error.type === 'RATE_LIMIT'
    );
  });
  assert.equal(callCount, 3); // 1 initial attempt + 2 retries
}

// If a retry succeeds, callLLM should return the successful result rather
// than surfacing the earlier rate-limit error.
{
  let callCount = 0;
  await withMockFetch(async () => {
    callCount++;
    if (callCount < 2) {
      return new Response(JSON.stringify({
        error: { code: 429, message: 'quota exceeded' }
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'recovered' }] } }]
    }), { status: 200 });
  }, async () => {
    const result = await callLLM('ping', { apiProvider: 'gemini', apiKey: 'rate-key', __rateLimitRetryBaseDelayMs: 0 });
    assert.equal(result, 'recovered');
  });
  assert.equal(callCount, 2);
}

// Non-rate-limit errors (e.g. auth) must never be retried.
{
  let callCount = 0;
  await withMockFetch(async () => {
    callCount++;
    return new Response(JSON.stringify({
      error: { code: 403, message: 'API key not valid' }
    }), { status: 403 });
  }, async () => {
    await assert.rejects(
      callLLM('ping', { apiProvider: 'gemini', apiKey: 'bad-key', __rateLimitRetryBaseDelayMs: 0 }),
      (error) => error.type === 'AUTH_ERROR'
    );
  });
  assert.equal(callCount, 1);
}

await withMockFetch(async (url, options = {}) => {
  assert.equal(options.headers['HTTP-Referer'], undefined);
  assert.equal(options.headers['X-Title'], 'VibeX');
  return new Response(JSON.stringify({
    choices: [{ message: { content: 'ok' } }]
  }), { status: 200 });
}, async () => {
  const result = await callLLM('ping', {
    apiProvider: 'openrouter',
    apiKey: 'openrouter-secret',
    aiModel: 'google/gemini-2.5-flash'
  });
  assert.equal(result, 'ok');
});

await withMockFetch(async () => new Response(JSON.stringify({
  choices: [{ message: { content: '' }, finish_reason: 'content_filter' }]
}), { status: 200 }), async () => {
  // An OpenAI-compatible provider can return HTTP 200 with a "valid" message
  // object whose content is an empty string (safety filtering, truncation,
  // transient upstream glitch). This must be treated as a hard failure - not
  // silently returned as if it were real generated text ready to post/send.
  await assert.rejects(
    callLLM('ping', { apiProvider: 'openai', apiKey: 'openai-secret' }),
    (error) => /AI 返回为空/.test(error.message) && /content_filter/.test(error.message)
  );
});

await withMockFetch(async () => new Response(JSON.stringify({
  choices: [{ message: { content: null } }]
}), { status: 200 }), async () => {
  await assert.rejects(
    callLLM('ping', { apiProvider: 'deepseek', apiKey: 'deepseek-secret' }),
    (error) => /AI 返回为空/.test(error.message)
  );
});

console.log('llm request safety checks passed');
