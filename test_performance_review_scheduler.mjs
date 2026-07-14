import assert from 'node:assert/strict';
import {
  buildAutoReviewSchedule,
  getNextAutoReviewAtAfterFailure,
  repairAutoReviewRecord,
  shouldRepairAutoReview
} from './core/performanceReviewScheduler.js';
import { POST_STATUS } from './core/storageSchema.js';

const hour = 60 * 60 * 1000;
const publishedAt = 1700000000000;
const schedule = buildAutoReviewSchedule(publishedAt, {
  reviewDelayMs: 48 * hour,
  retryIntervalMs: 6 * hour,
  retryCount: 2
});

assert.deepEqual(schedule, [
  publishedAt + 48 * hour,
  publishedAt + 54 * hour,
  publishedAt + 60 * hour
]);

assert.equal(
  getNextAutoReviewAtAfterFailure(schedule, {
    now: publishedAt + 48 * hour + 1000,
    attempts: 1,
    retryIntervalMs: 6 * hour
  }),
  publishedAt + 54 * hour
);

assert.equal(
  getNextAutoReviewAtAfterFailure(schedule, {
    now: publishedAt + 60 * hour + 1000,
    attempts: 1,
    retryIntervalMs: 6 * hour,
    maxAttempts: 3
  }),
  publishedAt + 66 * hour + 1000
);

assert.equal(
  getNextAutoReviewAtAfterFailure(schedule, {
    now: publishedAt + 60 * hour + 1000,
    attempts: 3,
    retryIntervalMs: 6 * hour,
    maxAttempts: 3
  }),
  0
);

const stuckPending = {
  id: 'old-pending',
  status: POST_STATUS.PUBLISHED,
  publishedAt,
  autoReviewEnabled: false,
  nextAutoReviewAt: 0
};
assert.equal(shouldRepairAutoReview(stuckPending, { now: publishedAt + 72 * hour }), true);

const repaired = repairAutoReviewRecord(stuckPending, {
  now: publishedAt + 72 * hour,
  reviewDelayMs: 48 * hour,
  retryIntervalMs: 6 * hour,
  retryCount: 2
});
assert.equal(repaired.autoReviewEnabled, true);
assert.equal(repaired.nextAutoReviewAt, publishedAt + 72 * hour + 2 * 60 * 1000);
assert.equal(repaired.autoReviewSchedule.length, 3);

console.log('performance review scheduler checks passed');
