import assert from 'node:assert/strict';

let storedLogs = [];
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, callback) => callback({ logs: storedLogs }),
      set: (items) => { storedLogs = items.logs ?? storedLogs; }
    }
  }
};

const {
  REPLY_STRATEGY_VALUES,
  resolveReplyStrategyKey,
  buildLegacyReplyStrategyPrompt,
  buildReplyStrategyInstruction
} = await import('./core/replyStrategies.js');

const expertInstruction = buildReplyStrategyInstruction('专业流：专业知识 / 数据');
assert.match(expertInstruction, /认知洞见|启发式/);
assert.match(expertInstruction, /边界条件|判断标准/);
assert.match(expertInstruction, /最多两小段/);
assert.doesNotMatch(expertInstruction, /必须.*(冷知识|具体数据|硬核)/);
assert.match(expertInstruction, /不要编造数据/);

const legacyPrompt = buildLegacyReplyStrategyPrompt('专业流：专业知识 / 数据');
assert.match(legacyPrompt, /更高一层的洞见/);
assert.match(legacyPrompt, /最多两小段/);
assert.doesNotMatch(legacyPrompt, /必须.*(冷知识|具体数据|硬核)/);
assert.match(legacyPrompt, /不编造数据/);

// Explicit enum-key resolution: exact stored values map to stable keys,
// including the legacy '专业流：专业知识 / 数据' label aliasing to EXPERT.
assert.equal(resolveReplyStrategyKey(REPLY_STRATEGY_VALUES.CONTRARIAN), 'CONTRARIAN');
assert.equal(resolveReplyStrategyKey(REPLY_STRATEGY_VALUES.EXPERT), 'EXPERT');
assert.equal(resolveReplyStrategyKey(REPLY_STRATEGY_VALUES.EXPERT_LEGACY), 'EXPERT');
assert.equal(resolveReplyStrategyKey(REPLY_STRATEGY_VALUES.MINIMAL), 'MINIMAL');
assert.equal(resolveReplyStrategyKey(REPLY_STRATEGY_VALUES.CUSTOM), 'CUSTOM');

// A value merely containing one of the old substrings (e.g. relocalized or
// edited display text) should NOT be guessed at via substring matching -
// only an exact match to a known enum value should resolve.
assert.equal(resolveReplyStrategyKey('杠精风格已改名'), null);
assert.equal(resolveReplyStrategyKey('Expert mode'), null);

// Dead English-keyword branches ('Expert', 'Data-driven', 'Custom') no longer
// exist; an unrecognized value must fall back to the generic template AND be
// logged (not silently swallowed).
storedLogs = [];
const fallbackInstruction = buildReplyStrategyInstruction('Expert mode', '');
assert.match(fallbackInstruction, /Expert mode/);
assert.equal(storedLogs.length, 1);
assert.equal(storedLogs[0].messageKey ?? storedLogs[0].key, 'reply_strategy_unrecognized');

storedLogs = [];
const fallbackLegacyPrompt = buildLegacyReplyStrategyPrompt('Custom', '');
assert.match(fallbackLegacyPrompt, /Custom/);
assert.equal(storedLogs.length, 1);

console.log('reply strategy prompt checks passed');
