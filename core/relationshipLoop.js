import {
  LEARNING_OBJECTIVE,
  POST_CONTENT_MODE,
  POST_ORIGIN,
  POST_STATUS,
  normalizePostRecord
} from './storageSchema.js';

function normalizeRelationshipAuthor(value = '') {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

function relationshipFingerprint(input = {}) {
  const source = [
    String(input.sourceStatusId || ''),
    normalizeRelationshipAuthor(input.targetAuthor),
    String(input.replyText || '').trim()
  ].join('|');
  if (!source.replaceAll('|', '')) return '';
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) + hash) ^ source.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function buildRelationshipInteraction(input = {}) {
  const completedAt = Number(input.completedAt) || Date.now();
  const targetAuthor = String(input.targetAuthor || 'unknown').trim() || 'unknown';
  const fingerprint = relationshipFingerprint(input);
  return {
    id: String(input.id || (fingerprint
      ? `rel-${String(input.sourceStatusId || 'outbound')}-${fingerprint}`
      : `rel-${completedAt}-${Math.random().toString(36).slice(2, 8)}`)),
    objective: LEARNING_OBJECTIVE.AUTO_RELATIONSHIP,
    targetAuthor,
    authorKey: normalizeRelationshipAuthor(targetAuthor),
    sourceStatusId: String(input.sourceStatusId || ''),
    sourceUrl: String(input.sourceUrl || ''),
    sourceText: String(input.sourceText || ''),
    replyText: String(input.replyText || ''),
    engineLanguage: String(input.engineLanguage || 'unknown'),
    completedAt,
    replyBackAt: Number(input.replyBackAt) || 0,
    continuedAt: Number(input.continuedAt) || 0,
    followDetectedAt: Number(input.followDetectedAt) || 0,
    metrics: {
      outboundCompleted: 1,
      ...(input.replyBackAt ? { replyBackDetected: 1 } : {}),
      ...(input.continuedAt ? { continuationDetected: 1 } : {}),
      ...(input.followDetectedAt ? { followDetected: 1 } : {})
    }
  };
}

function aggregateRelationshipAuthors(interactions = []) {
  const grouped = new Map();
  (Array.isArray(interactions) ? interactions : []).forEach((item) => {
    const authorKey = item.authorKey || normalizeRelationshipAuthor(item.targetAuthor);
    if (!authorKey) return;
    const current = grouped.get(authorKey) || {
      authorKey,
      targetAuthor: item.targetAuthor || authorKey,
      outboundReplies: 0,
      replyBackCount: 0,
      continuationCount: 0,
      followDetectedCount: 0,
      lastInteractionAt: 0,
      repeatInteraction: false
    };
    current.outboundReplies += 1;
    current.replyBackCount += item.replyBackAt ? 1 : 0;
    current.continuationCount += item.continuedAt ? 1 : 0;
    current.followDetectedCount += item.followDetectedAt ? 1 : 0;
    current.lastInteractionAt = Math.max(current.lastInteractionAt, Number(item.completedAt) || 0);
    current.repeatInteraction = current.outboundReplies > 1;
    grouped.set(authorKey, current);
  });
  return [...grouped.values()].sort((left, right) => right.lastInteractionAt - left.lastInteractionAt);
}

function buildRelationshipVaultRecord(interaction = {}) {
  return normalizePostRecord({
    id: interaction.id,
    interactionId: interaction.id,
    text: interaction.replyText,
    source: interaction.sourceText,
    sourceStatusId: interaction.sourceStatusId,
    sourceUrl: interaction.sourceUrl,
    author: interaction.targetAuthor,
    authorName: interaction.targetAuthor,
    origin: POST_ORIGIN.AUTO_GENERATED,
    contentMode: POST_CONTENT_MODE.REPLY,
    objective: LEARNING_OBJECTIVE.AUTO_RELATIONSHIP,
    status: POST_STATUS.PUBLISHED,
    engineLanguage: interaction.engineLanguage,
    publishedAt: interaction.completedAt,
    savedAt: interaction.completedAt,
    relationshipMetrics: { ...(interaction.metrics || {}) }
  });
}

export {
  aggregateRelationshipAuthors,
  buildRelationshipInteraction,
  buildRelationshipVaultRecord,
  normalizeRelationshipAuthor,
  relationshipFingerprint
};
