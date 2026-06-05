import { formatTweetForX, memoryValueToText } from './textUtils.js';
import { scoreObject, totalViralScore } from './scoreUtils.js';


function hashString(value = '') {
  let hash = 5381;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash >>>= 0;
  }
  return hash.toString(36);
}

function hasQueueId(value) {
  return value !== null && value !== undefined && String(value) !== '';
}

function buildDraftId(text, index) {
  return `draft-${hashString(text)}-${index}`;
}

function normalizeDraftQueue(queue = []) {
  const rawItems = Array.isArray(queue) ? queue : [];
  return rawItems
    .map((item, index) => {
      const rawText = typeof item === 'string' ? item : item?.text;
      const text = formatTweetForX(rawText);
      if (!text) return null;
      const scores = scoreObject(item?.scores || {});
      const storedScore = Number(item?.viralScore);
      const scheduledAt = Number(item?.scheduledAt);
      const nativeScheduleStatus = ['queued', 'scheduling', 'scheduled', 'failed'].includes(item?.nativeScheduleStatus)
        ? item.nativeScheduleStatus
        : '';
      const existingId = typeof item === 'object' && item ? item.id : null;
      return {
        id: hasQueueId(existingId) ? existingId : buildDraftId(text, index),
        text,
        type: typeof item === 'object' && item ? memoryValueToText(item.type || 'unknown') : 'legacy',
        viralScore: Number.isFinite(storedScore) ? storedScore : totalViralScore(scores),
        scores,
        scheduledAt: Number.isFinite(scheduledAt) ? scheduledAt : null,
        nativeScheduleStatus
      };
    })
    .filter(Boolean);
}

function findQueueItemIndex(queue = [], pendingPostId, pendingPostText) {
  const normalized = normalizeDraftQueue(queue);
  if (hasQueueId(pendingPostId)) {
    const byId = normalized.findIndex(item => String(item.id) === String(pendingPostId));
    if (byId >= 0) return byId;
  }

  const expectedText = formatTweetForX(pendingPostText || '');
  if (!expectedText) return -1;
  return normalized.findIndex(item => item.text === expectedText);
}

function removeCompletedQueueItem(queue = [], pendingPostId, pendingPostText) {
  const normalized = normalizeDraftQueue(queue);
  const index = findQueueItemIndex(normalized, pendingPostId, pendingPostText);
  if (index < 0) return normalized;
  return normalized.filter((_, itemIndex) => itemIndex !== index);
}

function updateQueueItem(queue = [], pendingPostId, pendingPostText, patch = {}) {
  const normalized = normalizeDraftQueue(queue);
  const index = findQueueItemIndex(normalized, pendingPostId, pendingPostText);
  if (index < 0) return normalized;
  return normalized.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
}

function queueNeedsNormalization(rawQueue, normalizedQueue) {
  if (!Array.isArray(rawQueue)) return false;
  if (rawQueue.length !== normalizedQueue.length) return true;
  return rawQueue.some((item, index) => {
    const normalized = normalizedQueue[index];
    if (!normalized) return true;
    if (!item || typeof item !== 'object') return true;
    if (!hasQueueId(item.id)) return true;
    return formatTweetForX(item.text) !== normalized.text;
  });
}
export { hashString, hasQueueId, buildDraftId, normalizeDraftQueue, findQueueItemIndex, removeCompletedQueueItem, updateQueueItem, queueNeedsNormalization };
