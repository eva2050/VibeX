import assert from 'node:assert/strict';

globalThis.VibeXAutomationState = {
  EVENTS: {
    REPLY_FAILED: 'REPLY_FAILED'
  },
  buildReplyFlowTransition: (state, event, payload = {}) => ({
    update: {
      replyFlowState: event,
      replyFlowReason: payload.reason || ''
    }
  }),
  REPLY_FLOW_STORAGE_KEYS: [
    'replyFlowPhase',
    'replyFlowLastEvent',
    'replyFlowUpdatedAt',
    'replyFlowLockUntil',
    'isGeneratingReply',
    'isReplyTyping',
    'isTyping',
    'activeReplyCandidate',
    'pendingReply'
  ],
  hasActiveReplyFlow: (state = {}) => Boolean(
    state.isGeneratingReply ||
    state.isReplyTyping ||
    state.isTyping ||
    state.activeReplyCandidate ||
    state.pendingReply ||
    (state.replyFlowLockUntil && state.replyFlowLockUntil > Date.now())
  )
};

const storageState = {};
globalThis.chrome = {
  storage: {
    local: {
      get(keys, callback) {
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(key => { result[key] = storageState[key]; });
        } else if (keys && typeof keys === 'object') {
          Object.entries(keys).forEach(([key, fallback]) => {
            result[key] = storageState[key] ?? fallback;
          });
        }
        callback(result);
      },
      set(items, callback) {
        Object.assign(storageState, items);
        setTimeout(() => callback?.(), 0);
      }
    }
  }
};

const { handleQueueMessage } = await import('./handlers/queueHandler.js');

async function callQueueMessage(request, context = {}) {
  return new Promise((resolve) => {
    const isAsync = handleQueueMessage(request, {}, resolve, {
      checkAndSetupAlarm: () => {},
      handlePostCompleted: () => Promise.resolve(),
      triggerPostInTab: () => {},
      ...context
    });
    if (!isAsync) setTimeout(() => resolve.timeout?.(), 5);
  });
}

{
  let checked = false;
  const response = await callQueueMessage({ action: 'queueUpdated' }, {
    checkAndSetupAlarm: () => { checked = true; }
  });
  assert.deepEqual(response, { success: true });
  assert.equal(checked, true);
}

{
  let completed = false;
  const response = await callQueueMessage({ action: 'postCompleted', source: 'queue' }, {
    handlePostCompleted: () => new Promise((resolve) => {
      setTimeout(() => {
        completed = true;
        resolve();
      }, 0);
    })
  });
  assert.deepEqual(response, { success: true });
  assert.equal(completed, true);
}

{
  const response = await callQueueMessage({ action: 'postFailed', reason: 'compose stuck' });
  assert.deepEqual(response, { success: true });
  assert.equal(storageState.isAutoPaused, true);
  assert.equal(storageState.pauseReason, 'compose stuck');
  assert.equal(storageState.isPosting, false);
}

{
  const response = await callQueueMessage({ action: 'replyFailed', reason: 'dialog closed' });
  assert.deepEqual(response, { success: true });
  assert.equal(storageState.replyFlowPhase, 'idle');
  assert.equal(storageState.replyFlowLastEvent, 'reply_failed');
  assert.equal(storageState.lastReplyFailure.reason, 'dialog closed');
  assert.equal(typeof storageState.twitterCooldownUntil, 'number');
}

{
  // testPostNow should be blocked while an auto-reply flow is active, using
  // the same hasActiveReplyFlow guard background.js#executeNextPost relies on.
  // A lock (or a fresh pendingReply) must be active too - matching the real
  // state machine in core/automationState.js, which treats stale flags alone
  // (e.g. a leftover isReplyTyping with no lock) as inactive/stale.
  storageState.isReplyTyping = true;
  storageState.replyFlowLockUntil = Date.now() + 60000;
  let triggered = false;
  const response = await callQueueMessage({ action: 'testPostNow', text: 'hello world' }, {
    triggerPostInTab: () => { triggered = true; }
  });
  assert.equal(response.success, false);
  assert.match(response.error, /自动回复/);
  assert.equal(triggered, false);
  assert.equal(storageState.pendingPost, undefined);
  delete storageState.isReplyTyping;
  delete storageState.replyFlowLockUntil;
}

{
  // testPostNow should proceed normally when no reply flow is active.
  let triggered = false;
  const response = await callQueueMessage({ action: 'testPostNow', text: 'hello world' }, {
    triggerPostInTab: () => { triggered = true; }
  });
  assert.equal(response.success, true);
  assert.equal(triggered, true);
  assert.equal(storageState.pendingPost, 'hello world');
}

console.log('queue handler checks passed');
