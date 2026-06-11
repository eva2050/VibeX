const POST_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  REVIEWED: 'reviewed'
};

const POST_ORIGIN = {
  MANUAL_REWRITE: 'manual_rewrite',
  AUTO_GENERATED: 'auto_generated',
  COLLECTED: 'collected'
};

const MEMORY_FIELD_PROTOCOL = {
  aiPersona: 'UI-facing account summary: target audience, voice, and posting goals.',
  agentMemory: 'Long-term strategy knowledge: positioning, content pillars, opinions, boundaries, sources, and reply strategy.',
  aiMemory: 'Loop performance memory: learningEvents as raw deviation samples, learnedRules as compact active rules.',
  feedbackLoopData: 'Human edit memory: before/after copy edits from manual review, not performance results.',
  styleTrainingData: 'Voice samples for rhythm, wording, formatting, and tone imitation.'
};

function normalizePostRecord(item = {}) {
  const text = String(item.text || '').trim();
  const origin = item.origin || item.sourceType || (
    item.source === POST_ORIGIN.AUTO_GENERATED ? POST_ORIGIN.AUTO_GENERATED : POST_ORIGIN.MANUAL_REWRITE
  );
  const hasReview = Number(item.actualViews) > 0 || Boolean(item.reviewedAt);
  const status = item.status || (hasReview ? POST_STATUS.REVIEWED : (item.publishedAt ? POST_STATUS.PUBLISHED : POST_STATUS.DRAFT));
  return {
    ...item,
    id: item.id || `${origin}-${item.savedAt || Date.now()}`,
    text,
    origin,
    status: hasReview ? POST_STATUS.REVIEWED : status,
    savedAt: item.savedAt || Date.now()
  };
}

export { MEMORY_FIELD_PROTOCOL, POST_ORIGIN, POST_STATUS, normalizePostRecord };
