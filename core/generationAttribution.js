import {
  LEARNING_OBJECTIVE,
  POST_CONTENT_MODE,
  POST_ORIGIN,
  POST_STATUS,
  normalizeGenerationSession,
  normalizePostRecord
} from './storageSchema.js';

const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_FUZZY_THRESHOLD = 0.92;
const DEFAULT_AMBIGUITY_GAP = 0.05;

function normalizeAttributionText(text = '') {
  return String(text || '')
    .normalize('NFKC')
    .replace(/https?:\/\/t\.co\/\S+/gi, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toBigrams(value = '') {
  const text = normalizeAttributionText(value);
  if (!text) return new Set();
  if (text.length < 2) return new Set([text]);
  const result = new Set();
  for (let index = 0; index < text.length - 1; index += 1) {
    result.add(text.slice(index, index + 2));
  }
  return result;
}

function bigramSimilarity(left = '', right = '') {
  const a = toBigrams(left);
  const b = toBigrams(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(value => b.has(value)).length;
  return (2 * intersection) / (a.size + b.size);
}

function getSessionObjective(promptType = '') {
  return promptType === 'draft_reply'
    ? LEARNING_OBJECTIVE.STUDIO_REPLY
    : LEARNING_OBJECTIVE.STUDIO_REWRITE;
}

function createGenerationSession(input = {}) {
  const now = Number(input.createdAt) || Date.now();
  return normalizeGenerationSession({
    ...input,
    id: input.id || `gen-${now}-${Math.random().toString(36).slice(2, 8)}`,
    objective: input.objective || getSessionObjective(input.promptType),
    inputText: String(input.inputText || ''),
    inputContext: input.inputContext || {},
    selectedCandidateId: input.selectedCandidateId || '',
    selectedText: String(input.selectedText || ''),
    finalText: String(input.finalText || input.selectedText || ''),
    engineLanguage: input.engineLanguage || 'unknown',
    accountId: input.accountId || '',
    createdAt: now,
    updatedAt: Number(input.updatedAt) || now,
    publication: input.publication || null
  });
}

function buildStudioSessionFromResult({
  generationId,
  promptType,
  accountId = '',
  sourceText = '',
  inputContext = {},
  result = {},
  engineLanguage = 'unknown',
  now = Date.now()
} = {}) {
  return createGenerationSession({
    id: generationId,
    promptType,
    accountId,
    inputText: sourceText,
    inputContext,
    candidates: result.candidates || [],
    selectedCandidateId: result.selectedCandidateId || '',
    selectedText: result.text || '',
    finalText: result.text || '',
    judge: result.judge || null,
    repaired: Boolean(result.repaired),
    quality: result.quality || null,
    engineLanguage,
    createdAt: now,
    updatedAt: now
  });
}

function updateGenerationSessionText(session = {}, finalText = '', now = Date.now()) {
  return normalizeGenerationSession({
    ...session,
    finalText: String(finalText || '').trim(),
    updatedAt: now
  });
}

function selectGenerationCandidate(session = {}, candidateId = '', now = Date.now()) {
  const candidate = (Array.isArray(session.candidates) ? session.candidates : [])
    .find(item => item.id === candidateId);
  if (!candidate) return normalizeGenerationSession(session);
  return normalizeGenerationSession({
    ...session,
    selectedCandidateId: candidate.id,
    selectedText: candidate.text || '',
    finalText: candidate.text || '',
    updatedAt: now
  });
}

function recordGenerationAction(session = {}, action = '', now = Date.now()) {
  const field = action === 'copy'
    ? 'copiedAt'
    : action === 'save'
      ? 'savedAt'
      : '';
  if (!field) return normalizeGenerationSession(session);
  return normalizeGenerationSession({
    ...session,
    [field]: now,
    updatedAt: now
  });
}

function isKnownLanguage(value = '') {
  return Boolean(value && !['auto', 'unknown'].includes(String(value)));
}

function isEligibleSession(post = {}, session = {}, now = Date.now()) {
  const actionAt = Number(session.copiedAt || session.savedAt) || 0;
  if (!actionAt || now - actionAt > ATTRIBUTION_WINDOW_MS || now < actionAt) return false;
  if (session.publication?.statusId) return false;
  if (post.accountId && session.accountId && String(post.accountId) !== String(session.accountId)) return false;
  const postLanguage = post.language || post.engineLanguage || '';
  if (isKnownLanguage(postLanguage)
    && isKnownLanguage(session.engineLanguage)
    && String(postLanguage) !== String(session.engineLanguage)) return false;
  return true;
}

function findGenerationMatch(post = {}, sessions = [], options = {}) {
  const now = Number(options.now) || Date.now();
  const fuzzyThreshold = Number(options.fuzzyThreshold) || DEFAULT_FUZZY_THRESHOLD;
  const ambiguityGap = Number(options.ambiguityGap) || DEFAULT_AMBIGUITY_GAP;
  const eligible = (Array.isArray(sessions) ? sessions : [])
    .filter(session => isEligibleSession(post, session, now));
  const target = normalizeAttributionText(post.text);
  if (!target) return null;

  const finalMatches = eligible.filter(session => normalizeAttributionText(session.finalText) === target);
  if (finalMatches.length === 1) {
    return { session: finalMatches[0], method: 'exact_final', score: 1 };
  }
  if (finalMatches.length > 1) return null;

  const selectedMatches = eligible.filter(session => normalizeAttributionText(session.selectedText) === target);
  if (selectedMatches.length === 1) {
    return { session: selectedMatches[0], method: 'exact_selected', score: 1 };
  }
  if (selectedMatches.length > 1) return null;

  const ranked = eligible
    .map(session => ({
      session,
      score: bigramSimilarity(target, session.finalText)
    }))
    .sort((left, right) => right.score - left.score);
  if (!ranked[0] || ranked[0].score < fuzzyThreshold) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < ambiguityGap) return null;
  return { ...ranked[0], method: 'fuzzy_final' };
}

function buildVaultRecordFromSession(session = {}) {
  const isReply = session.promptType === 'draft_reply';
  return normalizePostRecord({
    id: `manual-${session.id || Date.now()}`,
    generationId: session.id || '',
    text: session.finalText || session.selectedText || '',
    originalAIOutput: session.selectedText || '',
    source: session.inputText || '',
    sourceContext: session.inputContext || {},
    accountId: session.accountId || '',
    engineLanguage: session.engineLanguage || 'unknown',
    origin: POST_ORIGIN.MANUAL_REWRITE,
    contentMode: isReply ? POST_CONTENT_MODE.REPLY : POST_CONTENT_MODE.REWRITE,
    objective: isReply ? LEARNING_OBJECTIVE.STUDIO_REPLY : LEARNING_OBJECTIVE.STUDIO_REWRITE,
    status: POST_STATUS.DRAFT,
    savedAt: Number(session.savedAt) || Date.now()
  });
}

function mergeAttributedPost(draft = {}, synced = {}, attribution = {}) {
  const metrics = {
    ...(draft.performanceMetrics || {}),
    ...(synced.performanceMetrics || {})
  };
  const actualViews = Number(synced.actualViews || metrics.views || draft.actualViews) || 0;
  return normalizePostRecord({
    ...draft,
    text: synced.text || draft.text,
    statusId: synced.statusId || draft.statusId || '',
    postUrl: synced.postUrl || draft.postUrl || '',
    publishedAt: synced.createdAt || synced.publishedAt || draft.publishedAt || Date.now(),
    actualViews,
    performanceMetrics: metrics,
    status: actualViews > 0 ? POST_STATUS.REVIEWED : POST_STATUS.PUBLISHED,
    attribution: {
      method: attribution.method || '',
      score: Number(attribution.score) || 0,
      matchedAt: Number(attribution.now) || Date.now()
    },
    attributedAt: Number(attribution.now) || Date.now()
  });
}

function attributeSyncedPostToVault({
  post = {},
  sessions = [],
  vault = [],
  now = Date.now()
} = {}) {
  const match = findGenerationMatch(post, sessions, { now });
  if (!match) return null;
  const draftIndex = (Array.isArray(vault) ? vault : [])
    .findIndex(item => item.generationId === match.session.id);
  if (draftIndex < 0) return null;

  const nextVault = vault.slice();
  const mergedPost = mergeAttributedPost(nextVault[draftIndex], post, {
    method: match.method,
    score: match.score,
    now
  });
  nextVault[draftIndex] = mergedPost;

  const nextSessions = (Array.isArray(sessions) ? sessions : []).map((session) => {
    if (session.id !== match.session.id) return session;
    return normalizeGenerationSession({
      ...session,
      publication: {
        statusId: post.statusId || '',
        postUrl: post.postUrl || '',
        publishedAt: post.createdAt || post.publishedAt || now,
        method: match.method,
        score: match.score
      },
      updatedAt: now
    });
  });

  return {
    match,
    post: mergedPost,
    vault: nextVault,
    sessions: nextSessions
  };
}

export {
  ATTRIBUTION_WINDOW_MS,
  DEFAULT_AMBIGUITY_GAP,
  DEFAULT_FUZZY_THRESHOLD,
  bigramSimilarity,
  attributeSyncedPostToVault,
  buildStudioSessionFromResult,
  buildVaultRecordFromSession,
  createGenerationSession,
  findGenerationMatch,
  mergeAttributedPost,
  normalizeAttributionText,
  recordGenerationAction,
  selectGenerationCandidate,
  updateGenerationSessionText
};
