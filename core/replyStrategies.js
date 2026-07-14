import { addLog } from './state.js';

// Canonical display strings currently used by the settings UI
// (options/*.html #reply-strategy-container's data-value attributes) and
// stored verbatim in chrome.storage as `config.replyStrategy`.
//
// These used to be matched by naive substring checks (e.g. `.includes('杠精')`),
// which silently falls back to a generic template with no error whenever the
// stored text is edited/relocalized and no longer contains the expected
// substring. Matching against this exact-value map instead makes the mapping
// explicit and lets us log+flag any value we don't recognize, rather than
// quietly guessing.
const REPLY_STRATEGY_VALUES = {
  CONTRARIAN: '杠精流：犀利观点 / 争议',
  EXPERT: '专业流：认知洞见 / 启发式',
  EXPERT_LEGACY: '专业流：专业知识 / 数据',
  MINIMAL: '极简流：精辟吐槽 / 玩梗',
  CUSTOM: '自定义流：完全自定义'
};

// Explicit enum-key lookup: exact stored value -> stable internal key.
// EXPERT_LEGACY intentionally maps to the same key as EXPERT since it's just
// an older label for the same strategy (see normalizeReplyStrategyValue in
// options/ui/settings.js).
const STRATEGY_KEY_BY_VALUE = {
  [REPLY_STRATEGY_VALUES.CONTRARIAN]: 'CONTRARIAN',
  [REPLY_STRATEGY_VALUES.EXPERT]: 'EXPERT',
  [REPLY_STRATEGY_VALUES.EXPERT_LEGACY]: 'EXPERT',
  [REPLY_STRATEGY_VALUES.MINIMAL]: 'MINIMAL',
  [REPLY_STRATEGY_VALUES.CUSTOM]: 'CUSTOM'
};

// Resolve a stored settings value to a stable strategy key via exact match.
// Returns null (not a fragile substring guess) when the value doesn't match
// anything known, so callers can make an explicit, logged fallback decision.
function resolveReplyStrategyKey(value = '') {
  const text = String(value || '').trim();
  return STRATEGY_KEY_BY_VALUE[text] || null;
}

function warnUnrecognizedStrategy(value) {
  addLog('warning', 'reply_strategy_unrecognized', [String(value || '')]);
}

function getExpertReplyInstruction() {
  return [
    '回复风格：专业流 = 认知洞见 / 启发式短评，不是堆知识点或乱塞数据。',
    '先抓原推的核心观点，再补一个更高一层的判断：底层机制、边界条件、反直觉洞见、判断标准或可迁移启发。',
    '必须精简：优先 1-2 句；最多两小段，每段 2-3 行以内。',
    '不要编造数据、报告、年份、价格、案例、机构名或“冷知识”；除非原推已经给出事实来源。',
    '不要把话题强行转到不相关行业；不要为了显得专业而扩写成长分析。'
  ].join('\n');
}

function buildReplyStrategyInstruction(strategy = '', customPrompt = '') {
  const current = strategy || REPLY_STRATEGY_VALUES.MINIMAL;
  const key = resolveReplyStrategyKey(current);
  switch (key) {
    case 'CONTRARIAN':
      return '回复风格：可以提出不同角度，但必须克制、具体，不要攻击个人；优先一句短判断或一个反问。';
    case 'EXPERT':
      return getExpertReplyInstruction();
    case 'MINIMAL':
      return '回复风格：像真人随手评论，短、自然、少术语。可以是一个轻判断、一个具体共鸣或一个简短反问，不要硬写成技术分析。';
    case 'CUSTOM':
      return '用户自定义回复偏好：' + (customPrompt || '自然、有信息增量，但不要硬广。');
    default:
      warnUnrecognizedStrategy(current);
      return '回复风格：' + current + '。口语化、低姿态，不要有 AI 味。';
  }
}

function buildLegacyReplyStrategyPrompt(strategy = '', customPrompt = '') {
  const current = strategy || REPLY_STRATEGY_VALUES.EXPERT;
  const key = resolveReplyStrategyKey(current);
  switch (key) {
    case 'CONTRARIAN':
      return '你是一个犀利但克制的真实 X 用户。任务：回复这条推文。策略：抓住原推里最值得商榷的一点，给出一句短判断或反问。要求：具体，不做人身攻击，不超过40字。';
    case 'EXPERT':
      return [
        '你是一个能把复杂问题讲短的认知型评论者。任务：回复这条推文。',
        '策略：先抓原推核心观点，再给一个更高一层的洞见、边界条件、判断标准或启发式。',
        '要求：专业但不炫技；不编造数据、报告、年份、机构名、案例或冷知识；不把话题转到无关行业。',
        '长度：优先1-2句；最多两小段，每段2-3行以内。必须精简、有洞见。'
      ].join('\n');
    case 'MINIMAL':
      return '你是一个极度厌恶长篇大论、浑身都是梗的网络乐子人。任务：回复这条推文。策略：用一句精辟吐槽、比喻或轻反问总结原推。要求：短平快，字数绝对不能超过15个字。';
    case 'CUSTOM':
      return customPrompt || '你是一位专业的AI助手，请按照你的判断提供高质量回复。';
    default:
      warnUnrecognizedStrategy(current);
      return '你是一位混迹推特多年的资深真实网友。任务：请使用“' + current + '”的策略，为这条推文写一条高质量回复。要求：口语化，不要有AI味。';
  }
}

export {
  REPLY_STRATEGY_VALUES,
  resolveReplyStrategyKey,
  buildLegacyReplyStrategyPrompt,
  buildReplyStrategyInstruction,
  getExpertReplyInstruction
};
