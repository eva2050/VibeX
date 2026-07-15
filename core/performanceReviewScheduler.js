const DEFAULT_POST_REVIEW_DELAY_MS = 48 * 60 * 60 * 1000;
const DEFAULT_RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RETRY_COUNT = 8;
const RETRY_GRACE_MS = 5 * 60 * 1000;
const REPAIR_DELAY_MS = 2 * 60 * 1000;

function toTimestamp(value, fallback = Date.now()) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function buildAutoReviewSchedule(publishedAt = Date.now(), options = {}) {
  const base = toTimestamp(publishedAt);
  const reviewDelayMs = Number(options.reviewDelayMs) || DEFAULT_POST_REVIEW_DELAY_MS;
  const retryIntervalMs = Number(options.retryIntervalMs) || DEFAULT_RETRY_INTERVAL_MS;
  const retryCount = Math.max(0, Number(options.retryCount ?? DEFAULT_RETRY_COUNT) || 0);
  return Array.from({ length: retryCount + 1 }, (_, index) => base + reviewDelayMs + (index * retryIntervalMs));
}

function getNextAutoReviewAtAfterFailure(schedule = [], options = {}) {
  const now = toTimestamp(options.now);
  const attempts = Math.max(0, Number(options.attempts) || 0);
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? (DEFAULT_RETRY_COUNT + 1)) || 1);
  const retryIntervalMs = Number(options.retryIntervalMs) || DEFAULT_RETRY_INTERVAL_MS;
  const graceMs = Number(options.graceMs) || RETRY_GRACE_MS;
  const futureScheduled = (Array.isArray(schedule) ? schedule : [])
    .map(ts => Number(ts))
    .filter(ts => Number.isFinite(ts) && ts > now + graceMs)
    .sort((a, b) => a - b)[0];

  if (futureScheduled) return futureScheduled;
  if (attempts >= maxAttempts) return 0;
  return now + retryIntervalMs;
}

function hasPerformanceReview(item = {}) {
  const metrics = item.performanceMetrics || {};
  return Number(item.actualViews || metrics.views || 0) > 0
    || Boolean(item.reviewedAt);
}

function shouldSchedulePerformanceReview({ posts = [] } = {}) {
  return (Array.isArray(posts) ? posts : []).some(item => item?.autoReviewEnabled
    && !item.learningDisabled
    && item.status !== 'reviewed'
    && Number(item.nextAutoReviewAt) > 0);
}

function shouldRepairAutoReview(item = {}, options = {}) {
  if (!item || item.status === 'reviewed' || hasPerformanceReview(item)) return false;
  const now = toTimestamp(options.now);
  const reviewDelayMs = Number(options.reviewDelayMs) || DEFAULT_POST_REVIEW_DELAY_MS;
  const publishedAt = toTimestamp(item.publishedAt || item.savedAt, 0);
  if (!publishedAt) return false;
  if (publishedAt + reviewDelayMs > now + RETRY_GRACE_MS) return false;
  return !item.autoReviewEnabled || !Number(item.nextAutoReviewAt || 0);
}

function repairAutoReviewRecord(item = {}, options = {}) {
  const now = toTimestamp(options.now);
  const publishedAt = toTimestamp(item.publishedAt || item.savedAt, now);
  const existingSchedule = Array.isArray(item.autoReviewSchedule)
    ? item.autoReviewSchedule.map(ts => Number(ts)).filter(ts => Number.isFinite(ts) && ts > 0)
    : [];
  const schedule = existingSchedule.length > 1
    ? existingSchedule
    : buildAutoReviewSchedule(publishedAt, options);
  return {
    ...item,
    autoReviewEnabled: true,
    autoReviewSchedule: schedule,
    nextAutoReviewAt: now + REPAIR_DELAY_MS,
    lastAutoReviewError: item.lastAutoReviewError || ''
  };
}

export {
  DEFAULT_POST_REVIEW_DELAY_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_INTERVAL_MS,
  buildAutoReviewSchedule,
  getNextAutoReviewAtAfterFailure,
  hasPerformanceReview,
  repairAutoReviewRecord,
  shouldSchedulePerformanceReview,
  shouldRepairAutoReview
};
