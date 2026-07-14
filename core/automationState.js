(function initAutomationState(global) {
  'use strict';

  const DEFAULT_REPLY_FLOW_LOCK_TTL_MS = 3 * 60 * 1000;

  const PHASES = Object.freeze({
    IDLE: 'idle',
    GENERATING_REPLY: 'generating_reply',
    READY_TO_SEND: 'ready_to_send',
    PENDING_INTENT: 'pending_intent',
    SENDING_REPLY: 'sending_reply'
  });

  const EVENTS = Object.freeze({
    START_GENERATION: 'start_generation',
    GENERATION_READY_TO_SEND: 'generation_ready_to_send',
    GENERATION_SHADOW_DONE: 'generation_shadow_done',
    GENERATION_FAILED: 'generation_failed',
    PENDING_REPLY_CREATED: 'pending_reply_created',
    SENDING_STARTED: 'sending_started',
    REPLY_COMPLETED: 'reply_completed',
    REPLY_FAILED: 'reply_failed',
    CLEAR: 'clear'
  });

  const REPLY_FLOW_STORAGE_KEYS = Object.freeze([
    'replyFlowPhase',
    'replyFlowLastEvent',
    'replyFlowUpdatedAt',
    'replyFlowLockUntil',
    'isGeneratingReply',
    'isReplyTyping',
    'isTyping',
    'activeReplyCandidate',
    'pendingReply'
  ]);

  const LEGAL_TRANSITIONS = Object.freeze({
    [PHASES.IDLE]: new Set([
      EVENTS.START_GENERATION,
      EVENTS.PENDING_REPLY_CREATED,
      EVENTS.SENDING_STARTED,
      EVENTS.REPLY_COMPLETED,
      EVENTS.REPLY_FAILED,
      EVENTS.CLEAR
    ]),
    [PHASES.GENERATING_REPLY]: new Set([
      EVENTS.GENERATION_READY_TO_SEND,
      EVENTS.GENERATION_SHADOW_DONE,
      EVENTS.GENERATION_FAILED,
      EVENTS.REPLY_FAILED,
      EVENTS.CLEAR
    ]),
    [PHASES.READY_TO_SEND]: new Set([
      EVENTS.PENDING_REPLY_CREATED,
      EVENTS.SENDING_STARTED,
      EVENTS.REPLY_FAILED,
      EVENTS.CLEAR
    ]),
    [PHASES.PENDING_INTENT]: new Set([
      EVENTS.SENDING_STARTED,
      EVENTS.REPLY_COMPLETED,
      EVENTS.REPLY_FAILED,
      EVENTS.CLEAR
    ]),
    [PHASES.SENDING_REPLY]: new Set([
      EVENTS.REPLY_COMPLETED,
      EVENTS.REPLY_FAILED,
      EVENTS.CLEAR
    ])
  });

  function getNow(options = {}) {
    return Number(options.now) || Date.now();
  }

  function getTtlMs(options = {}) {
    const ttl = Number(options.ttlMs);
    return ttl > 0 ? ttl : DEFAULT_REPLY_FLOW_LOCK_TTL_MS;
  }

  function isKnownPhase(phase) {
    return Object.values(PHASES).includes(phase);
  }

  function inferReplyFlowPhase(state = {}, lockActive, pendingReplyFresh) {
    const replyTyping = Boolean(state.isReplyTyping || state.isTyping);
    if (state.isGeneratingReply) return PHASES.GENERATING_REPLY;
    if (state.pendingReply && replyTyping) return PHASES.SENDING_REPLY;
    if (state.pendingReply) return PHASES.PENDING_INTENT;
    if (replyTyping && (lockActive || pendingReplyFresh)) return PHASES.READY_TO_SEND;
    if (lockActive) return PHASES.READY_TO_SEND;
    return PHASES.IDLE;
  }

  function normalizeReplyFlowState(state = {}, options = {}) {
    const now = getNow(options);
    const ttlMs = getTtlMs(options);
    const lockUntil = Number(state.replyFlowLockUntil) || 0;
    const lockActive = lockUntil > now;
    const replyTyping = Boolean(state.isReplyTyping || state.isTyping);
    const pendingCreatedAt = Number(state.pendingReply?.createdAt) || 0;
    const pendingReplyFresh = Boolean(state.pendingReply)
      && (pendingCreatedAt ? now - pendingCreatedAt < ttlMs : lockActive || replyTyping);
    const explicitPhase = isKnownPhase(state.replyFlowPhase) ? state.replyFlowPhase : '';
    const inferredPhase = explicitPhase || inferReplyFlowPhase(state, lockActive, pendingReplyFresh);
    const activeByPhase = inferredPhase !== PHASES.IDLE && (lockActive || pendingReplyFresh);
    const activeByLegacyFlags = Boolean(state.isGeneratingReply || replyTyping) && (lockActive || pendingReplyFresh);
    const isActive = Boolean(lockActive || pendingReplyFresh || activeByPhase || activeByLegacyFlags);
    const phase = isActive ? inferredPhase : PHASES.IDLE;

    return {
      phase,
      explicitPhase,
      lockUntil,
      lockActive,
      pendingReplyFresh,
      pendingAgeMs: pendingCreatedAt ? now - pendingCreatedAt : 0,
      isActive,
      isStale: inferredPhase !== PHASES.IDLE && !isActive
    };
  }

  function hasActiveReplyFlow(state = {}, options = {}) {
    return normalizeReplyFlowState(state, options).isActive;
  }

  function buildLock(now, options) {
    return { replyFlowLockUntil: now + getTtlMs(options) };
  }

  function normalizePendingReply(pendingReply = {}, now) {
    return {
      ...pendingReply,
      createdAt: Number(pendingReply.createdAt) || now
    };
  }

  function buildIdleUpdate(event, now, extra = {}) {
    return {
      replyFlowPhase: PHASES.IDLE,
      replyFlowLastEvent: event,
      replyFlowUpdatedAt: now,
      isGeneratingReply: false,
      isReplyTyping: false,
      isTyping: false,
      replyFlowLockUntil: 0,
      activeReplyCandidate: null,
      pendingReply: null,
      ...extra
    };
  }

  function buildReplyFlowTransition(currentState = {}, event, payload = {}, options = {}) {
    const eventName = String(event || '');
    if (!Object.values(EVENTS).includes(eventName)) {
      throw new Error(`Unknown reply flow event: ${eventName || '(empty)'}`);
    }

    const now = getNow(options);
    const normalized = normalizeReplyFlowState(currentState, options);
    const allowed = LEGAL_TRANSITIONS[normalized.phase] || new Set();
    if (!allowed.has(eventName)) {
      throw new Error(`Illegal reply flow transition: ${normalized.phase} -> ${eventName}`);
    }

    const base = {
      replyFlowLastEvent: eventName,
      replyFlowUpdatedAt: now
    };

    if (eventName === EVENTS.CLEAR) {
      return {
        phase: PHASES.IDLE,
        update: buildIdleUpdate(eventName, now),
        previous: normalized
      };
    }

    if (eventName === EVENTS.START_GENERATION) {
      return {
        phase: PHASES.GENERATING_REPLY,
        update: {
          ...base,
          ...buildLock(now, options),
          replyFlowPhase: PHASES.GENERATING_REPLY,
          isGeneratingReply: true,
          isReplyTyping: false,
          isTyping: false,
          pendingReply: null,
          activeReplyCandidate: payload.candidate || payload.activeReplyCandidate || null
        },
        previous: normalized
      };
    }

    if (eventName === EVENTS.GENERATION_READY_TO_SEND) {
      return {
        phase: PHASES.READY_TO_SEND,
        update: {
          ...base,
          ...buildLock(now, options),
          replyFlowPhase: PHASES.READY_TO_SEND,
          isGeneratingReply: false,
          isReplyTyping: true,
          isTyping: true,
          activeReplyCandidate: payload.candidate || currentState.activeReplyCandidate || null
        },
        previous: normalized
      };
    }

    if (eventName === EVENTS.PENDING_REPLY_CREATED) {
      return {
        phase: PHASES.PENDING_INTENT,
        update: {
          ...base,
          ...buildLock(now, options),
          replyFlowPhase: PHASES.PENDING_INTENT,
          isGeneratingReply: false,
          isReplyTyping: true,
          isTyping: true,
          pendingReply: normalizePendingReply(payload.pendingReply || payload, now),
          activeReplyCandidate: payload.candidate || currentState.activeReplyCandidate || null
        },
        previous: normalized
      };
    }

    if (eventName === EVENTS.SENDING_STARTED) {
      return {
        phase: PHASES.SENDING_REPLY,
        update: {
          ...base,
          ...buildLock(now, options),
          replyFlowPhase: PHASES.SENDING_REPLY,
          isGeneratingReply: false,
          isReplyTyping: true,
          isTyping: true,
          pendingReply: payload.pendingReply || currentState.pendingReply || null,
          activeReplyCandidate: payload.candidate || currentState.activeReplyCandidate || null
        },
        previous: normalized
      };
    }

    if (eventName === EVENTS.GENERATION_SHADOW_DONE) {
      return {
        phase: PHASES.IDLE,
        update: buildIdleUpdate(eventName, now),
        previous: normalized
      };
    }

    if (eventName === EVENTS.GENERATION_FAILED) {
      return {
        phase: PHASES.IDLE,
        update: buildIdleUpdate(eventName, now, {
          lastReplyFailure: payload.reason ? { reason: payload.reason, time: now } : currentState.lastReplyFailure
        }),
        previous: normalized
      };
    }

    if (eventName === EVENTS.REPLY_COMPLETED) {
      return {
        phase: PHASES.IDLE,
        update: buildIdleUpdate(eventName, now, {
          replyFlowCompletedAt: now
        }),
        previous: normalized
      };
    }

    if (eventName === EVENTS.REPLY_FAILED) {
      return {
        phase: PHASES.IDLE,
        update: buildIdleUpdate(eventName, now, {
          lastReplyFailure: payload.reason ? { reason: payload.reason, time: now } : currentState.lastReplyFailure
        }),
        previous: normalized
      };
    }

    throw new Error(`Unhandled reply flow event: ${eventName}`);
  }

  function applyReplyFlowEvent(storage, event, payload = {}, extra = {}, callback) {
    if (typeof extra === 'function') {
      callback = extra;
      extra = {};
    }
    if (!storage?.get || !storage?.set) {
      throw new Error('A chrome.storage.local-compatible storage object is required');
    }
    storage.get(REPLY_FLOW_STORAGE_KEYS, (currentState = {}) => {
      let result;
      try {
        result = buildReplyFlowTransition(currentState, event, payload);
      } catch (error) {
        callback?.({ success: false, error: error.message });
        return;
      }
      const update = { ...result.update, ...(extra || {}) };
      storage.set(update, () => {
        callback?.({ success: true, phase: result.phase, previous: result.previous, update });
      });
    });
  }

  global.VibeXAutomationState = Object.freeze({
    DEFAULT_REPLY_FLOW_LOCK_TTL_MS,
    PHASES,
    EVENTS,
    REPLY_FLOW_STORAGE_KEYS,
    LEGAL_TRANSITIONS,
    normalizeReplyFlowState,
    hasActiveReplyFlow,
    buildReplyFlowTransition,
    applyReplyFlowEvent
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
