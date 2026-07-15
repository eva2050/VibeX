import { formatTweetForX, formatReplyForX, memoryValueToText } from './utils/textUtils.js';
import { normalizeDraftQueue, removeCompletedQueueItem, updateQueueItem, queueNeedsNormalization } from './utils/queueUtils.js';
import { bestViralCandidate, getGeneratedReplyRejectionReason } from './utils/scoreUtils.js';
import { getStorage, setStorage, addLog, getConfigErrors, getAIConnectionErrors, canAutoPublish } from './core/state.js';
import { callLLM } from './services/llm.js';
import { performTrustedClick } from './services/twitter.js';
import { connectXWithOAuth, getXOAuthRequestPreview, normalizeXAuth } from './services/xApi.js';
import { generateSingleTweetDraft, normalizeAgentMemory, mergeAgentMemory } from './core/automation.js';
import { buildGenerationContext } from './core/generationContext.js';
import { POST_CONTENT_MODE, POST_ORIGIN, POST_STATUS, STORAGE_SCHEMA_VERSION, migrateStoragePayload, normalizeAiMemory, normalizePostRecord } from './core/storageSchema.js';
import { applyPerformanceReview, buildAccountPerformanceBaseline, updateAiMemoryWithReviewedPost } from './core/performanceLoop.js';
import { DEFAULT_POST_REVIEW_DELAY_MS, buildAutoReviewSchedule, getNextAutoReviewAtAfterFailure, repairAutoReviewRecord, shouldRepairAutoReview, shouldSchedulePerformanceReview } from './core/performanceReviewScheduler.js';
import { getLanguageInstruction, getLanguageName, getPromptText, normalizeEngineLanguage, toPreferredLanguage } from './core/i18n.js';
import { buildInitialAutoPersona, localizeAutoPersona, resolveAutoPersonaLanguage } from './core/autoPersona.js';
import { inferDominantAccountLanguage, normalizeDetectedAccountLanguage } from './core/accountLanguage.js';
import { buildReplyStrategyInstruction } from './core/replyStrategies.js';
import { formatStyleSampleLearningForPrompt, getStyleSamples } from './core/styleLearning.js';
import { attributeSyncedPostToVault } from './core/generationAttribution.js';
import { REPLY_RETRY_LOCK_MS, DEFAULT_AGENT_MEMORY, AGENT_MEMORY_LABELS, GROWTH_PLAYBOOKS, DEFAULT_INTERACTION_TARGETS, PROJECT_ACCOUNT_HANDLES, DEFAULT_DISCOVERY_KEYWORDS, selectGrowthPlaybook } from './core/constants.js';
import { setupMessageRouter } from "./handlers/messageRouter.js";
import './core/automationState.js';
import { normalizeContentSkillRollout } from './core/contentSkillRollout.js';

const { EVENTS: REPLY_FLOW_EVENTS, buildReplyFlowTransition, hasActiveReplyFlow } = globalThis.VibeXAutomationState;

console.log('[VibeX] ✅ Service Worker started successfully. All modules loaded.');

const PERFORMANCE_REVIEW_ALARM = 'performanceReviewAlarm';
const POST_REVIEW_DELAY_MS = DEFAULT_POST_REVIEW_DELAY_MS;
const POST_TRIGGER_COOLDOWN_MS = 25 * 1000;
const POSTING_LOCK_TTL_MS = 20 * 1000;

function isFreshPostingLock(state = {}, now = Date.now()) {
  return Boolean(state.isPosting && now - Number(state.isPostingStartedAt || 0) < POSTING_LOCK_TTL_MS);
}


// background.js

// Storage Abstraction (Promise Wrapper)

function runStorageMigration() {
  chrome.storage.local.get([
    'storageSchemaVersion',
    'draftVault',
    'aiMemory',
    'generationSessions',
    'relationshipInteractions'
  ], (res) => {
    if (Number(res.storageSchemaVersion) >= STORAGE_SCHEMA_VERSION) return;
    const migrated = migrateStoragePayload(res);
    const updates = {
      storageSchemaVersion: migrated.storageSchemaVersion,
      draftVault: migrated.draftVault,
      aiMemory: migrated.aiMemory,
      generationSessions: migrated.generationSessions,
      relationshipInteractions: migrated.relationshipInteractions
    };
    chrome.storage.local.set(updates, () => {
      addLog('info', 'storage_migrated', [STORAGE_SCHEMA_VERSION]);
    });
  });
}

runStorageMigration();
repairPendingPerformanceReviews();
schedulePerformanceReviewAlarm();













// Initialize local defaults for the current local-first extension experience.
chrome.storage.local.get(['apiKey', 'collectedTweets', 'leadTarget', 'contentSkillRollout'], (res) => {
  const updates = {};
  if (!res.leadTarget) {
    updates.leadTarget = 'VibeX Growth';
  }
  if (!res.collectedTweets) {
    updates.collectedTweets = [];
  }
  const normalizedRollout = normalizeContentSkillRollout(res.contentSkillRollout);
  if (JSON.stringify(res.contentSkillRollout || {}) !== JSON.stringify(normalizedRollout)) {
    updates.contentSkillRollout = normalizedRollout;
  }
  
  chrome.storage.local.set(updates);
});





















function normalizeHandleList(values = []) {
  return values
    .flatMap(value => String(value || '').split(/[\s,，、\n]+/))
    .map(item => item.trim().replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '').replace(/^@/, '').split('/')[0])
    .filter(item => /^[A-Za-z0-9_]{1,15}$/.test(item));
}

function formatHandleList(values = []) {
  return [...new Set(normalizeHandleList(values))].join('\n');
}

function formatPersonalHandleList(values = []) {
  return [...new Set(normalizeHandleList(values))]
    .filter(handle => !PROJECT_ACCOUNT_HANDLES.has(handle.toLowerCase()))
    .join('\n');
}

function getDefaultInteractionTargets(context = {}) {
  const explicitArchetype = context.id
    || context.strategyArchetype
    || context.onboardingStrategy?.strategyArchetype;
  if (DEFAULT_INTERACTION_TARGETS[explicitArchetype]) {
    return DEFAULT_INTERACTION_TARGETS[explicitArchetype];
  }
  const playbook = selectGrowthPlaybook(context);
  return DEFAULT_INTERACTION_TARGETS[playbook.id] || DEFAULT_INTERACTION_TARGETS.indie_builder;
}

function getDefaultDiscoveryKeywords(context = {}) {
  const explicitArchetype = context.id
    || context.strategyArchetype
    || context.onboardingStrategy?.strategyArchetype;
  if (DEFAULT_DISCOVERY_KEYWORDS[explicitArchetype]) {
    return DEFAULT_DISCOVERY_KEYWORDS[explicitArchetype];
  }
  const playbook = selectGrowthPlaybook(context);
  return DEFAULT_DISCOVERY_KEYWORDS[playbook.id] || DEFAULT_DISCOVERY_KEYWORDS.indie_builder;
}

function collectSignalText(...items) {
  return items
    .map(item => memoryValueToText(item))
    .join('\n')
    .toLowerCase();
}



// selectGrowthPlaybook is now imported from core/constants.js

function formatReplyOpportunity(opportunity = {}) {
  const score = Number(opportunity.score);
  const reasons = Array.isArray(opportunity.reasons) ? opportunity.reasons.join('、') : '';
  const age = Number.isFinite(Number(opportunity.ageMinutes)) ? `${Number(opportunity.ageMinutes)} 分钟前` : '';
  const lines = [];
  if (Number.isFinite(score)) lines.push(`互动机会分：${score}`);
  if (reasons) lines.push(`入选原因：${reasons}`);
  if (age) lines.push(`发布时间：${age}`);
  if (opportunity.isTargetAuthor) lines.push('作者属于优先互动账号。');
  if (opportunity.topicRelevant) lines.push('内容主题与账号策略相关。');
  return lines.length > 0 ? `【本次互动机会判断】\n${lines.join('\n')}` : '';
}

























































chrome.runtime.onInstalled.addListener((details) => {
  console.log("VibeX extension installed.");
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }
  
  if (details.reason === 'update') {
    // Force clear tweet queue on update to ensure any old language drafts are flushed out
    // (No longer flushing tweet queue as instant-generation is used)
    addLog('info', 'extension_updated');
  } else {
    addLog('info', 'extension_installed');
  }

  // 初始化默认配置
  chrome.storage.local.get(['apiKey', 'targetUsers', 'promptTemplate', 'isRunning'], (result) => {
    if (!result.hasOwnProperty('isRunning')) {
      chrome.storage.local.set({
        isRunning: false,
        apiKey: '',
        apiProvider: 'gemini',
        aiModel: 'gemini-2.5-flash',
        targetUsers: '',
        promptTemplate: '你是一个 X 账号增长顾问。请根据推文内容，先判断是否值得回复；如果值得，只写一条自然、有信息增量、像真人评论的短回复。\n不要硬广，不要让对方看主页/私信/关注/领取，除非原推明确在求资源、教程、工具或链接。\n\n【推文】：{tweet}\n【可用引流信息，仅在强相关且对方明确求资源时使用】：{leadTarget}\n\n回复：',
        leadTarget: '',
        agentMemory: DEFAULT_AGENT_MEMORY,
        agentChatMessages: [],
        postInterval: 30,
        replyInterval: 30,
        postDeliveryMode: 'local',
        collectedTweets: []
      });
    }
  });
});

// 处理来自 content scripts 或 side panel 的消息
setupMessageRouter({
  generateAIResponse,
  refreshXOfficialDraftCount,
  handleXLoginDetected,
  startAccountAutoSetup,
  analyzeOnboardingSource,
  handleAgentChat,
  maybeStartAgentAfterSetup,
  triggerPostInTab,
  handlePostCompleted,
  checkAndSetupAlarm,
  runInitialBaselineScan,
  reviewNextPendingPost,
  connectXAccount,
  disconnectXAccount,
  syncConnectedXData,
  updateProfileFromSamples,
  ensureAutomationXTab,
  getIsSidePanelOpen: () => typeof isSidePanelOpen !== "undefined" ? isSidePanelOpen : false
});

function refreshXOfficialDraftCount(sendResponse) {
  chrome.storage.local.set({
    xOfficialDraftStatus: 'reading',
    xOfficialDraftError: ''
  }, () => {
    chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
      const target = tabs.find(t => t.active) || tabs[0];
      if (!target) {
        const error = '未找到已打开的 X 页面';
        chrome.storage.local.set({
          xOfficialDraftStatus: 'failed',
          xOfficialDraftError: error,
          xOfficialDraftReadAt: Date.now()
        });
        sendResponse?.({ success: false, error });
        return;
      }

      chrome.tabs.sendMessage(target.id, { action: 'readXOfficialDraftCount' }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          const error = chrome.runtime.lastError?.message || response?.error || 'X 页面未响应草稿读取';
          chrome.storage.local.set({
            xOfficialDraftStatus: 'failed',
            xOfficialDraftError: error,
            xOfficialDraftReadAt: Date.now()
          });
          sendResponse?.({ success: false, error });
          return;
        }
        sendResponse?.({ success: true, count: response.count });
      });
    });
  });
}

// ==========================================
// Configuration Check
// ==========================================












function handleXLoginDetected() {
  chrome.storage.local.get(['xLoginSettingsOpened', 'apiKey', ], (res) => {
    const ready = Boolean(res.apiKey);
    if (res.xLoginSettingsOpened || ready) return;

    chrome.storage.local.set({ xLoginSettingsOpened: true }, () => {
      addLog('info', 'x_login_detected');
    });
  });
}

function startAccountAutoSetup(sendResponse) {
  chrome.storage.local.set({
    profileReadRequested: true,
    setupAutoStartRequested: true,
    isAutoPaused: false,
    pauseReason: '',
    profileReadProgress: {
      stage: 'queued',
      message: '已开始读取 X 账号，等待页面响应...',
      percent: 10,
      updatedAt: Date.now()
    }
  }, () => {
    chrome.storage.local.get([], (res) => {
      if (res.accountBio) {
        addLog('info', 'profile_reanalysis_started');
        analyzeAccountPersona(res.accountBio);
        sendResponse({ success: true, message: '已使用当前简介开始 AI 分析' });
        return;
      }

      triggerProfileReadInTab();
      sendResponse({ success: true, message: '已开始读取 X 账号，请保持 X 页面已登录' });
    });
  });
}

function triggerProfileReadInTab() {
  chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
    const target = tabs.find(t => t.active) || tabs[0];
    if (!target) {
      addLog('info', 'x_tab_missing_open_home');
      chrome.tabs.create({ url: 'https://x.com/home', active: true });
      return;
    }

    chrome.tabs.sendMessage(target.id, { action: 'forceReadProfileBio' }, () => {
      if (chrome.runtime.lastError) {
        addLog('warn', 'x_tab_read_unresponsive', [chrome.runtime.lastError.message]);
        chrome.tabs.update(target.id, { url: 'https://x.com/home', active: true });
      }
    });
  });
}

function maybeStartAgentAfterSetup(sendResponse) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', ], (res) => {
    const errors = getConfigErrors(res);
    const ready = errors.length === 0  && Boolean(res.competitorReport);
    if (!ready) {
      if (errors.length > 0) chrome.storage.local.set({ configErrors: errors });
      sendResponse?.({ success: true, started: false, errors });
      return;
    }

    chrome.storage.local.set({
      isRunning: true,
      isAutoPaused: false,
      pauseReason: '',
      twitterCooldownUntil: 0,
      apiCooldownUntil: 0,
      isPosting: false,
      isPostingStartedAt: 0,
      ...buildReplyFlowTransition({}, REPLY_FLOW_EVENTS.CLEAR).update,
      setupAutoStartRequested: false,
      configErrors: []
    }, () => {
      chrome.storage.local.remove(['configErrors']);
      addLog('success', 'strategy_setup_completed');
      sendResponse?.({ success: true, started: true });
    });
  });
}

// ==========================================
// LLM Calling
// ==========================================




function checkAndSetupAlarm() {
  chrome.storage.local.get(['isRunning', 'onboardingStrategy'], (result) => {
    if (!result.isRunning) {
       chrome.alarms.clear("postTweetAlarm");
       return;
    }
    if (!canAutoPublish(result)) {
      chrome.alarms.clear("postTweetAlarm");
      chrome.storage.local.set({ nextPostTime: '自动发帖已关闭' });
      return;
    }
    chrome.alarms.get("postTweetAlarm", (alarm) => {
      if (!alarm) {
        scheduleNextPost();
      }
    });
  });
}

function ensureAutomationXTab(options = {}) {
  const active = Boolean(options.active);
  const reason = options.reason || 'automation_start';
  chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
    const target = tabs.find(tab => tab.active) || tabs[0];
    if (!target?.id) {
      addLog('info', 'automation_x_home_opened');
      chrome.tabs.create({ url: 'https://x.com/home', active });
      return;
    }

    chrome.tabs.sendMessage(target.id, { action: 'startAutomationLoop', reason }, () => {
      if (chrome.runtime.lastError) {
        addLog('warn', 'automation_x_tab_wake_failed', [chrome.runtime.lastError.message]);
        chrome.tabs.update(target.id, { url: 'https://x.com/home', active });
        return;
      }
      addLog('info', 'automation_x_tab_awakened');
    });
  });
}

// ==========================================
// Post Scheduling
// ==========================================
function parseTimeSlots(slotsStr) {
  if (!slotsStr) return [{ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 }];
  return slotsStr.split(',').map(s => {
    const parts = s.trim().split('-');
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    return { start: isNaN(start) ? 0 : start, end: isNaN(end) ? 24 : end };
  }).filter(s => s.start < s.end);
}

function scheduleNextPost() {
  const now = new Date();
  chrome.storage.local.get([
    'postsToday', 'lastPostDate', 'isAutoPaused',
    'automationStartTime', 'sessionPostCount', 'onboardingStrategy'
  ], (res) => {
    if (res.isAutoPaused) {
      addLog('info', 'automation_paused_skip_schedule');
      return;
    }
    
    const mode = res.onboardingStrategy?.automationMode || 'autoEngage';
    
    // Auto-Reply mode doesn't post at all
    if (mode === 'autoReply') {
      chrome.alarms.clear("postTweetAlarm");
      chrome.storage.local.set({ nextPostTime: '当前模式仅互动，暂停自动发帖' });
      return;
    }

    const pCount = res.sessionPostCount || 0;
    let delayMs;
    
    // Immediate First Action
    if (pCount === 0) {
      delayMs = (Math.floor(Math.random() * 3) + 1) * 60000; // 1-3 mins
    } else {
      // Dynamic intervals based on mode pacing targets (per 10h)
      // autoEngage: 10-15 per 10h -> 40-60 mins
      // autoPost: 15-20 per 10h -> 30-40 mins
      let minMins = 30;
      let maxMins = 40;
      if (mode === 'autoEngage') {
        minMins = 40;
        maxMins = 60;
      }
      
      const randomMins = Math.floor(Math.random() * (maxMins - minMins + 1)) + minMins;
      delayMs = randomMins * 60000;
    }
    
    const targetTimeMs = now.getTime() + delayMs;
    const targetTime = new Date(targetTimeMs);
    setAlarmAtDate(targetTime, 'auto_post_scheduled', [targetTime.toLocaleTimeString()]);
  });
}

function scheduleInterval(now, config) {
  const interval = (config.postInterval || 60) * 60000;
  const targetTime = new Date(now.getTime() + interval);
  const targetHour = targetTime.getHours();
  const targetMin = targetTime.getMinutes();
  const addDays = targetTime.getDate() !== now.getDate() ? 1 : 0;
  setAlarm(targetHour, targetMin, addDays);
  addLog('info', 'post_schedule_fixed', [targetTime.toLocaleString()]);
}

function scheduleSmart(now, config, postsToday, postsPerDay) {
  const slots = parseTimeSlots(config.smartTimeSlots);
  if (slots.length === 0) {
    addLog('warn', 'smart_slots_empty');
    slots.push({ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 });
  }
  
  const hour = now.getHours();
  let targetSlot = null;
  let addDays = 0;
  
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (hour < slot.start) {
      // 当前时间在该时段开始之前
      targetSlot = slot;
      break;
    } else if (hour >= slot.start && hour < slot.end) {
      // 当前时间在该时段内，跳到下一个时段
      if (i + 1 < slots.length) {
        targetSlot = slots[i + 1];
      } else {
        targetSlot = slots[0];
        addDays = 1;
      }
      break;
    }
  }
  
  // 当前时间在所有时段之后
  if (!targetSlot) {
    targetSlot = slots[0];
    addDays = 1;
  }
  
  const range = Math.max(1, targetSlot.end - targetSlot.start);
  const targetHour = targetSlot.start + Math.floor(Math.random() * range);
  const targetMin = Math.floor(Math.random() * 60);
  
  setAlarm(targetHour, targetMin, addDays);
  const targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, targetHour, targetMin);
  addLog('info', 'post_schedule_smart', [targetTime.toLocaleString(), postsToday, postsPerDay]);
}

function scheduleForTomorrow(now, config) {
  // 达到每日上限后，统一安排到次日第一个时段的随机时间点
  const slots = parseTimeSlots(config.smartTimeSlots);
  const firstSlot = slots[0] || { start: 8, end: 10 };
  const range = Math.max(1, firstSlot.end - firstSlot.start);
  const targetHour = firstSlot.start + Math.floor(Math.random() * range);
  const targetMin = Math.floor(Math.random() * 60);
  setAlarm(targetHour, targetMin, 1);
}

function setAlarm(targetHour, targetMin, addDays) {
  const now = new Date();
  let targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, targetHour, targetMin, 0, 0);
  
  if (targetTime.getTime() <= now.getTime()) {
      targetTime = new Date(now.getTime() + 5 * 60000); // fallback 5 mins later
  }

  setAlarmAtDate(targetTime);
}

function setAlarmAtDate(targetTime, logKey = 'next_post_scheduled_default', logArgs = []) {
  chrome.alarms.clear("postTweetAlarm", () => {
    chrome.alarms.create("postTweetAlarm", { when: targetTime.getTime() });
  });
  const args = Array.isArray(logArgs) && logArgs.length > 0 ? logArgs : [targetTime.toLocaleString()];
  addLog('info', logKey, args);
  chrome.storage.local.set({ nextPostTime: targetTime.toLocaleString() }, () => {
      chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
  });
}

function chooseMinute(start = 0) {
  const min = Math.max(0, Math.min(59, Number(start) || 0));
  return min + Math.floor(Math.random() * Math.max(1, 60 - min));
}

function buildSmartSchedulePlan(count, config = {}) {
  const now = new Date();
  const slots = parseTimeSlots(config.smartTimeSlots);
  if (slots.length === 0) {
    slots.push({ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 });
  }
  const postsPerDay = Math.max(1, Number(config.postsPerDay) || 20);
  const plan = [];
  let dayOffset = 0;

  while (plan.length < count && dayOffset < 21) {
    const baseDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 0, 0, 0, 0);
    const availableSlots = slots
      .map((slot) => {
        const range = Math.max(1, slot.end - slot.start);
        const hour = slot.start + Math.floor(Math.random() * range);
        const minute = chooseMinute();
        return new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate(), hour, minute, 0, 0);
      })
      .filter(date => date.getTime() > now.getTime() + 5 * 60000)
      .sort((a, b) => a.getTime() - b.getTime());

    availableSlots.slice(0, postsPerDay).forEach(date => {
      if (plan.length < count) plan.push(date.getTime());
    });
    dayOffset++;
  }

  return plan;
}

function buildIntervalSchedulePlan(count, config = {}) {
  const interval = Math.max(15, Number(config.postInterval) || 60) * 60000;
  const firstAt = Date.now() + Math.max(interval, 10 * 60000);
  return Array.from({ length: count }, (_, index) => firstAt + index * interval);
}

function buildPostSchedulePlan(count, config = {}) {
  if (count <= 0) return [];
  return (config.postScheduleMode || 'smart') === 'interval'
    ? buildIntervalSchedulePlan(count, config)
    : buildSmartSchedulePlan(count, config);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "postTweetAlarm") {
    addLog('info', 'post_timer_triggered');
    executeNextPost();
  } else if (alarm.name === PERFORMANCE_REVIEW_ALARM) {
    addLog('info', 'auto_review_started');
    reviewNextPendingPost();
  } else if (alarm.name === "autoShutdownAlarm") {
    addLog('warn', 'max_work_time_reached');
    chrome.storage.local.set({ isRunning: false });
  }
});

async function executeNextPost() {
  const result = await getStorage(['pendingPost', 'postsToday', 'lastPostDate', 'postsPerDay', 'isAutoPaused', 'isGenerating', 'isPosting', 'isPostingStartedAt', 'lastPostTriggerAt', 'onboardingStrategy', 'replyFlowLockUntil', 'isGeneratingReply', 'isReplyTyping', 'isTyping', 'pendingReply', 'replyFlowPhase', 'accountBio', 'aiPersona', 'isAnalyzingPersona']);
  if (!canAutoPublish(result)) {
    chrome.alarms.clear("postTweetAlarm");
    await setStorage({ nextPostTime: '自动发帖已关闭' });
    return;
  }

  if (result.isAutoPaused) {
    addLog('info', 'automation_paused_skip_post');
    return;
  }
  
  if (result.isGenerating) {
    addLog('info', 'post_generation_busy');
    return;
  }

  if (isFreshPostingLock(result)) {
    addLog('info', 'post_publish_busy');
    return;
  }

  if (hasActiveReplyFlow(result)) {
    // Posting and auto-reply share the same X tab/DOM. Don't fire a post send while a reply
    // is mid-flight (generating/pending-intent/sending) — it can collide with the reply's
    // compose dialog. Reply flow locks are short-lived (<=3min), so just retry shortly.
    addLog('info', 'post_skipped_reply_flow_busy');
    chrome.alarms.create("postTweetAlarm", { delayInMinutes: 0.5 });
    return;
  }
  
  if (result.pendingPost) {
     triggerPostInTab();
     return;
  }
  
  const postsPerDay = result.postsPerDay || 20;
  const todayStr = new Date().toDateString();
  const postsToday = result.lastPostDate === todayStr ? (result.postsToday || 0) : 0;
  if (postsToday >= postsPerDay) {
    addLog('info', 'daily_post_limit_reached', [postsToday, postsPerDay]);
    scheduleForTomorrow(new Date(), result);
    return;
  }

  // Self-heal: if the account still has a placeholder/weak persona (e.g. the
  // one-time LLM analysis after connecting X never ran or failed silently -
  // missing API key at connect time, a dropped request, etc.), kick off a
  // real analysis in the background now. Don't await it or block this post -
  // it just means this cycle still uses whatever persona is on file, and the
  // next cycle gets a real one instead of staying stuck on the placeholder.
  if (result.accountBio && !result.isAnalyzingPersona && isWeakAutoPersona(result.aiPersona || {})) {
    addLog('info', 'persona_self_heal_triggered');
    analyzeAccountPersona(result.accountBio);
  }

  try {
    await setStorage({ isGenerating: true });
    const generatedDraft = await generateSingleTweetDraft();
    const postText = typeof generatedDraft === 'string' ? generatedDraft : generatedDraft?.text;
    const formattedText = formatTweetForX(postText);
    
    if (!formattedText) {
       addLog('warn', 'empty_generated_post');
       await setStorage({ isGenerating: false });
       checkAndSetupAlarm();
       return;
    }
    
    await setStorage({ 
      pendingPost: formattedText,
      pendingPostId: Date.now() + Math.random(),
      pendingPostSource: 'instant_gen',
      pendingPostMetadata: typeof generatedDraft === 'object' ? {
        contentSkillId: generatedDraft.contentSkillId || '',
        contentSkillVersion: generatedDraft.contentSkillVersion || '',
        contentFamily: generatedDraft.contentFamily || ''
      } : null,
      isGenerating: false
    });
    
    addLog('info', 'post_generation_success');
    triggerPostInTab();
  } catch (err) {
    // Errors are logged inside generateSingleTweetDraft, just clear the lock and wait for next alarm.
    await setStorage({ isGenerating: false });
    checkAndSetupAlarm();
  }
}

function getIntentPostUrl(text) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text || '')}`;
}

function triggerPostInTab() {
  chrome.storage.local.get(['pendingPost', 'isPosting', 'isPostingStartedAt', 'lastPostTriggerAt', 'replyFlowLockUntil', 'isGeneratingReply', 'isReplyTyping', 'isTyping', 'pendingReply', 'replyFlowPhase'], (result) => {
    if (isFreshPostingLock(result)) {
      addLog('info', 'post_publish_busy');
      return;
    }
    if (hasActiveReplyFlow(result)) {
      addLog('info', 'post_skipped_reply_flow_busy');
      chrome.alarms.create("postTweetAlarm", { delayInMinutes: 0.5 });
      return;
    }
    const now = Date.now();
    if (now - Number(result.lastPostTriggerAt || 0) < POST_TRIGGER_COOLDOWN_MS) {
      addLog('info', 'post_trigger_cooling_down');
      return;
    }
    chrome.storage.local.set({ lastPostTriggerAt: now });
    const intentUrl = getIntentPostUrl(result.pendingPost || '');
    chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
      if (tabs.length > 0) {
        let tab = tabs.find(t => t.active) || tabs[0];
        addLog('info', 'send_post_command_to_tab', [tab.id]);
        chrome.tabs.sendMessage(tab.id, { action: "postNewTweet" }, () => {
          if (chrome.runtime.lastError) {
            addLog('warn', 'content_script_unresponsive_open_intent', [chrome.runtime.lastError.message]);
            chrome.tabs.create({ url: intentUrl, active: true });
          }
        });
      } else {
        addLog('info', 'no_x_tab_open_intent');
        chrome.tabs.create({ url: intentUrl });
      }
    });
  });
}

function upsertAutoPostToVault({ id, text, source, publishedAt, postUrl, statusId, metadata = {} }) {
  const normalizedText = formatTweetForX(text || '');
  if (!normalizedText) return Promise.resolve(false);

  return new Promise((resolve) => {
    chrome.storage.local.get({ draftVault: [] }, (res) => {
      const vault = Array.isArray(res.draftVault) ? res.draftVault.slice(0, 100) : [];
      const stableId = id ? String(id) : `auto-${publishedAt || Date.now()}`;
      const reviewSchedule = buildAutoReviewSchedule(publishedAt || Date.now());
      const existingIndex = vault.findIndex((item) => {
        if (item?.id && String(item.id) === stableId) return true;
        return item?.source === 'auto_generated' && formatTweetForX(item.text || '') === normalizedText;
      });
      const existing = existingIndex >= 0 ? vault[existingIndex] : null;
      const nextItem = normalizePostRecord({
        ...(existing || {}),
        id: stableId,
        text: normalizedText,
        originalAIOutput: existing?.originalAIOutput || normalizedText,
        source: POST_ORIGIN.AUTO_GENERATED,
        origin: POST_ORIGIN.AUTO_GENERATED,
        contentMode: POST_CONTENT_MODE.POST,
        author: existing?.author || 'Auto Agent',
        authorName: existing?.authorName || 'Auto Agent',
        postSource: source || 'instant_gen',
        status: POST_STATUS.PUBLISHED,
        postUrl: postUrl || existing?.postUrl || '',
        statusId: statusId || existing?.statusId || '',
        savedAt: existing?.savedAt || publishedAt || Date.now(),
        publishedAt: publishedAt || Date.now(),
        autoReviewEnabled: true,
        autoReviewAttempts: existing?.autoReviewAttempts || 0,
        autoReviewSchedule: existing?.autoReviewSchedule || reviewSchedule,
        nextAutoReviewAt: existing?.nextAutoReviewAt || reviewSchedule[0],
        lastAutoReviewError: existing?.lastAutoReviewError || '',
        contentSkillId: existing?.contentSkillId || metadata.contentSkillId || '',
        contentSkillVersion: existing?.contentSkillVersion || metadata.contentSkillVersion || '',
        contentFamily: existing?.contentFamily || metadata.contentFamily || ''
      });

      if (existingIndex >= 0) {
        vault[existingIndex] = nextItem;
      } else {
        vault.unshift(nextItem);
      }

      chrome.storage.local.set({ draftVault: vault.slice(0, 100) }, () => {
        addLog('success', 'post_saved_to_posts');
        schedulePerformanceReviewAlarm();
        resolve(true);
      });
    });
  });
}

function normalizeAuthorIdentity(value = '') {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function isLikelyAuthorOnlySyncedText(text = '', user = {}) {
  const normalizedText = normalizeAuthorIdentity(text);
  if (!normalizedText) return false;
  const candidates = [user.name, user.username, user.screenName, user.handle]
    .map(normalizeAuthorIdentity)
    .filter(Boolean);
  return candidates.includes(normalizedText);
}

function buildSyncedXPostRecord(post = {}, user = {}, existing = null) {
  const text = formatTweetForX(post.text || existing?.text || '');
  const rawStatusId = String(post.statusId || '').trim();
  const rawPostId = String(post.id || rawStatusId || '').trim();
  const hasRealStatusId = /^\d+$/.test(rawStatusId);
  const stableKey = hasRealStatusId ? rawStatusId : rawPostId;
  if (!text || !stableKey || isLikelyAuthorOnlySyncedText(text, user)) return null;
  const createdAt = Number(post.createdAt) || Number(existing?.createdAt) || Date.now();
  const shouldReviewNow = Date.now() - createdAt >= POST_REVIEW_DELAY_MS;
  const metrics = post.performanceMetrics || existing?.performanceMetrics || {};
  const language = normalizeDetectedAccountLanguage(post.language || post.lang || existing?.language || '');
  const views = shouldReviewNow ? (Number(post.actualViews || metrics.views || 0) || 0) : 0;
  const finalMetrics = {
    ...(existing?.performanceMetrics || {}),
    ...(shouldReviewNow ? metrics : {})
  };
  if (!views && Number(existing?.performanceMetrics?.views || 0) > 0) {
    finalMetrics.views = Number(existing.performanceMetrics.views) || 0;
  }
  const alreadyReviewed = Boolean(existing?.xLearningRecordedAt || existing?.status === POST_STATUS.REVIEWED);
  const canAutoReview = hasRealStatusId || Boolean(post.postUrl);
  const reviewSchedule = existing?.autoReviewSchedule || buildAutoReviewSchedule(createdAt);
  const nextReviewAt = alreadyReviewed
    ? 0
    : Number(existing?.nextAutoReviewAt || 0) || reviewSchedule[0];
  return normalizePostRecord({
    ...(existing || {}),
    id: existing?.id || (hasRealStatusId ? `x-${rawStatusId}` : `x-scan-${stableKey.slice(0, 80)}`),
    text: existing?.text || text,
    originalAIOutput: existing?.originalAIOutput || text,
    source: POST_ORIGIN.X_SYNCED,
    origin: existing?.origin || POST_ORIGIN.X_SYNCED,
    contentMode: post.contentMode || existing?.contentMode || POST_CONTENT_MODE.POST,
    author: user.username ? `@${user.username}` : existing?.author || 'X',
    authorName: user.name || existing?.authorName || user.username || 'X',
    accountId: String(user.id || user.username || existing?.accountId || ''),
    postSource: post.postSource || existing?.postSource || 'profile_scan',
    status: alreadyReviewed || views > 0 ? POST_STATUS.REVIEWED : POST_STATUS.PUBLISHED,
    postUrl: post.postUrl || existing?.postUrl || (hasRealStatusId && user.username ? `https://x.com/${user.username}/status/${rawStatusId}` : ''),
    statusId: hasRealStatusId ? rawStatusId : existing?.statusId || '',
    savedAt: existing?.savedAt || createdAt,
    publishedAt: existing?.publishedAt || createdAt,
    createdAt,
    actualViews: views || existing?.actualViews || 0,
    performanceMetrics: finalMetrics,
    language: language || existing?.language || '',
    reviewedAt: alreadyReviewed ? existing?.reviewedAt || 0 : (views > 0 ? Date.now() : existing?.reviewedAt || 0),
    autoReviewEnabled: !alreadyReviewed && canAutoReview,
    autoReviewAttempts: existing?.autoReviewAttempts || 0,
    autoReviewSchedule: reviewSchedule,
    nextAutoReviewAt: canAutoReview ? nextReviewAt : 0,
    learningDisabled: Boolean(existing?.learningDisabled),
    learningDisabledAt: existing?.learningDisabledAt || 0,
    lastSyncedAt: Date.now(),
    syncedFromX: true
  });
}

function mergeSyncedXPostsIntoVault(vault = [], posts = [], user = {}, options = {}) {
  const normalizedVault = (Array.isArray(vault) ? vault : []).slice(0, 100).map(normalizePostRecord);
  const hiddenKeys = new Set((Array.isArray(options.hiddenXPostKeys) ? options.hiddenXPostKeys : []).map(String));
  const nextVault = options.replaceProfileScan
    ? normalizedVault.filter((item) => {
      const isProfileScan = item.origin === POST_ORIGIN.X_SYNCED
        && (item.postSource === 'profile_scan' || item.lastSyncedFrom === 'profile_scan' || item.syncedFromX);
      return !isProfileScan;
    })
    : normalizedVault;
  let added = 0;
  let updated = 0;
  let reviewedAdded = 0;
  const reviewedPostsForLearning = [];
  let nextGenerationSessions = Array.isArray(options.generationSessions)
    ? options.generationSessions.slice(0, 100)
    : [];

  posts.forEach((post) => {
    const rawStatusId = String(post?.statusId || '').trim();
    const rawPostId = String(post?.id || rawStatusId || '').trim();
    const hasRealStatusId = /^\d+$/.test(rawStatusId);
    const stableKey = hasRealStatusId ? rawStatusId : rawPostId;
    if (!stableKey) return;
    const idKey = hasRealStatusId ? `x-${rawStatusId}` : `x-scan-${stableKey.slice(0, 80)}`;
    if (hiddenKeys.has(stableKey) || hiddenKeys.has(idKey) || hiddenKeys.has(rawStatusId)) return;
    const existingIndex = nextVault.findIndex((item) => {
      if (hasRealStatusId && String(item.statusId || '') === rawStatusId) return true;
      return String(item.id || '') === idKey;
    });
    const existing = existingIndex >= 0 ? nextVault[existingIndex] : null;
    const hadLoopLearning = Boolean(existing?.xLearningRecordedAt || existing?.status === POST_STATUS.REVIEWED);
    let record = buildSyncedXPostRecord(post, user, existing);
    if (!record) return;
    if (options.postSource) {
      record = normalizePostRecord({
        ...record,
        postSource: options.postSource,
        lastSyncedFrom: options.postSource
      });
    }
    let targetIndex = existingIndex;
    if (targetIndex < 0 && nextGenerationSessions.length > 0) {
      const attributed = attributeSyncedPostToVault({
        post: {
          ...record,
          accountId: String(user.id || user.username || record.accountId || '')
        },
        sessions: nextGenerationSessions,
        vault: nextVault,
        now: Date.now()
      });
      if (attributed) {
        nextGenerationSessions = attributed.sessions;
        targetIndex = nextVault.findIndex(item => item.generationId === attributed.match.session.id);
        record = normalizePostRecord({
          ...attributed.post,
          syncedFromX: true,
          lastSyncedAt: Date.now()
        });
      }
    }
    const metrics = record.performanceMetrics || {};
    const isMature = Date.now() - Number(record.publishedAt || record.createdAt || 0) >= POST_REVIEW_DELAY_MS;
    const hasViews = isMature && Number(record.actualViews || metrics.views || 0) > 0;
    if (hasViews) {
      const reviewed = applyPerformanceReview(record, metrics, nextVault);
      if (reviewed?.post) {
        record = normalizePostRecord({
          ...reviewed.post,
          syncedFromX: true,
          lastSyncedAt: Date.now(),
          xLearningRecordedAt: existing?.xLearningRecordedAt || 0
        });
      }
    }

    if (targetIndex >= 0) {
      nextVault[targetIndex] = record;
      updated += 1;
    } else {
      nextVault.unshift(record);
      added += 1;
    }

    if (hasViews && !hadLoopLearning && !record.learningDisabled) {
      const learnedAt = Date.now();
      record = normalizePostRecord({
        ...record,
        xLearningRecordedAt: learnedAt
      });
      if (targetIndex >= 0) {
        nextVault[targetIndex] = record;
      } else {
        nextVault[0] = record;
      }
      reviewedPostsForLearning.push(record);
      reviewedAdded += 1;
    }
  });

  nextVault.sort((a, b) => Number(b.publishedAt || b.savedAt || 0) - Number(a.publishedAt || a.savedAt || 0));
  return {
    vault: nextVault.slice(0, 100),
    added,
    updated,
    reviewedAdded,
    reviewedPostsForLearning,
    generationSessions: nextGenerationSessions
  };
}

function getMergeLearningSummary(merged = {}) {
  return {
    added: Number(merged.added || 0),
    updated: Number(merged.updated || 0),
    reviewedAdded: Number(merged.reviewedAdded || 0)
  };
}

function getXSyncStatusPatch(status, details = {}, previous = {}) {
  const previousProfileEnrichedAt = Number(previous?.profileEnrichedAt || 0) || 0;
  const next = {
    ...(previousProfileEnrichedAt ? { profileEnrichedAt: previousProfileEnrichedAt } : {}),
    status,
    updatedAt: Date.now(),
    ...details
  };
  return {
    xDataSyncStatus: next
  };
}

function setXSyncStatus(status, details = {}) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['xDataSyncStatus'], (res) => {
      chrome.storage.local.set(getXSyncStatusPatch(status, details, res.xDataSyncStatus || {}), () => {
        resolve();
      });
    });
  });
}

function getPostMetricValue(post = {}, metricName = 'views') {
  const metrics = post.performanceMetrics || {};
  if (metricName === 'views') {
    return Number(post.actualViews || metrics.views || 0) || 0;
  }
  return Number(metrics[metricName] || 0) || 0;
}

function getTopPerformanceSamples(posts = [], limit = 6) {
  const candidates = (Array.isArray(posts) ? posts : [])
    .filter(post => post?.text)
    .filter(post => getPostMetricValue(post, 'views') > 0 || getPostMetricValue(post, 'likes') > 0);
  const sortBy = (metricName, mode = '') => candidates
    .filter(post => !mode || post.contentMode === mode)
    .slice()
    .sort((a, b) => {
      const metricDiff = getPostMetricValue(b, metricName) - getPostMetricValue(a, metricName);
      if (metricDiff) return metricDiff;
      return getPostMetricValue(b, 'views') - getPostMetricValue(a, 'views');
    })
    .slice(0, limit);
  return {
    topByViews: sortBy('views'),
    topByLikes: sortBy('likes'),
    topPostsByViews: sortBy('views', POST_CONTENT_MODE.POST),
    topPostsByLikes: sortBy('likes', POST_CONTENT_MODE.POST),
    topRepliesByViews: sortBy('views', POST_CONTENT_MODE.REPLY),
    topRepliesByLikes: sortBy('likes', POST_CONTENT_MODE.REPLY)
  };
}

function getPostEngagementScore(post = {}) {
  const metrics = post.performanceMetrics || {};
  return (
    getPostMetricValue(post, 'views')
    + (Number(metrics.likes) || 0) * 80
    + (Number(metrics.reposts) || 0) * 180
    + (Number(metrics.replies) || 0) * 120
  );
}

function normalizeStyleSampleText(text = '') {
  return formatTweetForX(String(text || '').replace(/https?:\/\/\S+/gi, '').trim());
}

function buildPerformanceBaselinePayload(posts = [], extra = {}) {
  const baseline = buildAccountPerformanceBaseline(posts);
  const samples = getTopPerformanceSamples(posts, 6);
  const topPosts = posts
    .filter(item => getPostMetricValue(item, 'views') > 0)
    .slice()
    .sort((a, b) => getPostMetricValue(b, 'views') - getPostMetricValue(a, 'views'))
    .slice(0, 24);
  return {
    ...baseline,
    ...extra,
    sampledCount: Number(extra.sampledCount || extra.count || posts.length || topPosts.length),
    topPosts,
    ...samples
  };
}

async function saveScannedXPostsToVault(posts = [], scanMeta = {}) {
  const items = await getStorage(['draftVault', 'aiMemory', 'accountPerformanceBaseline', 'xAuth', 'engineLanguage', 'onboardingStrategy', 'aiPersona', 'xDataSyncStatus', 'hiddenXPostKeys', 'generationSessions']);
  const auth = normalizeXAuth(items.xAuth || {});
  const user = auth.user || {};
  const handle = scanMeta.handle || user.username || '';
  const sourcePosts = Array.isArray(posts) ? posts : [];
  const merged = mergeSyncedXPostsIntoVault(items.draftVault || [], sourcePosts, {
    ...user,
    username: handle || user.username || ''
  }, {
    postSource: scanMeta.source || 'profile_scan',
    hiddenXPostKeys: items.hiddenXPostKeys || [],
    generationSessions: items.generationSessions || []
  });
  let aiMemory = items.aiMemory || {};
  merged.reviewedPostsForLearning.forEach((post) => {
    aiMemory = updateAiMemoryWithReviewedPost(aiMemory, post);
  });
  const languageSignal = inferDominantAccountLanguage(sourcePosts);
  const detectedLanguage = languageSignal.language || '';
  const currentEngineLanguage = String(items.engineLanguage || 'auto').trim() || 'auto';
  const shouldApplyDetectedLanguage = Boolean(detectedLanguage && currentEngineLanguage === 'auto');
  const nextOnboardingStrategy = shouldApplyDetectedLanguage
    ? {
      ...(items.onboardingStrategy || {}),
      preferredLanguage: toPreferredLanguage(detectedLanguage, globalThis.navigator?.language || '')
    }
    : items.onboardingStrategy;
  const localizedPersona = shouldApplyDetectedLanguage
    ? localizeAutoPersona(
      items.aiPersona || {},
      user,
      detectedLanguage,
      globalThis.navigator?.language || '',
      detectedLanguage
    )
    : { persona: items.aiPersona || {}, changed: false };

  const baselinePayload = buildPerformanceBaselinePayload(merged.vault, {
    handle,
    sampledCount: scanMeta.sampledCount || scanMeta.count || sourcePosts.length,
    updatedBy: scanMeta.updatedBy || scanMeta.source || 'profile_scan',
    detectedLanguage,
    languageConfidence: languageSignal.confidence || 0,
    languageSampleCount: languageSignal.sampleCount || 0,
    languageCounts: languageSignal.counts || {}
  });

  const updates = {
    draftVault: merged.vault,
    generationSessions: merged.generationSessions,
    aiMemory,
    ...getXSyncStatusPatch(scanMeta.status || 'page_scan', {
      source: scanMeta.source || 'profile_scan',
      count: sourcePosts.length,
      sampledCount: scanMeta.sampledCount || scanMeta.count || sourcePosts.length,
      candidateCount: sourcePosts.length,
      error: scanMeta.error || '',
      learned: getMergeLearningSummary(merged),
      detectedLanguage,
      languageConfidence: languageSignal.confidence || 0,
      languageSampleCount: languageSignal.sampleCount || 0,
      languageCounts: languageSignal.counts || {}
    }, items.xDataSyncStatus || {}),
    accountPerformanceBaseline: {
      ...(items.accountPerformanceBaseline || {}),
      ...baselinePayload
    }
  };

  if (detectedLanguage) {
    updates.accountLanguage = detectedLanguage;
    updates.accountLanguageConfidence = languageSignal.confidence || 0;
    updates.accountLanguageDetectedAt = Date.now();
  }
  if (shouldApplyDetectedLanguage) {
    updates.engineLanguage = detectedLanguage;
    updates.onboardingStrategy = nextOnboardingStrategy;
    if (localizedPersona.changed) updates.aiPersona = localizedPersona.persona;
  }
  if (scanMeta.enrichProfile) {
    updates.xDataSyncStatus = {
      ...(updates.xDataSyncStatus || {}),
      profileEnrichedAt: Date.now()
    };
  }

  await setStorage(updates);
  if (scanMeta.enrichProfile) {
    addLog('success', 'profile_context_synced');
  }
  if (shouldApplyDetectedLanguage) {
    addLog('info', 'account_language_detected', [
      detectedLanguage,
      Math.round((languageSignal.confidence || 0) * 100)
    ]);
  }

  schedulePerformanceReviewAlarm();
  return merged;
}

function normalizeProfileUserFromScan(profile = {}, fallbackUser = {}) {
  const username = String(profile.username || profile.handle || fallbackUser.username || '').replace(/^@/, '').trim();
  const name = String(profile.name || fallbackUser.name || '').trim();
  const description = String(profile.description || fallbackUser.description || '').trim();
  const profileImageUrl = String(profile.profile_image_url || profile.avatarUrl || fallbackUser.profile_image_url || '').trim();
  if (!username && !name && !description && !profileImageUrl) return fallbackUser || null;
  return {
    ...(fallbackUser || {}),
    id: fallbackUser?.id || username || '',
    name,
    username,
    description,
    profile_image_url: profileImageUrl,
    public_metrics: {
      ...(fallbackUser?.public_metrics || {}),
      followers_count: Number(profile.followersCount ?? fallbackUser?.public_metrics?.followers_count) || 0,
      following_count: Number(profile.followingCount ?? fallbackUser?.public_metrics?.following_count) || 0,
      tweet_count: Number(profile.postCount ?? fallbackUser?.public_metrics?.tweet_count) || 0
    },
    source: profile.source || fallbackUser?.source || 'profile_scan'
  };
}

async function mergeProfileScanIntoAuth(profile = {}) {
  const { xAuth } = await getStorage(['xAuth']);
  const auth = normalizeXAuth(xAuth || {});
  if (!auth.accessToken) return auth;
  const user = normalizeProfileUserFromScan(profile, auth.user || {});
  const nextAuth = {
    ...auth,
    user,
    profileScannedAt: Date.now()
  };
  await setStorage({ xAuth: nextAuth });
  return nextAuth;
}

function schedulePerformanceReviewAlarm() {
  chrome.storage.local.get({ draftVault: [] }, (res) => {
    const now = Date.now();
    const posts = Array.isArray(res.draftVault) ? res.draftVault : [];
    if (!shouldSchedulePerformanceReview({ posts, now })) {
      chrome.alarms.clear(PERFORMANCE_REVIEW_ALARM);
      return;
    }
    const nextPost = posts
      .filter(item => item?.autoReviewEnabled
        && !item.learningDisabled
        && item.status !== POST_STATUS.REVIEWED
        && Number(item.nextAutoReviewAt) > 0)
      .sort((a, b) => Number(a.nextAutoReviewAt) - Number(b.nextAutoReviewAt))[0];

    chrome.alarms.create(PERFORMANCE_REVIEW_ALARM, {
      when: Math.max(now + 60 * 1000, Number(nextPost.nextAutoReviewAt))
    });
  });
}

function repairPendingPerformanceReviews() {
  chrome.storage.local.get({ draftVault: [] }, (res) => {
    const vault = Array.isArray(res.draftVault) ? res.draftVault.slice(0, 100).map(normalizePostRecord) : [];
    let changed = false;
    const repaired = vault.map((item) => {
      if (!shouldRepairAutoReview(item)) return item;
      changed = true;
      return normalizePostRecord(repairAutoReviewRecord(item));
    });
    if (!changed) return;
    chrome.storage.local.set({ draftVault: repaired }, () => {
      schedulePerformanceReviewAlarm();
    });
  });
}

async function connectXAccount(clientId) {
  let auth = null;
  try {
    const previous = await getStorage(['xDataSyncStatus']);
    const preview = await getXOAuthRequestPreview(clientId);
    addLog('info', 'x_oauth_request', [
      preview.clientId,
      preview.redirectUri,
      preview.scope,
      preview.flow,
      preview.codeChallengeMethod,
      preview.fallbackRedirectUri || 'none'
    ]);
    auth = await connectXWithOAuth(clientId);
    await setStorage({
      xAuth: auth,
      ...getXSyncStatusPatch('syncing', {
        source: 'x_connect',
        count: 0,
        sampledCount: 0,
        error: ''
      }, previous.xDataSyncStatus || {})
    });
    addLog('success', auth.user?.username ? 'x_connected_with_handle' : 'x_connected', [auth.user?.username || '']);
  } catch (error) {
    addLog('error', 'x_connect_failed', [error.message || String(error)]);
    throw error;
  }

  runInitialBaselineScan({ force: true });
  schedulePerformanceReviewAlarm();
  return {
    success: true,
    user: auth.user
  };
}

async function disconnectXAccount() {
  await setStorage({ xAuth: normalizeXAuth({}), xDataSyncStatus: {} });
  addLog('info', 'x_disconnected');
  return { success: true };
}

async function syncConnectedXData(options = {}) {
  const { xAuth, xDataSyncStatus } = await getStorage(['xAuth', 'xDataSyncStatus']);
  const auth = normalizeXAuth(xAuth || {});
  if (!auth.accessToken) {
    throw new Error('X is not connected');
  }
  if (!options.enrichProfile || options.updateProfileFromSamples || options.skipAutoPersonaAnalysis) {
    await setStorage({ profileAutoAnalyzeBlockedUntil: Date.now() + 2 * 60 * 1000 });
  }
  await setStorage(getXSyncStatusPatch('syncing', {
    source: 'profile_scan',
    count: 0,
    sampledCount: 0,
    error: ''
  }, xDataSyncStatus || {}));
  runInitialBaselineScan({
    force: true,
    enrichProfile: Boolean(options.enrichProfile),
    updateProfileFromSamples: Boolean(options.updateProfileFromSamples),
    skipAutoPersonaAnalysis: Boolean(options.skipAutoPersonaAnalysis),
    openVisible: Boolean(options.openVisible),
    openCreatorCenter: Boolean(options.openCreatorCenter)
  });
  schedulePerformanceReviewAlarm();
  return {
    success: true,
    user: auth.user || null,
    source: 'profile_scan',
    enrichProfile: Boolean(options.enrichProfile),
    updateProfileFromSamples: Boolean(options.updateProfileFromSamples)
  };
}

function getReviewTargetUrl(item = {}) {
  if (item.postUrl) return item.postUrl;
  if (item.statusId && item.author) return `https://x.com/${String(item.author).replace(/^@/, '')}/status/${item.statusId}`;
  return '';
}

function normalizeXHandle(value = '') {
  const handle = String(value || '').replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return '';
  if (['auto', 'agent', 'autoagent', 'x', 'unknown', '未知用户'].includes(handle.toLowerCase())) return '';
  return handle;
}

function addUniqueUrl(urls, url) {
  const clean = String(url || '').trim();
  if (clean && !urls.includes(clean)) urls.push(clean);
}

function getPostSearchSnippet(text = '') {
  const firstLine = String(text || '')
    .split('\n')
    .map(line => line.trim())
    .find(Boolean) || '';
  return firstLine
    .replace(/https?:\/\/\S+/g, '')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

async function getReviewTargetUrls(item = {}) {
  const urls = [];
  addUniqueUrl(urls, item.postUrl);
  const itemAuthor = normalizeXHandle(item.author);
  if (item.statusId && itemAuthor) {
    addUniqueUrl(urls, `https://x.com/${itemAuthor}/status/${item.statusId}`);
  }

  const { xAuth, accountBio } = await getStorage(['xAuth', 'accountBio']);
  const auth = normalizeXAuth(xAuth || {});
  const connectedHandle = normalizeXHandle(auth.user?.username);
  const bioHandle = normalizeXHandle(
    String(accountBio || '').match(/(?:x\.com\/|twitter\.com\/|@)([A-Za-z0-9_]{1,15})/)?.[1] || ''
  );
  const handle = itemAuthor || connectedHandle || bioHandle;
  const snippet = getPostSearchSnippet(item.text);

  if (handle && snippet) {
    const searchQuery = `from:${handle} "${snippet}" -filter:replies -filter:retweets`;
    addUniqueUrl(urls, `https://x.com/search?q=${encodeURIComponent(searchQuery)}&src=typed_query&f=live`);
    addUniqueUrl(urls, `https://x.com/search?q=${encodeURIComponent(searchQuery)}&src=typed_query&f=top`);
  }
  if (handle) addUniqueUrl(urls, `https://x.com/${handle}`);
  addUniqueUrl(urls, getReviewTargetUrl(item));
  addUniqueUrl(urls, 'https://x.com/home');
  return urls;
}

function requestPerformanceSnapshot(tabId, item) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, {
      action: 'readPostPerformance',
      postId: item.id,
      statusId: item.statusId || '',
      postText: item.text || '',
      author: item.author || ''
    }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { success: false, error: 'empty response' });
    });
  });
}

function isMissingReceivingEndError(message = '') {
  return /receiving end does not exist|could not establish connection|message channel closed/i.test(String(message || ''));
}

function waitForTabLoadComplete(tabId, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        if (tab?.status === 'complete') {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 500);
      });
    };
    check();
  });
}

function injectXContentScripts(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'core/automationState.js',
        'content/logic/evaluator.js',
        'content/x_scraper.js'
      ]
    }, () => {
      const error = chrome.runtime.lastError?.message || '';
      resolve({ success: !error || /already been declared|Cannot create item with duplicate id/i.test(error), error });
    });
  });
}

async function requestPerformanceSnapshotWithInjection(tabId, item) {
  let response = await requestPerformanceSnapshot(tabId, item);
  if (!isMissingReceivingEndError(response?.error)) return response;
  await waitForTabLoadComplete(tabId);
  const injection = await injectXContentScripts(tabId);
  await new Promise(resolve => setTimeout(resolve, 800));
  response = await requestPerformanceSnapshot(tabId, item);
  if (response?.success || !isMissingReceivingEndError(response?.error)) return response;
  return {
    ...response,
    error: injection.error
      ? `${response.error}; injection: ${injection.error}`
      : response.error
  };
}

function requestProfileBaselineSnapshot(tabId, limit = 30) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, {
      action: 'scanProfilePerformanceBaseline',
      limit
    }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { success: false, error: 'empty response' });
    });
  });
}

function scrollTabForBaselineScan(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        window.scrollBy({ top: Math.max(window.innerHeight * 1.25, 900), behavior: 'smooth' });
      }
    }, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function markAutomationSystemNavigation() {
  chrome.storage.local.set({ botNavigationTime: Date.now() });
}

function getProfileUrlForBaselineScan(callback) {
  chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
    chrome.storage.local.get(['xAuth'], (res) => {
      const connectedHandle = String(res.xAuth?.user?.username || '').replace(/^@/, '').toLowerCase();
      const isProfileTab = (tab, requiredHandle = '') => {
        try {
          const url = new URL(tab.url || '');
          const first = url.pathname.split('/').filter(Boolean)[0] || '';
          if (!/^[A-Za-z0-9_]{1,15}$/.test(first)) return false;
          if (['home', 'explore', 'notifications', 'messages', 'settings', 'search', 'compose', 'intent', 'login', 'logout', 'oauth', 'share', 'i'].includes(first.toLowerCase())) return false;
          return !requiredHandle || first.toLowerCase() === requiredHandle;
        } catch (_) {
          return false;
        }
      };
      const connectedProfileTab = connectedHandle ? tabs.find(tab => isProfileTab(tab, connectedHandle)) : null;
      if (connectedProfileTab?.url) {
        callback(connectedProfileTab.url);
        return;
      }
      if (connectedHandle) {
        callback(`https://x.com/${connectedHandle}`);
        return;
      }
      const profileTab = tabs.find(tab => isProfileTab(tab));
      if (profileTab?.url) {
        callback(profileTab.url);
        return;
      }
      callback('https://x.com/home');
    });
  });
}

function requestCreatorCenterSnapshot(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'scanCreatorCenterSnapshot' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { success: false, error: 'empty response' });
    });
  });
}

function collectCreatorCenterSnapshotForProfileSync() {
  return new Promise((resolve) => {
    markAutomationSystemNavigation();
    chrome.tabs.create({ url: 'https://x.com/i/creator_center', active: false }, async (tab) => {
      if (!tab?.id) {
        resolve(null);
        return;
      }
      addLog('info', 'creator_center_opened');
      await waitForTabLoadComplete(tab.id);
      await new Promise(done => setTimeout(done, 2500));
      let response = await requestCreatorCenterSnapshot(tab.id);
      if (!response?.success && isMissingReceivingEndError(response?.error)) {
        await injectXContentScripts(tab.id);
        await new Promise(done => setTimeout(done, 1000));
        response = await requestCreatorCenterSnapshot(tab.id);
      }
      if (response?.success && response.text) {
        await setStorage({
          creatorCenterSnapshot: {
            url: response.url || '',
            text: response.text,
            capturedAt: response.capturedAt || Date.now()
          }
        });
        addLog('success', 'creator_center_synced');
      }
      resolve(response || null);
    });
  });
}

function runPageBaselineScan(options = {}) {
  getProfileUrlForBaselineScan((url) => {
    markAutomationSystemNavigation();
    chrome.tabs.create({ url, active: Boolean(options.openVisible) }, (tab) => {
      if (!tab?.id) return;
      const startedAt = Date.now();
      const scanReadLimit = options.enrichProfile ? 30 : 60;
      const targetCandidateCount = options.enrichProfile ? 18 : 24;
      let bestResponse = null;
      let attempts = 0;
      const tryRead = () => {
        attempts += 1;
        requestProfileBaselineSnapshot(tab.id, scanReadLimit).then((response) => {
          const hasPosts = response?.success && Array.isArray(response.posts) && response.posts.length > 0;
          const hasProfile = response?.success && Boolean(response.profile?.username || response.profile?.handle || response.handle);
          if (hasPosts || hasProfile) {
            const responseCandidateCount = Number(response.sampledCount || response.count || 0);
            const bestCandidateCount = Number(bestResponse?.sampledCount || bestResponse?.count || 0);
            const responseTopScore = getPostEngagementScore(response.posts?.[0] || {});
            const bestTopScore = getPostEngagementScore(bestResponse?.posts?.[0] || {});
            if (
              !bestResponse
              || responseCandidateCount > bestCandidateCount
              || (responseCandidateCount === bestCandidateCount && responseTopScore > bestTopScore)
            ) {
              bestResponse = response;
            }
          }
          const availableCandidates = Number(bestResponse?.sampledCount || bestResponse?.count || 0);
          const enoughSamples = availableCandidates >= targetCandidateCount;
          const enoughAttempts = attempts >= (options.enrichProfile ? 7 : 10);
          const timedOut = Date.now() - startedAt > 60000;
          if (bestResponse && (enoughSamples || enoughAttempts || timedOut)) {
            const responseToSave = bestResponse;
            const posts = Array.isArray(responseToSave.posts) ? responseToSave.posts : [];
            const profile = {
              ...(responseToSave.profile || {}),
              username: responseToSave.profile?.username || responseToSave.profile?.handle || responseToSave.handle || ''
            };
            mergeProfileScanIntoAuth(profile)
              .then((nextAuth) => {
                if (nextAuth?.user?.username) {
                  return seedProfileFromXAuth(nextAuth, {
                    seedPersona: !options.updateProfileFromSamples && !options.skipAutoPersonaAnalysis
                  });
                }
                return null;
              })
              .then(() => saveScannedXPostsToVault(posts, {
                handle: responseToSave.handle || profile.username || profile.handle || '',
                sampledCount: responseToSave.sampledCount || responseToSave.count || posts.length,
                count: responseToSave.count || posts.length,
                source: 'profile_scan',
                status: posts.length > 0 ? 'page_scan' : 'profile_only',
                updatedBy: 'profile_scan',
                enrichProfile: Boolean(options.enrichProfile)
              }))
              .then((merged) => {
                const creatorSnapshot = options.openCreatorCenter
                  ? collectCreatorCenterSnapshotForProfileSync()
                  : Promise.resolve(null);
                const analysis = creatorSnapshot.then(() => {
                  if (options.updateProfileFromSamples) {
                    return updateProfileFromSamples({ softFail: true, skipBlock: true });
                  }
                  if (options.enrichProfile) return enrichProfileFromScannedData();
                  if (options.skipAutoPersonaAnalysis) return null;
                  return analyzeSeededProfileIfUseful();
                });
                return Promise.resolve(analysis).then(() => merged);
              })
              .then((merged) => {
                if (posts.length > 0) addLog('success', 'baseline_scan_saved', [responseToSave.count || posts.length]);
                const learned = Number(merged?.reviewedAdded || 0);
                if (learned > 0) addLog('success', 'x_scan_posts_learned', [learned]);
              })
              .catch((error) => {
                addLog('warn', 'baseline_scan_save_failed', [error.message || String(error)]);
                setXSyncStatus('unavailable', {
                  source: 'profile_scan',
                  error: error.message || String(error)
                });
              })
              .finally(() => {
                if (!options.openVisible) {
                  try { chrome.tabs.remove(tab.id); } catch (_) {}
                }
              });
            return;
          }
          if (hasPosts || hasProfile) {
            scrollTabForBaselineScan(tab.id).then(() => setTimeout(tryRead, 1800));
            return;
          }
          if (timedOut) {
            setXSyncStatus('unavailable', {
              source: 'profile_scan',
              error: 'profile scan timed out'
            });
            try { chrome.tabs.remove(tab.id); } catch (_) {}
            return;
          }
          scrollTabForBaselineScan(tab.id).then(() => setTimeout(tryRead, 1800));
        });
      };
      setTimeout(tryRead, 3500);
    });
  });
}

function buildXAccountBio(user = {}) {
  const lines = [];
  const handle = user.username ? `@${user.username}` : '';
  const displayName = user.name || '';
  const identity = [displayName, handle].filter(Boolean).join(' ');
  if (identity) lines.push(identity);
  if (user.description) lines.push(user.description);
  const metrics = user.public_metrics || {};
  const followerCount = Number(metrics.followers_count) || 0;
  const followingCount = Number(metrics.following_count) || 0;
  const tweetCount = Number(metrics.tweet_count) || 0;
  const metricParts = [];
  if (followerCount) metricParts.push(`${followerCount} followers`);
  if (followingCount) metricParts.push(`${followingCount} following`);
  if (tweetCount) metricParts.push(`${tweetCount} posts`);
  if (metricParts.length) lines.push(metricParts.join(', '));
  return lines.join('\n').trim();
}

function buildInitialPersonaFromXUser(user = {}, currentPersona = {}, lang = 'en', options = {}, accountLanguage = '') {
  return buildInitialAutoPersona(user, currentPersona, lang, options, globalThis.navigator?.language || '', accountLanguage);
}

function isWeakAutoPersona(persona = {}) {
  const characteristics = String(persona.characteristics || '').trim();
  const goals = String(persona.goals || '').trim();
  if (!characteristics && !goals) return true;
  const combined = `${characteristics}\n${goals}`;
  if (combined.length < 220) return true;
  const lineCount = combined.split('\n').filter(line => line.trim()).length;
  return lineCount < 5;
}

async function seedProfileFromXAuth(auth = {}, options = {}) {
  const user = auth.user || {};
  if (!user.id) return;
  const existing = await getStorage(['accountBio', 'aiPersona', 'engineLanguage', 'accountLanguage']);
  const lang = existing.engineLanguage || 'auto';
  const accountBio = String(existing.accountBio || '').trim();
  const updates = {};
  if (!accountBio) {
    const nextBio = buildXAccountBio(user);
    if (nextBio) updates.accountBio = nextBio;
  }
  const aiPersona = existing.aiPersona || {};
  if (options.seedPersona !== false && isWeakAutoPersona(aiPersona)) {
    updates.aiPersona = buildInitialPersonaFromXUser(user, aiPersona, lang, { replaceExisting: true }, existing.accountLanguage || '');
  }
  if (Object.keys(updates).length > 0) {
    await setStorage(updates);
    addLog('success', 'x_profile_seeded', [user.username || '']);
  }
}

async function syncAutoPersonaLanguage(engineLanguage = 'auto') {
  const existing = await getStorage(['aiPersona', 'xAuth', 'accountLanguage']);
  const { persona, changed } = localizeAutoPersona(
    existing.aiPersona || {},
    existing.xAuth?.user || {},
    engineLanguage,
    globalThis.navigator?.language || '',
    existing.accountLanguage || ''
  );
  if (!changed) return;
  await setStorage({ aiPersona: persona });
  addLog('info', 'persona_language_synced');
}

async function analyzeSeededProfileIfUseful() {
  const { accountBio, aiPersona, isAnalyzingPersona } = await getStorage(['accountBio', 'aiPersona', 'isAnalyzingPersona']);
  if (!accountBio || isAnalyzingPersona || !isWeakAutoPersona(aiPersona || {})) return;
  analyzeAccountPersona(accountBio);
}

async function enrichProfileFromScannedData() {
  const { accountBio, xAuth } = await getStorage(['accountBio', 'xAuth']);
  const auth = normalizeXAuth(xAuth || {});
  const bio = String(accountBio || '').trim() || buildXAccountBio(auth.user || {});
  analyzeAccountPersona(bio);
}

async function updateProfileFromSamples(options = {}) {
  const { styleTrainingData, accountBio, xAuth } = await getStorage(['styleTrainingData', 'accountBio', 'xAuth']);
  const samples = getStyleSamples(styleTrainingData, 12);
  if (samples.length < 3) {
    const error = `需要至少 3 条优质推文样本，当前 ${samples.length} 条`;
    if (options.softFail) {
      addLog('warn', 'profile_sample_analysis_skipped', [error]);
      return { success: false, error, sampleCount: samples.length };
    }
    throw new Error(error);
  }
  if (!options.skipBlock) {
    await setStorage({ profileAutoAnalyzeBlockedUntil: 0 });
  }
  const auth = normalizeXAuth(xAuth || {});
  const bio = String(accountBio || '').trim() || buildXAccountBio(auth.user || {});
  if (!bio) {
    const error = '请先同步 X 基础资料或填写账号定位';
    if (options.softFail) {
      addLog('warn', 'profile_sample_analysis_skipped', [error]);
      return { success: false, error, sampleCount: samples.length };
    }
    throw new Error(error);
  }
  addLog('info', 'profile_sample_analysis_started', [samples.length]);
  analyzeAccountPersona(bio);
  return { success: true, started: true, sampleCount: samples.length };
}

function runInitialBaselineScan(options = {}) {
  const force = Boolean(options.force);
  chrome.storage.local.get(['accountPerformanceBaseline', 'lastBaselineScanAttemptAt', 'xAuth'], (res) => {
    if (!force && !res.xAuth?.accessToken) return;
    if (!force && res.accountPerformanceBaseline?.sampleCount >= 5) return;
    const now = Date.now();
    if (!force && Number(res.lastBaselineScanAttemptAt) && now - Number(res.lastBaselineScanAttemptAt) < 6 * 60 * 60 * 1000) return;
    chrome.storage.local.set({ lastBaselineScanAttemptAt: now });
    addLog('info', 'baseline_scan_started');
    runPageBaselineScan(options);
  });
}

async function openTabAndReadPerformance(item) {
  const targetUrls = await getReviewTargetUrls(item);
  return new Promise((resolve) => {
    markAutomationSystemNavigation();
    chrome.tabs.create({ url: targetUrls[0] || 'https://x.com/home', active: false }, (tab) => {
      if (!tab?.id) {
        resolve({ success: false, error: 'tab not created' });
        return;
      }
      let targetIndex = 0;
      let targetStartedAt = Date.now();
      let lastResponse = null;
      const triedUrls = new Set([targetUrls[0] || 'https://x.com/home']);
      const closeAndResolve = (response) => {
        try { chrome.tabs.remove(tab.id); } catch (_) {}
        resolve(response || lastResponse || { success: false, error: 'post article not found' });
      };
      const moveToNextTarget = (preferredUrl = '') => {
        let nextUrl = preferredUrl && !triedUrls.has(preferredUrl) ? preferredUrl : '';
        while (!nextUrl && targetIndex + 1 < targetUrls.length) {
          targetIndex += 1;
          if (!triedUrls.has(targetUrls[targetIndex])) nextUrl = targetUrls[targetIndex];
        }
        if (!nextUrl) {
          closeAndResolve(lastResponse);
          return;
        }
        triedUrls.add(nextUrl);
        targetStartedAt = Date.now();
        markAutomationSystemNavigation();
        chrome.tabs.update(tab.id, { url: nextUrl }, () => {
          if (chrome.runtime.lastError) {
            closeAndResolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          setTimeout(tryRead, 3500);
        });
      };
      const tryRead = () => {
        requestPerformanceSnapshotWithInjection(tab.id, item).then((response) => {
          lastResponse = response || lastResponse;
          if (response?.success) {
            closeAndResolve(response);
            return;
          }
          if (response?.error === 'views not visible yet' && response.postUrl) {
            moveToNextTarget(response.postUrl);
            return;
          }
          if (response?.error === 'post article not found' && Date.now() - targetStartedAt > 12000) {
            moveToNextTarget();
            return;
          }
          if (Date.now() - targetStartedAt > 18000) {
            moveToNextTarget();
            return;
          }
          setTimeout(tryRead, 1500);
        });
      };
      setTimeout(tryRead, 3500);
    });
  });
}

function markAutoReviewAttempt(vault, itemId, patch = {}) {
  const index = vault.findIndex(item => item?.id === itemId);
  if (index < 0) return vault;
  const current = vault[index];
  const attempts = Number(current.autoReviewAttempts) || 0;
  const schedule = Array.isArray(current.autoReviewSchedule) ? current.autoReviewSchedule : [];
  const nextAutoReviewAt = getNextAutoReviewAtAfterFailure(schedule, { attempts: attempts + 1 });
  vault[index] = normalizePostRecord({
    ...current,
    ...patch,
    autoReviewAttempts: attempts + 1,
    lastAutoReviewAt: Date.now(),
    nextAutoReviewAt,
    autoReviewEnabled: Boolean(nextAutoReviewAt),
    lastAutoReviewErrorAt: Date.now()
  });
  return vault;
}

function applyAutoReviewResult(item, response, vault, aiMemory) {
  const metrics = response?.metrics || {};
  const discoveredPost = normalizePostRecord({
    ...item,
    postUrl: response?.postUrl || item.postUrl || '',
    statusId: response?.statusId || item.statusId || '',
    author: response?.author ? `@${String(response.author).replace(/^@/, '')}` : item.author,
    text: response?.text || item.text
  });
  const review = applyPerformanceReview(discoveredPost, {
    ...metrics,
    autoReviewedAt: Date.now()
  }, vault);
  if (!review?.post) return null;
  return {
	    post: normalizePostRecord({
	      ...review.post,
	      autoReviewEnabled: false,
	      nextAutoReviewAt: 0,
	      lastAutoReviewAt: Date.now(),
	      lastAutoReviewError: ''
	    }),
    aiMemory: updateAiMemoryWithReviewedPost(aiMemory, review.post)
  };
}

async function reviewNextPendingPost(options = {}) {
  const items = await getStorage(['draftVault', 'aiMemory', 'accountPerformanceBaseline']);
  const vault = Array.isArray(items.draftVault) ? items.draftVault.slice(0, 100).map(normalizePostRecord) : [];
  const now = Date.now();
  const targetId = String(options.postId || '').trim();
  const index = targetId
    ? vault.findIndex(item => String(item.id || '') === targetId && item.status !== POST_STATUS.REVIEWED)
    : vault.findIndex(item =>
      item.autoReviewEnabled
      && !item.learningDisabled
      && item.status !== POST_STATUS.REVIEWED
      && Number(item.nextAutoReviewAt || 0) <= now
    );
  if (index < 0) {
    schedulePerformanceReviewAlarm();
    return { success: false, error: targetId ? 'tracked post not found' : 'no pending performance review' };
  }

  const item = vault[index];
  const response = await openTabAndReadPerformance(item);
  if (!response?.success || !response.metrics?.views) {
    const nextVault = markAutoReviewAttempt(vault, item.id, {
      lastAutoReviewError: response?.error || 'visible metrics not ready'
    });
    await setStorage({ draftVault: nextVault });
    schedulePerformanceReviewAlarm();
    return { success: false, error: response?.error || 'visible metrics not ready' };
  }

  const applied = applyAutoReviewResult(item, response, vault, items.aiMemory || {});
  if (!applied) {
    schedulePerformanceReviewAlarm();
    return { success: false, error: 'performance review could not be applied' };
  }
  vault[index] = applied.post;
  const baseline = buildAccountPerformanceBaseline(vault);
  await setStorage({
    draftVault: vault.slice(0, 100),
    aiMemory: applied.aiMemory,
    accountPerformanceBaseline: {
      ...(items.accountPerformanceBaseline || {}),
      ...baseline,
      updatedBy: 'auto_review'
    }
  });
  addLog('success', 'auto_review_saved');
  schedulePerformanceReviewAlarm();
  return { success: true, metrics: response.metrics, postId: item.id };
}

function handlePostCompleted(source, meta = {}) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['postsToday', 'lastPostDate', 'sessionPostCount', 'pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingPostMetadata'], (result) => {
      const updates = {
        pendingPost: null,
        pendingPostId: null,
        pendingPostSource: null,
        pendingPostMetadata: null,
        pendingScheduledAt: null,
        isPosting: false,
        isPostingStartedAt: 0,
        isAutoPaused: false,
        pauseReason: ''
      };

      const finish = () => {
        checkAndSetupAlarm();
        chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
        resolve();
      };

      const finalize = (afterPersist) => {
        chrome.storage.local.set(updates, () => {
          const cleanup = () => {
            chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingPostMetadata', 'pendingScheduledAt'], finish);
          };
          if (afterPersist) {
            afterPersist().finally(cleanup);
            return;
          }
          cleanup();
        });
      };

      const persistAutoPost = () => upsertAutoPostToVault({
        id: result.pendingPostId,
        text: result.pendingPost,
        source: result.pendingPostSource || source,
        postUrl: meta.postUrl || '',
        statusId: meta.statusId || '',
        publishedAt: Date.now(),
        metadata: result.pendingPostMetadata || {}
      });
      const shouldPersistAutoPost = source === 'instant_gen' || result.pendingPostSource === 'instant_gen';

      if (source === 'queue' || source === 'instant_gen') {
        const now = new Date();
        const todayStr = now.toDateString();
        let postsToday = result.postsToday || 0;
        if (result.lastPostDate !== todayStr) postsToday = 0;
        updates.postsToday = postsToday + 1;
        updates.lastPostDate = todayStr;
        updates.sessionPostCount = (result.sessionPostCount || 0) + 1;
        addLog('success', 'post_published', [updates.postsToday]);
        finalize(shouldPersistAutoPost ? persistAutoPost : null);
        return;
      }

      addLog('success', 'test_post_success');
      finalize();
    });
  });
}

function buildReplyUniquenessConstraint(recentReplyTexts) {
  const list = Array.isArray(recentReplyTexts) ? recentReplyTexts : [];
  const recent = list.filter(Boolean).slice(0, 8);
  if (recent.length === 0) return '';
  const lines = recent.map((text) => `- ${String(text).split('\n').find(Boolean) || ''}`);
  return `最近已发送的回复（禁止使用相似的开头句式或判断，必须换一个新的具体切入点）：\n${lines.join('\n')}`;
}

function rememberSentReply(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  chrome.storage.local.get({ recentReplyTexts: [] }, (res) => {
    const list = Array.isArray(res.recentReplyTexts) ? res.recentReplyTexts : [];
    const next = [clean, ...list].slice(0, 8);
    chrome.storage.local.set({ recentReplyTexts: next });
  });
}

async function generateAIResponse(tweetContent, replyContext = {}) {
  try {
    const config = await getStorage([
      'apiKey', 'apiProvider', 'aiModel', 'promptTemplate', 'styleTrainingData',
      'engineLanguage', 'accountLanguage', 'feedbackLoopData', 'feedbackLikes', 'feedbackDislikes',
      'replyStrategy', 'customPromptGlobal', 'aiPersona', 'accountBio', 'leadTarget',
      'agentMemory', 'aiMemory', 'accountPerformanceBaseline', 'onboardingStrategy', 'competitorReport',
      'recentReplyTexts'
    ]);
    config.engineLanguage = normalizeEngineLanguage(
      (config.engineLanguage || 'auto') === 'auto' && config.accountLanguage ? config.accountLanguage : config.engineLanguage || 'auto',
      globalThis.navigator?.language || ''
    );
    const errors = getConfigErrors(config);
    if (errors.length > 0) {
      addLog('warn', 'config_incomplete_reply', [errors.join('、')]);
      throw new Error(errors.join('；'));
    }
    
    const generationContext = buildGenerationContext(config, { promptType: 'auto_reply' });
      
      const styleConstraint = generationContext.stylePrompt;
      const feedbackConstraint = generationContext.editFeedbackPrompt;
      const preferenceConstraint = generationContext.preferencePrompt;
      
      let langConstraint = '';
      const baseLangConstraint = () => getLanguageInstruction(config.engineLanguage, 'output', globalThis.navigator?.language || '');

      const origLang = replyContext.originalLanguage || '';
      const outputConstraint = baseLangConstraint();
      if (origLang) {
        langConstraint = `\n${getPromptText(config.engineLanguage, 'translatedContext', { origLang }, globalThis.navigator?.language || '')}\n${outputConstraint}`;
      } else {
        langConstraint = outputConstraint;
      }
      
      let currentReplyStrategy = config.replyStrategy || '极简流：精辟吐槽 / 玩梗';
      const strategyInstruction = buildReplyStrategyInstruction(currentReplyStrategy, config.customPromptGlobal);

      const personaContext = `
【账号生成上下文】
账号简介：
${generationContext.accountBio}

账号画像：
- 目标用户：${generationContext.persona?.targetUsers || '未填写'}
- 账号定位：${generationContext.persona?.characteristics || '未填写'}
- 发推策略：${generationContext.persona?.goals || '未填写'}

长期记忆：
${generationContext.agentMemoryPrompt}

关系互动记忆：
${generationContext.performanceMemoryPrompt}

${styleConstraint}
${feedbackConstraint}
${preferenceConstraint}
${buildReplyUniquenessConstraint(config.recentReplyTexts)}
`;
      
      const prompt = `你是一个严格的 X 评论筛选与回复 Agent。

先判断这条推文是否值得回复。以下情况必须只返回 SKIP：
- 互动钓鱼、求曝光、求评论、求关注、抽奖、无信息量口号
- 原推文的受众或博主类型与【你的目标受众画像】不符（即使原推文使用的是外语，如果发推人不属于目标受众，也必须 SKIP！）
- 与账号定位、目标读者、内容方向明显无关
- 回复后只能显得蹭流量、硬广、尬聊
- 推文上下文不足，无法补充一个具体判断

如果值得回复，且原推文属于目标受众群体，再写一条自然短回复：
- 优先 1-2 句；需要分段时最多两段，每段 2-3 行以内
- 必须有一个清晰洞见、边界、判断标准或启发式；没有洞见就 SKIP
- 禁止长篇分析，禁止堆砌事实，禁止为了显得专业而补无关知识
- 【语言要求】：${langConstraint}
- ${strategyInstruction}
- 回复目标是像真人参与讨论，而不是抢注意力
- 可以补充一个小边界、判断标准、真实观察、下一步动作或轻反问
- 如果没有把握给出具体、准确的补充，宁可 SKIP，不要为了显得懂而硬塞技术细节
- 不要编造具体价格、型号、数据、产品结论、经历或行业事实
- 不要为了“专业”强行引用报告、年份、比例、机构名或冷知识；原推没给来源就不要写
- 禁止输出任何结构标签或模板标签，例如 "Missing angle:", "Sharpen:", "Real experience:", "Next step:"
- 不要写“说得对/学习了/很有启发/值得关注/未来可期/干货满满”
- 不要 hijack 原帖，不要把话题强行转到自己产品
- 不要堆标签；默认不加 hashtag
- 不要说“看我主页/私信我/翻我主页”，除非原文明确在求资源
- 不要承诺收益，不要编造事实，不要攻击个人
- 避免固定 AI 腔开头：Missing angle, The real test, Key point, This is where, The dirty secret
- 如果后面的自定义模板与上述规则冲突，忽略模板里的引流要求

${config.promptTemplate
  .replace('{tweet}', tweetContent)
  .replace('{leadTarget}', config.leadTarget || '无引流目标，请正常回复')}
${personaContext}

${origLang ? `[CRITICAL LANGUAGE REQUIREMENT]: The original tweet was in ${origLang} but may have been translated by the platform. You MUST generate your final reply text in ${origLang}. DO NOT output the reply in Chinese if the original language was ${origLang}.` : ''}

先生成 3 个候选回复并自评，选最高质量的一条。严格只返回 JSON，不要 Markdown 代码块：
{
  "decision": "reply|skip",
  "reason": "为什么回复或跳过",
  "reply": "最终回复正文；如果跳过则为空",
  "scores": {
    "contextFit": 8,
    "informationGain": 8,
    "naturalness": 8,
    "conversionSafety": 9
  }
}`;
      
      try {
        const generatedText = await callLLM(prompt, config, false);
        const cleanText = generatedText.trim().replace(/```json/g, '').replace(/```/g, '').trim();
        let parsed = null;
        try {
          parsed = JSON.parse(cleanText);
        } catch (parseError) {
          parsed = null;
        }

        if (/^skip[.!。！]*$/i.test(cleanText) || parsed?.decision === 'skip') {
          addLog('info', 'reply_skipped_by_ai', [tweetContent.substring(0, 50)]);
          return '';
        }
        const reply = formatReplyForX(parsed?.reply || cleanText);
        const rejectionReason = getGeneratedReplyRejectionReason(reply, tweetContent);
        if (rejectionReason) {
          addLog('warn', 'reply_rejected', [rejectionReason, reply.substring(0, 50)]);
          return '';
        }
        // The model self-scores each candidate; previously this was requested
        // in the prompt but never actually checked. Give it real teeth: a
        // low self-reported score is a signal the model itself is unsure,
        // so treat it as a rejection instead of silently ignoring it.
        const scores = parsed?.scores || {};
        const scoreValues = ['contextFit', 'informationGain', 'naturalness', 'conversionSafety']
          .map((key) => Number(scores[key]))
          .filter((value) => Number.isFinite(value));
        if (scoreValues.length > 0) {
          const minScore = Math.min(...scoreValues);
          const avgScore = scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length;
          if (minScore < 4 || avgScore < 6) {
            addLog('warn', 'reply_rejected_low_confidence', [avgScore.toFixed(1), reply.substring(0, 50)]);
            return '';
          }
        }
        rememberSentReply(reply);
        return reply;
      } catch (e) {
        console.warn("VibeX: API rate limit or fetch error", e);
        throw e;
      }
  } catch (outerError) {
    addLog('error', 'reply_generation_failed', [outerError.message]);
    throw outerError;
  }
}

function appendMemoryNote(memory = {}, key, note, maxLength = 2400) {
  const normalized = normalizeAgentMemory(memory);
  const cleanNote = memoryValueToText(note).trim();
  if (!cleanNote) return normalized;
  const current = memoryValueToText(normalized[key]).trim();
  if (current.includes(cleanNote)) return normalized;
  const next = current ? `${current}\n${cleanNote}` : cleanNote;
  normalized[key] = next.length > maxLength ? next.slice(next.length - maxLength) : next;
  return normalized;
}

function buildLocalChatMemoryPatch(message) {
  return {
    sourceInputs: `用户投喂的新素材/想法：${message}`,
    weeklyReviewSignals: `待复盘信号：用户在 Agent 对话中新增了一个偏好或素材，需要判断是否进入选题池。`
  };
}

function extractXHandlesFromText(text = '') {
  const handles = [];
  const source = memoryValueToText(text);
  const patterns = [
    /(?:^|[\s（(])@([A-Za-z0-9_]{1,15})\b/g,
    /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|\b)/gi
  ];
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const handle = match[1];
      if (handle && !['home', 'search', 'explore', 'i', 'settings'].includes(handle.toLowerCase())) {
        handles.push(handle);
      }
    }
  });
  return [...new Set(handles.map(handle => handle.replace(/^@/, '')))];
}

function buildChatEntryAnalysis({ message = '', handles = [], parsed = {}, localOnly = false } = {}) {
  const cleanMessage = memoryValueToText(message).trim();
  const summary = memoryValueToText(parsed.inputSummary || parsed.summary).trim();
  const insights = Array.isArray(parsed.insights) ? parsed.insights.filter(Boolean).slice(0, 6) : [];
  const actions = Array.isArray(parsed.actions) ? parsed.actions.filter(Boolean).slice(0, 6) : [];
  const memoryWrites = Object.entries(parsed.memoryPatch || {})
    .filter(([, value]) => memoryValueToText(value).trim())
    .map(([key, value]) => `${AGENT_MEMORY_LABELS[key] || key}: ${memoryValueToText(value).trim()}`)
    .slice(0, 8);
  const accountLines = handles.map(handle => `@${handle}`);

  return {
    title: handles.length > 0 ? 'KOL/账号解析' : '输入解析',
    summary: summary || (handles.length > 0
      ? `识别到 ${accountLines.join('、')}，已作为可观察/互动的 KOL 线索。`
      : `这条输入已进入素材池：${cleanMessage.slice(0, 80)}`),
    accounts: accountLines,
    insights: insights.length > 0 ? insights : (handles.length > 0
      ? ['后续应观察该账号的高互动内容结构、开头钩子、评论区互动方式和可复用选题。']
      : ['后续可判断它适合沉淀为选题、表达规则、评论策略或复盘信号。']),
    actions: actions.length > 0 ? actions : (handles.length > 0
      ? ['写入长期互动对象', '加入素材来源', '后续回复/搜索优先参考同类 KOL']
      : ['写入素材来源', '等待后续复盘时提炼为内容策略']),
    memoryWrites,
    localOnly
  };
}

function buildKolMemoryPatch(handles = []) {
  if (!handles.length) return {};
  const handleLines = handles.map(handle => handle.replace(/^@/, '')).join('\n');
  const display = handles.map(handle => `@${handle.replace(/^@/, '')}`).join('、');
  return {
    interactionTargets: handleLines,
    sourceInputs: `用户新增 KOL/对标账号：${display}`,
    weeklyReviewSignals: `观察 ${display} 的高互动帖：Hook、正文结构、评论区回复方式、可复用观点和受众重叠度。`
  };
}

function mergeChatMemory(baseMemory = {}, patch = {}) {
  let memory = normalizeAgentMemory(baseMemory);
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (DEFAULT_AGENT_MEMORY[key] === undefined) return;
    memory = appendMemoryNote(memory, key, value);
  });
  return memory;
}

async function handleAgentChat(message) {
  const userMessage = memoryValueToText(message).trim();
  if (!userMessage) throw new Error('消息为空');

  return new Promise((resolve, reject) => {
    chrome.storage.local.get([
      'apiKey',
      'apiProvider',
      'aiModel',
      'agentChatMessages'
    ], async (config) => {
      const messages = Array.isArray(config.agentChatMessages) ? config.agentChatMessages.slice(-60) : [];
      const detectedHandles = extractXHandlesFromText(userMessage);
      const baseHandlePatch = buildKolMemoryPatch(detectedHandles);
      const userEntry = {
        role: 'user',
        content: userMessage,
        time: Date.now(),
        analysis: buildChatEntryAnalysis({ message: userMessage, handles: detectedHandles })
      };
      const errors = getAIConnectionErrors(config);

      if (errors.length > 0) {
        const localPatch = buildLocalChatMemoryPatch(userMessage);
        const memoryPatch = {
          ...localPatch,
          ...baseHandlePatch,
          sourceInputs: [
            memoryValueToText(localPatch.sourceInputs).trim(),
            memoryValueToText(baseHandlePatch.sourceInputs).trim()
          ].filter(Boolean).join('\n'),
          weeklyReviewSignals: [
            memoryValueToText(localPatch.weeklyReviewSignals).trim(),
            memoryValueToText(baseHandlePatch.weeklyReviewSignals).trim()
          ].filter(Boolean).join('\n')
        };
        const agentMemory = mergeChatMemory(config.agentMemory, memoryPatch);
        const localAnalysis = buildChatEntryAnalysis({
          message: userMessage,
          handles: detectedHandles,
          parsed: { memoryPatch },
          localOnly: true
        });
        const assistantEntry = {
          role: 'assistant',
          content: detectedHandles.length > 0
            ? `我先把 ${detectedHandles.map(handle => `@${handle}`).join('、')} 记录为 KOL/对标账号。\n\n当前还缺少 API Key 或模型配置，所以暂时只能做基础归档。配置好模型后，我会继续拆解它的内容优势、表达风格、互动方式和可学习点。`
            : `我先把这条输入记录进素材池。\n\n当前还缺少 API Key 或模型配置，所以我不能做深度拆解。配置好模型后，我会把这类输入进一步转成：选题角度、表达规则、评论策略或可发布内容。`,
          analysis: localAnalysis,
          time: Date.now()
        };
        const nextMessages = [...messages, userEntry, assistantEntry].slice(-60);
        chrome.storage.local.set({ agentChatMessages: nextMessages, agentMemory }, () => {
          addLog('info', 'agent_memory_local_saved');
          resolve({ messages: nextMessages, agentMemory, memoryUpdated: true });
        });
        return;
      }

      const playbook = selectGrowthPlaybook({
        onboardingStrategy: config.onboardingStrategy,
        
        agentMemory: config.agentMemory,
        accountBio: config.accountBio,
        leadTarget: config.leadTarget
      });

      const recentContext = messages.slice(-12)
        .map(item => `${item.role === 'user' ? '用户' : 'Agent'}：${item.content}`)
        .join('\n');

      const prompt = `你是一个专用的 X 发声 Agent 策略编辑器，不是通用聊天机器人。
用户会把好帖子、想法、复盘、偏好、产品方向或评论引流资产发给你。

你的任务：
1. 判断这条输入应该沉淀为：选题角度、核心观点、语气规则、读者痛点、评论策略、风险边界、素材来源或复盘信号。
2. 如果输入里包含 X/KOL 账号，必须拆解这个账号可能值得学习的优势、表达风格、内容结构、评论互动方式，并把账号写入 interactionTargets 和 sourceInputs。
3. 用简短但有判断力的方式回复用户，告诉他这条输入可以如何用于 X 发声。
4. 必须提炼 memoryPatch，写入长期记忆。不要覆盖原记忆，只提供新增内容。
5. 如适合，给一个 X 原生表达样例，但不要承诺收益，不要编造事实，不要变成公众号腔。

账号画像：
- 目标用户：${config.aiPersona?.targetUsers || '未填写'}
- 账号定位：${config.aiPersona?.characteristics || '未填写'}
- 核心目标：${config.aiPersona?.goals || config.leadTarget || '未填写'}


当前长期记忆：


当前增长模板：


最近对话：
${recentContext || '暂无'}

识别到的 X/KOL 账号：
${detectedHandles.length > 0 ? detectedHandles.map(handle => `@${handle}`).join('\n') : '无'}

用户最新输入：
${userMessage}

只返回 JSON，不要 Markdown 代码块：
{
  "reply": "给用户看的回复，必须明确说明这不是泛聊，而是如何更新 X 发声策略",
  "inputSummary": "一句话总结这条输入的用途",
  "insights": ["优势/风格/结构/互动方式/可学习点，最多6条"],
  "actions": ["下一步如何用到账号运营，最多6条"],
  "memoryPatch": {
    "identity": "",
    "marketPosition": "",
    "audienceSegments": "",
    "audiencePains": "",
    "contentPillars": "",
    "contentAngles": "",
    "proofAssets": "",
    "personalStories": "",
    "coreOpinions": "",
    "boundaries": "",
    "voiceRules": "",
    "bannedClaims": "",
    "interactionTargets": "",
    "replyStrategy": "",
    "sourceInputs": "",
    "weeklyReviewSignals": ""
  },
  "suggestedTweet": "如果适合，给一条带换行的候选推文；不适合则为空"
}`;

      try {
        const generatedText = await callLLM(prompt, config, true);
        const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
        let parsed;
        try {
          parsed = JSON.parse(cleanJsonStr);
        } catch (parseError) {
          parsed = {
            reply: generatedText.trim(),
            memoryPatch: buildLocalChatMemoryPatch(userMessage),
            suggestedTweet: ''
          };
        }

        const memoryPatch = {
          ...(parsed.memoryPatch || {}),
          ...baseHandlePatch,
          interactionTargets: [
            memoryValueToText(parsed.memoryPatch?.interactionTargets).trim(),
            memoryValueToText(baseHandlePatch.interactionTargets).trim()
          ].filter(Boolean).join('\n'),
          sourceInputs: [
            memoryValueToText(parsed.memoryPatch?.sourceInputs).trim(),
            memoryValueToText(baseHandlePatch.sourceInputs).trim()
          ].filter(Boolean).join('\n'),
          weeklyReviewSignals: [
            memoryValueToText(parsed.memoryPatch?.weeklyReviewSignals).trim(),
            memoryValueToText(baseHandlePatch.weeklyReviewSignals).trim()
          ].filter(Boolean).join('\n')
        };
        const agentMemory = mergeChatMemory(config.agentMemory, memoryPatch);
        const suggestedTweet = formatTweetForX(parsed.suggestedTweet || '');
        const replyText = [
          memoryValueToText(parsed.reply).trim() || '我已把这条输入转成 X Agent 的记忆更新。',
          suggestedTweet ? `\n可测试推文：\n${suggestedTweet}` : ''
        ].filter(Boolean).join('\n');
        const assistantEntry = {
          role: 'assistant',
          content: replyText,
          analysis: buildChatEntryAnalysis({
            message: userMessage,
            handles: detectedHandles,
            parsed: { ...parsed, memoryPatch }
          }),
          time: Date.now()
        };
        const nextMessages = [...messages, userEntry, assistantEntry].slice(-60);

        chrome.storage.local.set({ agentChatMessages: nextMessages, agentMemory }, () => {
          addLog('success', 'agent_memory_updated');
          resolve({ messages: nextMessages, agentMemory, memoryUpdated: true });
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function formatPersonaEvidence(config = {}) {
  const evidence = [];
  const styleSamples = Array.isArray(config.styleTrainingData) ? config.styleTrainingData : [];
  const topPosts = Array.isArray(config.accountPerformanceBaseline?.topPosts) ? config.accountPerformanceBaseline.topPosts : [];
  const seen = new Set();
  const addLine = (prefix, text) => {
    const normalized = normalizeStyleSampleText(text);
    if (!normalized) return;
    const key = normalized.toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
    if (seen.has(key)) return;
    seen.add(key);
    evidence.push(`${prefix} ${normalized.slice(0, 500)}`);
  };
  const styleLearning = formatStyleSampleLearningForPrompt(styleSamples, {
    limit: 5,
    title: 'Manual high-quality tweet samples. Treat these as user-curated evidence. Use recurring topics, audience problems, and core theses as positioning signals; use hook/structure lessons as posting strategy signals. Never copy wording, tone, or personality.'
  });
  if (styleLearning) evidence.push(styleLearning.slice(0, 4500));
  topPosts.slice(0, 12).forEach((post, index) => {
    const metrics = post.performanceMetrics || {};
    const views = getPostMetricValue(post, 'views');
    const likes = Number(metrics.likes || 0) || 0;
    const signal = views || likes ? ` (${views || 0} views, ${likes} likes)` : '';
    addLine(`Performance context ${index + 1}${signal}:`, post.text);
  });
  const creatorText = String(config.creatorCenterSnapshot?.text || '').trim();
  const limitedEvidence = evidence.slice(0, 20);
  if (creatorText) {
    limitedEvidence.push(`Creator Center visible snapshot:\n${creatorText.slice(0, 2500)}`);
  }
  return limitedEvidence.join('\n');
}

async function analyzeAccountPersona(bio) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'engineLanguage', 'accountLanguage', 'styleTrainingData', 'accountPerformanceBaseline', 'creatorCenterSnapshot', 'agentMemory', 'aiPersona'], async (config) => {
    const engineLanguageSource = (config.engineLanguage || 'auto') === 'auto' && config.accountLanguage
      ? config.accountLanguage
      : config.engineLanguage || 'auto';
    const engineLanguage = normalizeEngineLanguage(engineLanguageSource, globalThis.navigator?.language || '');
    const outputLanguage = getLanguageName(engineLanguage, globalThis.navigator?.language || '');
    const errors = getAIConnectionErrors(config);
    if (errors.length > 0) {
      addLog('warn', 'config_incomplete_persona', [errors.join('、')]);
      chrome.storage.local.set({ isAnalyzingPersona: false });
      return;
    }
    addLog('info', 'persona_analysis_started');
    const evidenceContext = formatPersonaEvidence(config);
    const existingPersona = config.aiPersona || {};
    const hasExistingPersona = !isWeakAutoPersona(existingPersona);
    const continuityContext = hasExistingPersona
      ? `Current positioning already in use (do NOT discard this from scratch):
Target users: ${existingPersona.targetUsers || 'N/A'}
Account Positioning: ${existingPersona.characteristics || 'N/A'}
Posting Strategy: ${existingPersona.goals || 'N/A'}

Treat the above as the account's established identity. Recalibrate and sharpen it using the new evidence below, but preserve continuity of target audience, territory, and core thesis UNLESS the new evidence clearly shows the account's direction has fundamentally changed. Do not invent an unrelated niche or swap the account's identity on a whim.`
      : 'No usable existing positioning yet. You may establish the initial positioning freely from the evidence below.';

    const prompt = `You are an elite X/Twitter positioning strategist and ghostwriter for a founder-led account.
Your job is to turn a thin public profile into a dense, usable writing system for VibeX.

${continuityContext}

CRITICAL LANGUAGE REQUIREMENT:
- Output every user-facing field in ${outputLanguage}.
- Do not default to Chinese unless ${outputLanguage} is CHINESE (zh).
- JSON keys must stay in English. JSON values must be in ${outputLanguage}.

Think like an operator, not a resume writer:
- What would make this account worth following?
- What is the account's clear territory, audience, and repeatable point of view?
- Which content pillars grow followers, trust, comments, saves, and soft conversion?
- Which writing rules make posts screenshot-worthy instead of generic?
- What should the account refuse to say because it would sound fake, weak, or risky?

Public X profile / account source:
${bio || '暂无'}

Manual high-quality samples and X performance context:
${evidenceContext || 'No manual high-quality samples or X performance context yet.'}

VibeX product context:
The account is using VibeX, an AI copilot for X creators. The broad audience includes founders, indie builders, AI operators, creators, researchers, investors, and people who consume X but struggle to turn inputs into sharp opinions and consistent output.

You must infer positioning from the profile, but NEVER fabricate unverifiable credentials, revenue, customers, employers, titles, or personal history.
If the profile source is thin, build a strong but honest "starting hypothesis" and say it as operating guidance, not as fake biography.

Quality bar:
- The "characteristics" field is the Account Positioning textarea. Infer it from BOTH the public bio/profile and the user's high-quality tweet samples.
- Account Positioning must answer: this account is for whom, about what territory, with what repeated thesis, and under what proof/source boundaries.
- Manual high-quality samples CAN inform positioning through repeated topics, audience pain, category, and worldview. They must NOT inject tone, catchphrases, self-description, or copied sentences into positioning.
- Do NOT put personality slogans, witty self-description, "blunt/fearless/sharp" language, vibe labels, or invented biography into "characteristics".
- The "goals" field is the Posting Strategy textarea. It must be derived primarily from the conclusions of high-quality tweet samples and performance context: which hooks worked, which structures worked, what content pillars appeared, what endings created replies/saves.
- Posting Strategy must be operational, not motivational. Avoid generic cadence rules unless supported by samples or performance evidence.
- Use X performance context only for empirical topics/audience/format signals. Do not imitate it as writing style unless it also appears in manual high-quality samples.
- Also produce memory fields that reflect the scanned evidence, not just the profile bio.
- Make it as specific and vivid as the source allows.
- Avoid safe corporate phrases such as "professional", "insightful", "share valuable content", "establish authority" unless made concrete.
- Do not write a bland marketing persona.
- Never paste raw sample lines into either textarea. Convert evidence into concise conclusions.
- Use line breaks inside strings with \\n. No Markdown headings outside the JSON.

Reference density and shape:
Account Positioning should feel like:
"For indie builders and AI creators trying to turn scattered inputs into consistent X output.
Territory: AI workflows, creator systems, build-in-public, and lightweight automation.
Repeated thesis from bio + samples: distribution improves when capture, thinking, writing, and review become one loop.
Boundaries: no unverifiable revenue claims, no fake customer stories, no generic AI hype."

Posting Strategy should feel like:
"Strategy derived from high-quality samples:
- Hooks: lead with a concrete tension, failed assumption, or sharp contrast.
- Structures: use object comparison, variable reversal, or short observation -> implication -> punchline.
- Pillars: AI workflow teardown, creator distribution systems, build-in-public lessons.
- Endings: close with a reusable judgment standard; avoid generic 'what do you think' questions."

Return STRICT JSON only:
{
  "targetUsers": "...",
  "characteristics": "Account Positioning text only. 3-5 concrete lines inferred from bio + high-quality samples. No tone/personality/raw sample lines.",
  "goals": "Posting Strategy text derived from high-quality sample conclusions and performance context. Include hooks, structures, pillars, endings, and operational rules with \\n line breaks.",
  "memory": {
    "identity": "...",
    "marketPosition": "...",
    "audienceSegments": "...",
    "audiencePains": "...",
    "contentPillars": "...",
    "contentAngles": "...",
    "proofAssets": "...",
    "personalStories": "...",
    "coreOpinions": "...",
    "boundaries": "...",
    "voiceRules": "...",
    "bannedClaims": "...",
    "interactionTargets": "...",
    "discoveryKeywords": "用于 X 高级搜索的关键词，每行一个，必须匹配目标读者和内容方向",
    "replyStrategy": "...",
    "sourceInputs": "...",
    "weeklyReviewSignals": "..."
  }
}`;
    
    chrome.storage.local.set({ isAnalyzingPersona: true });
    try {
      const generatedText = await callLLM(prompt, config, true);
      // Clean up markdown code blocks if the model wrapped it
      const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJsonStr);
      const personaLanguage = resolveAutoPersonaLanguage(config.engineLanguage || 'auto', globalThis.navigator?.language || '', config.accountLanguage || '');
      const fallbackPersona = buildInitialPersonaFromXUser({}, {}, config.engineLanguage || 'auto', {}, config.accountLanguage || '');
      const persona = {
        targetUsers: parsed.targetUsers || (personaLanguage === 'zh' ? '科技、互联网与 AI 领域的活跃用户' : 'Active builders, creators, and operators in AI, tech, and internet culture'),
        characteristics: parsed.characteristics || fallbackPersona.characteristics,
        goals: parsed.goals || fallbackPersona.goals
      };
      const agentMemory = mergeAgentMemory(config.agentMemory, parsed.memory || parsed.agentMemory || {});
      
      chrome.storage.local.set({ aiPersona: persona, agentMemory, isAnalyzingPersona: false }, () => {
         addLog('success', 'persona_analysis_completed');
         analyzeCompetitors(persona, agentMemory);
      });
    } catch (e) {
      addLog('error', 'persona_analysis_failed', [e.message]);
      chrome.storage.local.set({ isAnalyzingPersona: false });
    }
  });
}

async function analyzeOnboardingSource(sourceInput) {
  const source = (sourceInput || '').trim();
  if (!source) throw new Error('缺少产品网站或 X 账号');

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel'], async (config) => {
      const errors = getAIConnectionErrors(config);
      if (errors.length > 0) {
        reject(new Error(errors.join('；')));
        return;
      }

      const playbookCatalog = "";
      const prompt = `你是一个真正懂 X/Twitter 推荐机制和中文/英文科技圈传播的账号增长操盘手，不是普通市场顾问。
你的工作方式：
- 先判断账号能靠什么被转发、被评论、被收藏、被关注。
- 所有建议都要服务于 X 上的流量结构：Hook 强度、身份标签、争议/反常识、收藏价值、评论诱因、转化路径。
- 输出必须像给一个创始人或 KOL 的实战作战台，而不是咨询报告。

请根据用户输入的产品网站、X 主页、竞品网站或希望模仿的账号，设计一套“X 发声 Agent 启动向导”的初始策略。

用户输入：
${source}

目标用户是：想在 X 上建立影响力的创始人、独立开发者、出海从业者、AI 工具人、投资/研究人员；以及有想法但输出不稳定、会刷 X 但不会把输入转化为观点和内容、强烈想做 KOL 的人。

可选策略模板如下。你必须根据输入选择最匹配的 strategyArchetype，并把对应方法论写进后续策略，不要所有账号都用同一个口吻：
${playbookCatalog}

请遵守：
- 如果无法真实访问链接，不要编造具体数据、融资、客户、收益、产品功能。
- 可以基于 URL、handle、行业关键词进行保守推断。
- 输出要用于前端多选卡片确认，同时必须体现“流量操盘手”的判断。
- 不做收益承诺，不建议擦边、政治动员或刷屏。
- 不要写公众号腔、品牌公关腔、咨询报告腔。要像 X 原生表达：短、具体、有判断、有传播点。
- 生成推文时必须考虑移动端阅读：Hook 单独一行，长句每 28-36 个中文字符主动换行，逻辑块之间可以留空行。

你必须内部完成以下判断：
1. 这个账号最可能的增长飞轮是什么：观点传播、实操收藏、故事共鸣、评论截流、产品转化中的哪几个。
2. 目标用户为什么会关注：情绪价值、工具价值、行业内幕、身份认同、可复制方法中的哪几个。
3. 第一周内容矩阵：涨粉内容、建信任内容、转化内容、互动钩子内容、人设加深内容。
4. 评论引流资产：判断用户是否更适合导向产品/工具、高质量帖子/资料，还是暂不设置引流资产。
5. 自动生成 5-10 个优先互动账号：优先 KOL、创作者、创始人、研究者等个人账号；不要把项目方、品牌官方号、公司号作为主要评论对象。如果不确定，用模板给出的默认个人账号池，不要把选择责任交给用户。
6. 自动生成 X 高级搜索关键词：用于找到中文/目标语言高互动热帖，避免只依赖推荐页；关键词必须能匹配目标读者、内容方向和评论截流场景。
7. 爆款热帖风格：必须生成 3 个候选首帖，并按 6 项 1-10 分打分。

评分维度：
- hook: 开头是否能让人停住
- shareability: 是否有转发理由
- replyTrigger: 是否能引发评论
- identity: 是否强化账号身份标签
- audienceFit: 是否精准击中目标用户
- nativeX: 是否像 X 原生表达

只能返回 JSON 对象，格式如下：
{
  "sourceInput": "${source.replace(/"/g, '\\"')}",
  "strategyArchetype": "ai_product_kol|monetization_global|indie_builder|research_growth|brand_official",
  "accountUse": "brand|evangelist|curator|kol",
  "audience": ["founders", "indie"],
  "audienceCustom": "",
  "content": ["insights", "playbooks"],
  "contentCustom": "",
  "contentMode": "balanced|growth|trust",
  "leadAssetType": "product|post|none",
  "leadAssetValue": "产品/工具链接、置顶帖/资料链接或空字符串",
  "postStyle": "concise|story|contrarian",
  "preferredLanguage": "en|ja|ko|zh-CN|zh-TW",
  "targetTimezone": "Asia/Shanghai|America/Los_Angeles|America/New_York|Europe/London|Asia/Tokyo|Asia/Seoul",
  "growthGoal": "首月新增 1000 粉丝",
  "automationMode": "autoReply",
  "recommendedInteractionTargets": ["handle1", "handle2"],
  "firstTweetText": "从 firstTweetCandidates 中选择总分最高的一条",
  "firstTweetCandidates": [
    {
      "text": "候选首帖 1，必须包含移动端友好的手动换行",
      "style": "concise|story|contrarian",
      "scores": {
        "hook": 8,
        "shareability": 8,
        "replyTrigger": 7,
        "identity": 8,
        "audienceFit": 9,
        "nativeX": 9
      },
      "rationale": "为什么这条更可能在 X 上被关注"
    }
  ],
  "leadTarget": "低压、可信、不硬广的行动入口；如果 leadAssetType 是 none，就强调关注沉淀，不强行引流。",
  "persona": {
    "targetUsers": "...",
    "characteristics": "...",
    "goals": "..."
  },
  "memory": {
    "identity": "...",
    "marketPosition": "...",
    "audienceSegments": "...",
    "audiencePains": "...",
    "contentPillars": "...",
    "contentAngles": "...",
    "proofAssets": "...",
    "personalStories": "...",
    "coreOpinions": "...",
    "boundaries": "...",
    "voiceRules": "...",
    "bannedClaims": "...",
    "interactionTargets": "...",
    "discoveryKeywords": "用于 X 高级搜索的关键词，每行一个，必须匹配目标读者和内容方向",
    "replyStrategy": "...",
    "sourceInputs": "...",
    "weeklyReviewSignals": "..."
  },
  "competitorReport": "Markdown，必须包含：流量假设、第一周内容矩阵、低粉爆款钩子、互动截流策略、风险边界。"
}`;

      try {
        addLog('info', 'onboarding_analysis_started');
        const generatedText = await callLLM(prompt, config, true);
        const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJsonStr);
        const analysis = normalizeOnboardingAnalysis(parsed, source);
        chrome.storage.local.set({ onboardingSourceAnalysis: analysis }, () => {
          addLog('success', 'onboarding_analysis_completed');
          resolve(analysis);
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeOnboardingAnalysis(parsed = {}, sourceInput = '') {
  const pick = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  const pickList = (values, allowed, fallback) => {
    const list = Array.isArray(values) ? values.filter(value => allowed.includes(value)) : [];
    return list.length > 0 ? list : fallback;
  };
  const fallbackPlaybook = selectGrowthPlaybook({
    onboardingStrategy: parsed,
    persona: parsed.persona,
    agentMemory: parsed.memory || parsed.agentMemory,
    sourceInput
  });
  const recommendedInteractionTargets = formatPersonalHandleList([
    parsed.recommendedInteractionTargets,
    parsed.interactionTargets,
    getDefaultInteractionTargets(fallbackPlaybook)
  ]);
  const memory = mergeAgentMemory(DEFAULT_AGENT_MEMORY, parsed.memory || parsed.agentMemory || {});
  memory.interactionTargets = recommendedInteractionTargets;
  if (!memoryValueToText(memory.discoveryKeywords).trim()) {
    memory.discoveryKeywords = getDefaultDiscoveryKeywords(fallbackPlaybook).join('\n');
  }

  return {
    sourceInput: parsed.sourceInput || sourceInput,
    strategyArchetype: pick(parsed.strategyArchetype, Object.keys(GROWTH_PLAYBOOKS), fallbackPlaybook.id),
    accountUse: pick(parsed.accountUse, ['brand', 'evangelist', 'curator', 'kol'], 'evangelist'),
    audience: pickList(parsed.audience, ['founders', 'indie', 'global', 'aiBuilders', 'researchers'], ['founders', 'indie']),
    audienceCustom: memoryValueToText(parsed.audienceCustom),
    content: pickList(parsed.content, ['insights', 'playbooks', 'stories', 'curation', 'softPromo'], ['insights', 'playbooks']),
    contentCustom: memoryValueToText(parsed.contentCustom),
    contentMode: pick(parsed.contentMode, ['balanced', 'growth', 'trust'], 'balanced'),
    leadAssetType: pick(parsed.leadAssetType, ['product', 'post', 'none'], 'none'),
    leadAssetValue: memoryValueToText(parsed.leadAssetValue),
    postStyle: pick(parsed.postStyle, ['concise', 'story', 'contrarian'], 'concise'),
    preferredLanguage: pick(parsed.preferredLanguage, ['en', 'ja', 'ko', 'zh-CN', 'zh-TW'], 'zh-CN'),
    targetTimezone: pick(parsed.targetTimezone, ['Asia/Shanghai', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Seoul'], 'Asia/Shanghai'),
    growthGoal: memoryValueToText(parsed.growthGoal) || '首月新增 1000 粉丝',
    automationMode: pick(parsed.automationMode, ['autoPost', 'autoReply', 'autoEngage'], 'autoEngage'),
    recommendedInteractionTargets: recommendedInteractionTargets.split('\n').filter(Boolean),
    firstTweetText: bestViralCandidate(parsed.firstTweetCandidates, memoryValueToText(parsed.firstTweetText)),
    firstTweetCandidates: Array.isArray(parsed.firstTweetCandidates) ? parsed.firstTweetCandidates : [],
    leadTarget: memoryValueToText(parsed.leadTarget),
    persona: {
      targetUsers: memoryValueToText(parsed.persona?.targetUsers),
      characteristics: memoryValueToText(parsed.persona?.characteristics),
      goals: memoryValueToText(parsed.persona?.goals)
    },
    memory,
    competitorReport: memoryValueToText(parsed.competitorReport)
  };
}

async function analyzeCompetitors(persona, agentMemoryOverride) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', ], async (config) => {
    const errors = getAIConnectionErrors(config);
    if (errors.length > 0) {
      addLog('warn', 'config_incomplete_competitor', [errors.join('、')]);
      chrome.storage.local.set({ isAnalyzingCompetitors: false });
      return;
    }
    addLog('info', 'competitor_analysis_started');
    const playbook = selectGrowthPlaybook({
      onboardingStrategy: config.onboardingStrategy,
      persona,
      agentMemory: agentMemoryOverride || config.agentMemory,
      accountBio: config.accountBio,
      leadTarget: config.leadTarget
    });
    
    const prompt = `你是 X 增长操盘手，正在为一个低粉账号设计“可执行的爆款拆解与截流计划”。

账号定位：
- 目标用户：${persona.targetUsers}
- 账号定位：${persona.characteristics}
- 核心目标：${persona.goals}
- 长期记忆：




报告必须像操盘文档，不要像市场报告。必须包含：
1. 【流量假设】：这个账号靠什么被转发、收藏、评论、关注，各写 1 条。
2. 【对标账号类型】：列出 10 个应观察的账号类型或具体账号方向，说明他们的钩子来源、互动方式和可借鉴点。
3. 【低粉爆款框架】：给 5 个框架，每个包含 Hook 模板、正文结构、评论诱因、适合内容类型。
4. 【第一周执行矩阵】：涨粉内容、建信任内容、转化内容、互动钩子内容、人设加深内容，每类给 2 个选题。
5. 【评论截流策略】：在哪些大 V/赛道话题下面评论、评论结构怎么写、什么情况下不要评论。
6. 【风险边界】：不要承诺收益、不要编造案例、不要刷屏、不要碰擦边/政治动员。

请直接返回纯 Markdown 格式的报告内容，不要包裹在JSON里，也不要加额外的问候语。`;

    chrome.storage.local.set({ isAnalyzingCompetitors: true });
    try {
      const report = await callLLM(prompt, config, false);
      
      chrome.storage.local.set({ competitorReport: report, isAnalyzingCompetitors: false }, () => {
         addLog('success', 'competitor_analysis_completed');
         chrome.storage.local.get(['setupAutoStartRequested'], (res) => {
            if (res.setupAutoStartRequested) {
               maybeStartAgentAfterSetup(() => {});
            }
         });
      });
    } catch (e) {
      addLog('error', 'competitor_analysis_failed', [e.message]);
      chrome.storage.local.set({ isAnalyzingCompetitors: false });
    }
  });
}



chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.accountBio && changes.accountBio.newValue) {
       addLog('info', 'profile_bio_updated');
       chrome.storage.local.get(['profileAutoAnalyzeBlockedUntil'], (res) => {
         const blockedUntil = Number(res.profileAutoAnalyzeBlockedUntil || 0);
         if (blockedUntil > Date.now()) return;
         analyzeAccountPersona(changes.accountBio.newValue);
       });
    }
     if (changes.isRunning && changes.isRunning.newValue) {
       console.log('[VibeX] 🚀 isRunning changed to TRUE — starting engine...');
       chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'accountBio', 'agentMemory'], (res) => {
          console.log('[VibeX] 📦 Storage loaded for engine start:', JSON.stringify({apiKey: res.apiKey ? '***' : 'MISSING', apiProvider: res.apiProvider, aiModel: res.aiModel}));
          const errors = getConfigErrors(res);
          if (errors.length > 0) {
             console.log('[VibeX] ❌ Config errors:', errors);
             addLog('error', 'engine_start_failed', [errors.join('、')]);
             chrome.storage.local.set({ isRunning: false, configErrors: errors });
             return;
          }
          chrome.storage.local.remove(['configErrors']);
          addLog('info', 'automation_started');
          console.log('[VibeX] ✅ 机器人已启动 — resetting state');
          chrome.storage.local.set({
             twitterCooldownUntil: 0,
             apiCooldownUntil: 0,
             isGenerating: false,
             isPosting: false,
             isPostingStartedAt: 0,
             ...buildReplyFlowTransition({}, REPLY_FLOW_EVENTS.CLEAR).update,
             isAutoPaused: false,
             pauseReason: '',
             sessionPostCount: 0,
             sessionReplyCount: 0
          });
          
          const isPersonaEmpty = !res.agentMemory || Object.keys(res.agentMemory).length === 0;
          console.log('[VibeX] 🔍 isPersonaEmpty:', isPersonaEmpty, 'accountBio:', !!res.accountBio);
          
          if (res.accountBio && isPersonaEmpty) {
             console.log('[VibeX] → Branch: analyzeAccountPersona');
             analyzeAccountPersona(res.accountBio);
          } else {
             console.log('[VibeX] → Branch: Persona exists or no Bio. Calling checkAndSetupAlarm.');
          }
          chrome.alarms.create("autoShutdownAlarm", { delayInMinutes: 600 });
          ensureAutomationXTab({ active: false, reason: 'automation_started' });
          checkAndSetupAlarm();
          chrome.power.requestKeepAwake('display');
       });
    } else if (changes.isRunning && !changes.isRunning.newValue) {
       addLog('info', 'automation_stopped');
       chrome.alarms.clear("postTweetAlarm");
       chrome.alarms.clear("autoShutdownAlarm");
       chrome.storage.local.set({ isPosting: false, isPostingStartedAt: 0 });
       chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingPostMetadata', 'pendingScheduledAt']);
       chrome.power.releaseKeepAwake();
    }
    if (changes.isAutoPaused && changes.isAutoPaused.newValue !== changes.isAutoPaused.oldValue) {
       if (changes.isAutoPaused.newValue) {
          chrome.power.releaseKeepAwake();
       } else {
          chrome.power.requestKeepAwake('display');
          chrome.storage.local.get(['pendingPost', 'pendingPostSource', 'isRunning'], (res) => {
             if (res.pendingPost && (res.isRunning || res.pendingPostSource === 'manualTest')) {
                addLog('info', 'automation_resumed_pending_post');
                triggerPostInTab();
             } else {
                checkAndSetupAlarm();
             }
          });
       }
    }
    if (changes.engineLanguage && changes.engineLanguage.newValue !== changes.engineLanguage.oldValue) {
       addLog('info', 'language_switched');
       syncAutoPersonaLanguage(changes.engineLanguage.newValue || 'auto').catch((error) => {
          addLog('warn', 'persona_language_sync_failed', [error.message]);
       });
    }
  }
});

// Track Side Panel State
let isSidePanelOpen = false;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidepanel") {
    isSidePanelOpen = true;
    
    port.onDisconnect.addListener(() => {
      isSidePanelOpen = false;
    });
  }
});

// Restrict Side Panel and Action to Twitter Only
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  try {
    const url = new URL(tab.url);
    if (url.hostname.includes('x.com') || url.hostname.includes('twitter.com')) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'options/options.html',
        enabled: true
      });
      await chrome.action.enable(tabId);
    } else {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
      await chrome.action.disable(tabId);
    }
  } catch (e) {}
});

// Also check on tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url) return;
    const url = new URL(tab.url);
    if (url.hostname.includes('x.com') || url.hostname.includes('twitter.com')) {
      await chrome.action.enable(activeInfo.tabId);
    } else {
      await chrome.action.disable(activeInfo.tabId);
    }
  } catch(e) {}
});

// Handle openSidePanel and autoRewrite requests from content script
