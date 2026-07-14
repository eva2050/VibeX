const POST_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  REVIEWED: 'reviewed'
};

const POST_ORIGIN = {
  MANUAL_REWRITE: 'manual_rewrite',
  AUTO_GENERATED: 'auto_generated',
  COLLECTED: 'collected',
  X_SYNCED: 'x_synced'
};

const POST_CONTENT_MODE = {
  POST: 'post',
  REWRITE: 'rewrite',
  REPLY: 'reply'
};

const MEMORY_FIELD_PROTOCOL = {
  aiPersona: 'UI-facing account summary: target audience, account positioning, and posting goals.',
  agentMemory: 'Long-term strategy knowledge: positioning, content pillars, opinions, boundaries, sources, and reply strategy.',
  aiMemory: 'Loop performance memory: learningEvents as raw deviation samples, learnedRules as compact active rules.',
  feedbackLoopData: 'Human edit memory: before/after copy edits from manual review, not performance results.',
  styleTrainingData: 'User-curated high-quality tweet samples for learning hook, structure, pacing, and reusable writing rules.'
};

const STORAGE_SCHEMA_VERSION = 3;

function normalizePostRecord(item = {}) {
  const text = String(item.text || '').trim();
  const origin = item.origin || item.sourceType || (
    item.source === POST_ORIGIN.AUTO_GENERATED
      ? POST_ORIGIN.AUTO_GENERATED
      : item.source === POST_ORIGIN.X_SYNCED
        ? POST_ORIGIN.X_SYNCED
        : POST_ORIGIN.MANUAL_REWRITE
  );
  const contentMode = item.contentMode || item.loopMode || (
    origin === POST_ORIGIN.AUTO_GENERATED ? POST_CONTENT_MODE.POST : POST_CONTENT_MODE.REWRITE
  );
  const hasReview = Number(item.actualViews) > 0 || Boolean(item.reviewedAt);
  const status = item.status || (hasReview ? POST_STATUS.REVIEWED : (item.publishedAt ? POST_STATUS.PUBLISHED : POST_STATUS.DRAFT));
  return {
    ...item,
    id: item.id || `${origin}-${item.savedAt || Date.now()}`,
    text,
    origin,
    contentMode,
    status: hasReview ? POST_STATUS.REVIEWED : status,
    savedAt: item.savedAt || Date.now()
  };
}

function normalizeAiMemory(memory = {}) {
  const normalizeEvent = (event = {}) => ({
    ...event,
    contentMode: event.contentMode || event.loopMode || POST_CONTENT_MODE.POST
  });
  const normalizeRule = (rule = {}) => ({
    ...rule,
    contentMode: rule.contentMode || rule.loopMode || POST_CONTENT_MODE.POST
  });
  return {
    ...(memory || {}),
    learningEvents: Array.isArray(memory?.learningEvents) ? memory.learningEvents.slice(0, 100).map(normalizeEvent) : [],
    learnedRules: Array.isArray(memory?.learnedRules) ? memory.learnedRules.slice(0, 12).map(normalizeRule) : [],
    updatedAt: memory?.updatedAt || Date.now()
  };
}

export { MEMORY_FIELD_PROTOCOL, POST_CONTENT_MODE, POST_ORIGIN, POST_STATUS, STORAGE_SCHEMA_VERSION, normalizeAiMemory, normalizePostRecord };
