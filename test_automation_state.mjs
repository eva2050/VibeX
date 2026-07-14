import assert from 'node:assert/strict';

await import('./core/automationState.js');

const {
  EVENTS,
  PHASES,
  buildReplyFlowTransition,
  hasActiveReplyFlow,
  normalizeReplyFlowState
} = globalThis.VibeXAutomationState;

const now = 1700000000000;
const ttlMs = 180000;

let current = {};
let transition = buildReplyFlowTransition(current, EVENTS.START_GENERATION, {
  candidate: {
    tweetAuthor: 'alice',
    tweetStatusId: '123',
    tweetContent: 'AI workflow post'
  }
}, { now, ttlMs });

assert.equal(transition.phase, PHASES.GENERATING_REPLY);
assert.equal(transition.update.isGeneratingReply, true);
assert.equal(transition.update.isReplyTyping, false);
assert.equal(transition.update.isTyping, false);
assert.equal(transition.update.replyFlowLockUntil, now + ttlMs);
assert.equal(hasActiveReplyFlow(transition.update, { now: now + 1000, ttlMs }), true);

current = { ...current, ...transition.update };
transition = buildReplyFlowTransition(current, EVENTS.GENERATION_READY_TO_SEND, {}, { now: now + 1000, ttlMs });
assert.equal(transition.phase, PHASES.READY_TO_SEND);
assert.equal(transition.update.isGeneratingReply, false);
assert.equal(transition.update.isReplyTyping, true);
assert.equal(transition.update.isTyping, true);
assert.equal(transition.update.pendingReply, undefined);

current = { ...current, ...transition.update };
transition = buildReplyFlowTransition(current, EVENTS.PENDING_REPLY_CREATED, {
  pendingReply: {
    statusId: '123',
    replyText: 'Useful point.',
    tweetAuthor: 'alice'
  }
}, { now: now + 2000, ttlMs });
assert.equal(transition.phase, PHASES.PENDING_INTENT);
assert.equal(transition.update.pendingReply.createdAt, now + 2000);
assert.equal(transition.update.isReplyTyping, true);
assert.equal(transition.update.isTyping, true);

current = { ...current, ...transition.update };
transition = buildReplyFlowTransition(current, EVENTS.SENDING_STARTED, {}, { now: now + 3000, ttlMs });
assert.equal(transition.phase, PHASES.SENDING_REPLY);
assert.equal(transition.update.pendingReply.statusId, '123');

current = { ...current, ...transition.update };
transition = buildReplyFlowTransition(current, EVENTS.REPLY_COMPLETED, {}, { now: now + 4000, ttlMs });
assert.equal(transition.phase, PHASES.IDLE);
assert.equal(transition.update.isReplyTyping, false);
assert.equal(transition.update.isTyping, false);
assert.equal(transition.update.pendingReply, null);
assert.equal(transition.update.replyFlowLockUntil, 0);
assert.equal(hasActiveReplyFlow({ ...current, ...transition.update }, { now: now + 5000, ttlMs }), false);

const idempotentComplete = buildReplyFlowTransition(transition.update, EVENTS.REPLY_COMPLETED, {}, { now: now + 5000, ttlMs });
assert.equal(idempotentComplete.phase, PHASES.IDLE);
assert.equal(idempotentComplete.update.replyFlowLastEvent, EVENTS.REPLY_COMPLETED);

const stalePending = {
  replyFlowPhase: PHASES.PENDING_INTENT,
  isReplyTyping: true,
  pendingReply: {
    statusId: '999',
    replyText: 'stale',
    createdAt: now - ttlMs - 1
  },
  replyFlowLockUntil: now - 1
};
assert.equal(hasActiveReplyFlow(stalePending, { now, ttlMs }), false);
assert.equal(normalizeReplyFlowState(stalePending, { now, ttlMs }).phase, PHASES.IDLE);
assert.equal(normalizeReplyFlowState(stalePending, { now, ttlMs }).isStale, true);

const legacyReadyToSend = {
  isTyping: true,
  replyFlowLockUntil: now + ttlMs
};
assert.equal(normalizeReplyFlowState(legacyReadyToSend, { now, ttlMs }).phase, PHASES.READY_TO_SEND);
assert.equal(hasActiveReplyFlow({ isPosting: true, pendingPost: 'draft text' }, { now, ttlMs }), false);

assert.throws(
  () => buildReplyFlowTransition({ replyFlowPhase: PHASES.IDLE }, EVENTS.GENERATION_READY_TO_SEND, {}, { now, ttlMs }),
  /Illegal reply flow transition/
);

const failed = buildReplyFlowTransition(
  { replyFlowPhase: PHASES.GENERATING_REPLY, isGeneratingReply: true, replyFlowLockUntil: now + ttlMs },
  EVENTS.GENERATION_FAILED,
  { reason: 'model_error' },
  { now, ttlMs }
);
assert.equal(failed.phase, PHASES.IDLE);
assert.equal(failed.update.lastReplyFailure.reason, 'model_error');
assert.equal(failed.update.isGeneratingReply, false);
assert.equal(failed.update.pendingReply, null);

console.log('automation state checks passed');
