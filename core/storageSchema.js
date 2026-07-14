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

const LEARNING_OBJECTIVE = {
  STUDIO_REWRITE: 'studio_rewrite',
  STUDIO_REPLY: 'studio_reply',
  AUTO_POST: 'auto_post',
  AUTO_RELATIONSHIP: 'auto_relationship'
};

const RULE_STATE = {
  CANDIDATE: 'candidate',
  ACTIVE: 'active',
  DEMOTED: 'demoted',
  EXPIRED: 'expired',
  LEGACY: 'legacy'
};

const MEMORY_FIELD_PROTOCOL = {
  aiPersona: 'UI-facing account summary: target audience, account positioning, and posting goals.',
  agentMemory: 'Long-term strategy knowledge: positioning, content pillars, opinions, boundaries, sources, and reply strategy.',
  aiMemory: 'Loop performance memory: learningEvents as raw deviation samples, learnedRules as compact active rules.',
  feedbackLoopData: 'Human edit memory: before/after copy edits from manual review, not performance results.',
  styleTrainingData: 'User-curated high-quality tweet samples for learning hook, structure, pacing, and reusable writing rules.'
};

const STORAGE_SCHEMA_VERSION = 4;

function inferLearningObjective(item = {}) {
  if (item.objective) return item.objective;
  const contentMode = item.contentMode || item.loopMode;
  const origin = item.origin || item.sourceType;
  if (contentMode === POST_CONTENT_MODE.REPLY) {
    return origin === POST_ORIGIN.MANUAL_REWRITE
      ? LEARNING_OBJECTIVE.STUDIO_REPLY
      : LEARNING_OBJECTIVE.AUTO_RELATIONSHIP;
  }
  if (contentMode === POST_CONTENT_MODE.REWRITE || origin === POST_ORIGIN.MANUAL_REWRITE) {
    return LEARNING_OBJECTIVE.STUDIO_REWRITE;
  }
  return LEARNING_OBJECTIVE.AUTO_POST;
}

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
    objective: inferLearningObjective({ ...item, origin, contentMode }),
    status: hasReview ? POST_STATUS.REVIEWED : status,
    savedAt: item.savedAt || Date.now()
  };
}

function normalizeGenerationSession(session = {}) {
  const createdAt = Number(session.createdAt) || Date.now();
  return {
    ...session,
    id: String(session.id || `gen-${createdAt}`),
    candidates: Array.isArray(session.candidates) ? session.candidates.slice(0, 3) : [],
    selectedText: String(session.selectedText || ''),
    finalText: String(session.finalText || session.selectedText || ''),
    createdAt,
    updatedAt: Number(session.updatedAt) || createdAt,
    publication: session.publication || null
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

function migrateStoragePayload(payload = {}) {
  const memory = normalizeAiMemory(payload.aiMemory || {});
  const draftVault = (Array.isArray(payload.draftVault) ? payload.draftVault : [])
    .slice(0, 100)
    .map(normalizePostRecord);
  const generationSessions = (Array.isArray(payload.generationSessions) ? payload.generationSessions : [])
    .slice(0, 100)
    .map(normalizeGenerationSession);
  const relationshipInteractions = (Array.isArray(payload.relationshipInteractions) ? payload.relationshipInteractions : [])
    .slice(0, 300);

  return {
    ...payload,
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    draftVault,
    generationSessions,
    relationshipInteractions,
    aiMemory: {
      ...memory,
      learnedRules: memory.learnedRules.map((rule) => {
        const ruleState = rule.ruleState || RULE_STATE.LEGACY;
        return {
          ...rule,
          ruleState,
          active: ruleState === RULE_STATE.ACTIVE
        };
      })
    }
  };
}

export {
  LEARNING_OBJECTIVE,
  MEMORY_FIELD_PROTOCOL,
  POST_CONTENT_MODE,
  POST_ORIGIN,
  POST_STATUS,
  RULE_STATE,
  STORAGE_SCHEMA_VERSION,
  inferLearningObjective,
  migrateStoragePayload,
  normalizeAiMemory,
  normalizeGenerationSession,
  normalizePostRecord
};
