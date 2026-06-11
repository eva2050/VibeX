import { formatTweetForX, formatReplyForX, memoryValueToText } from './utils/textUtils.js';
import { normalizeDraftQueue, removeCompletedQueueItem, updateQueueItem, queueNeedsNormalization } from './utils/queueUtils.js';
import { bestViralCandidate, getGeneratedReplyRejectionReason } from './utils/scoreUtils.js';
import { getStorage, setStorage, addLog, getConfigErrors, getAIConnectionErrors, canAutoPublish } from './core/state.js';
import { callLLM } from './services/llm.js';
import { performTrustedClick } from './services/twitter.js';
import { generateSingleTweetDraft, normalizeAgentMemory, mergeAgentMemory } from './core/automation.js';
import { REPLY_RETRY_LOCK_MS, DEFAULT_AGENT_MEMORY, AGENT_MEMORY_LABELS, GROWTH_PLAYBOOKS, DEFAULT_INTERACTION_TARGETS, PROJECT_ACCOUNT_HANDLES, DEFAULT_DISCOVERY_KEYWORDS, selectGrowthPlaybook } from './core/constants.js';
import { setupMessageRouter } from "./handlers/messageRouter.js";
import { pullFromGist, pushToGist } from './core/syncLogic.js';

console.log('[VibeX] ✅ Service Worker started successfully. All modules loaded.');

let gistSyncTimer = null;
const SYNC_KEYS = ['apiKey', 'apiProvider', 'aiModel', 'customPromptGlobal', 'petEnabled', 'accountBio', 'leadTarget', 'aiPersona', 'styleTrainingData', 'engineLanguage', 'replyStrategy', 'feedbackLoopData', 'aiMemory', 'collectedTweets', 'onboardingStrategy', 'targetUsers', 'competitorReport', 'agentMemory', 'smartTimeSlots', 'postsPerDay', 'postInterval', 'gistToken', 'gistId', 'gistAutoSync'];


// background.js

// Storage Abstraction (Promise Wrapper)













// Auto-populate mock key and force-disable petEnabled for standard automation layout
chrome.storage.local.get(['apiKey', 'petEnabled', 'collectedTweets'], (res) => {
  const updates = {};
  if (!res.leadTarget) {
    updates.leadTarget = 'VibeX Growth';
  }
  if (!res.collectedTweets) {
    updates.collectedTweets = [];
  }
  // Force disable the floating pet mascot immediately as requested
  updates.petEnabled = false;
  
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
  console.log("X Auto Bot extension installed.");
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }
  
  if (details.reason === 'update') {
    // Force clear tweet queue on update to ensure any old language drafts are flushed out
    // (No longer flushing tweet queue as instant-generation is used)
    addLog('info', '扩展已更新，已强制清空发帖队列以应用新规则');
  } else {
    addLog('info', '扩展程序已安装');
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
        petEnabled: false,
        petPersonality: 'explorer',
        collectedTweets: []
      });
    }
  });
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// 处理来自 content scripts 或 popup 的消息
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
      addLog('info', '检测到 X 已登录，自动打开策略中心');
      chrome.runtime.openOptionsPage();
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
        addLog('info', '使用已读取的主页简介重新分析账号画像');
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
      addLog('info', '未找到 X 标签页，打开 X 首页等待登录/读取');
      chrome.tabs.create({ url: 'https://x.com/home', active: true });
      return;
    }

    chrome.tabs.sendMessage(target.id, { action: 'forceReadProfileBio' }, () => {
      if (chrome.runtime.lastError) {
        addLog('warn', `X 标签页未响应读取指令，刷新到 X 首页: ${chrome.runtime.lastError.message}`);
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
      isGeneratingReply: false,
      isTyping: false,
      setupAutoStartRequested: false,
      configErrors: []
    }, () => {
      chrome.storage.local.remove(['configErrors']);
      addLog('success', '策略配置完成，Agent 已自动启动');
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
      addLog('info', '自动操作已暂停，跳过发推调度');
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
    setAlarmAtDate(targetTime, `全自动发帖: 计划 ${targetTime.toLocaleTimeString()} 发推`);
  });
}

function scheduleInterval(now, config) {
  const interval = (config.postInterval || 60) * 60000;
  const targetTime = new Date(now.getTime() + interval);
  const targetHour = targetTime.getHours();
  const targetMin = targetTime.getMinutes();
  const addDays = targetTime.getDate() !== now.getDate() ? 1 : 0;
  setAlarm(targetHour, targetMin, addDays);
  addLog('info', `固定间隔模式：计划 ${targetTime.toLocaleString()} 发推`);
}

function scheduleSmart(now, config, postsToday, postsPerDay) {
  const slots = parseTimeSlots(config.smartTimeSlots);
  if (slots.length === 0) {
    addLog('warn', '智能时段配置为空，使用默认时段');
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
  addLog('info', `智能分布模式：计划 ${targetTime.toLocaleString()} 发推（今日 ${postsToday}/${postsPerDay}）`);
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

function setAlarmAtDate(targetTime, reason = '已安排下一次发推') {
  chrome.alarms.clear("postTweetAlarm", () => {
    chrome.alarms.create("postTweetAlarm", { when: targetTime.getTime() });
  });
  addLog('info', `${reason}: ${targetTime.toLocaleString()}`);
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
    addLog('info', '定时器触发，准备执行发推');
    executeNextPost();
  } else if (alarm.name === "autoShutdownAlarm") {
    addLog('warn', '已达到单次最大连续工作时长 (10小时)，为保护账号安全，机器人已自动停止');
    chrome.storage.local.set({ isRunning: false });
  }
});

async function executeNextPost() {
  const result = await getStorage(['pendingPost', 'postsToday', 'lastPostDate', 'postsPerDay', 'isAutoPaused', 'isGenerating', 'onboardingStrategy']);
  if (!canAutoPublish(result)) {
    chrome.alarms.clear("postTweetAlarm");
    await setStorage({ nextPostTime: '自动发帖已关闭' });
    return;
  }

  if (result.isAutoPaused) {
    addLog('info', '自动操作已暂停，跳过本次发推执行');
    return;
  }
  
  if (result.isGenerating) {
    addLog('info', '当前已有推文正在生成中，请耐心等待...');
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
    addLog('info', `今日已达发推上限 ${postsToday}/${postsPerDay}，跳过本次执行`);
    scheduleForTomorrow(new Date(), result);
    return;
  }

  try {
    await setStorage({ isGenerating: true });
    const postText = await generateSingleTweetDraft();
    const formattedText = formatTweetForX(postText);
    
    if (!formattedText) {
       addLog('warn', '生成的推文为空，已跳过本次发推');
       await setStorage({ isGenerating: false });
       checkAndSetupAlarm();
       return;
    }
    
    await setStorage({ 
      pendingPost: formattedText,
      pendingPostId: Date.now() + Math.random(),
      pendingPostSource: 'instant_gen',
      isGenerating: false
    });
    
    addLog('info', `推文生成成功，正在执行发推...`);
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
  chrome.storage.local.get(['pendingPost'], (result) => {
    const intentUrl = getIntentPostUrl(result.pendingPost || '');
    chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
      if (tabs.length > 0) {
        let tab = tabs.find(t => t.active) || tabs[0];
        addLog('info', `向标签页 ${tab.id} 发送发推指令`);
        chrome.tabs.sendMessage(tab.id, { action: "postNewTweet" }, () => {
          if (chrome.runtime.lastError) {
            addLog('warn', `标签页未响应内容脚本，改开干净 intent/post 标签页: ${chrome.runtime.lastError.message}`);
            chrome.tabs.create({ url: intentUrl, active: true });
          }
        });
      } else {
        addLog('info', '未找到 X.com 标签页，新建 intent/post 标签页');
        chrome.tabs.create({ url: intentUrl });
      }
    });
  });
}

function handlePostCompleted(source) {
  chrome.storage.local.get(['postsToday', 'lastPostDate', 'sessionPostCount'], (result) => {
    const updates = {
      pendingPost: null,
      pendingPostId: null,
      pendingPostSource: null,
      pendingScheduledAt: null,
      isAutoPaused: false,
      pauseReason: ''
    };

    const finalize = () => {
      chrome.storage.local.set(updates, () => {
        chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingScheduledAt']);
        checkAndSetupAlarm();
        chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
      });
    };

    if (source === 'queue' || source === 'instant_gen') {
      const now = new Date();
      const todayStr = now.toDateString();
      let postsToday = result.postsToday || 0;
      if (result.lastPostDate !== todayStr) postsToday = 0;
      updates.postsToday = postsToday + 1;
      updates.lastPostDate = todayStr;
      updates.sessionPostCount = (result.sessionPostCount || 0) + 1;
      addLog('success', `推文发布成功，今日已发 ${updates.postsToday} 条`);
      finalize();

    } else {
      addLog('success', '测试推文发送成功');
      finalize();
    }
  });
}

async function generateAIResponse(tweetContent, replyContext = {}) {
  try {
    const config = await getStorage(['apiKey', 'apiProvider', 'aiModel', 'promptTemplate', 'styleTrainingData', 'engineLanguage', 'feedbackLoopData', 'replyStrategy', 'customPromptGlobal', 'aiPersona', 'accountBio', 'leadTarget']);
    if (!config.engineLanguage || config.engineLanguage === 'auto') config.engineLanguage = navigator.language.startsWith('zh') ? 'zh' : 'en';
    const errors = getConfigErrors(config);
    if (errors.length > 0) {
      addLog('warn', `配置不完整，无法生成回复：${errors.join('、')}`);
      throw new Error(errors.join('；'));
    }
    
    const playbook = selectGrowthPlaybook({
        onboardingStrategy: config.onboardingStrategy,
        
        agentMemory: config.agentMemory,
        accountBio: config.accountBio,
        leadTarget: config.leadTarget
      });
      
      let styleConstraint = '';
      if (config.styleTrainingData) {
        styleConstraint = `\n【严格文风约束】：必须100%模仿以下参考素材的断句节奏、用词习惯（如特定语气词、emoji）、情绪饱和度以及排版结构。请提取并在输出中重现这种独特的个人风格，杜绝任何AI感。\n<文风参考>\n${config.styleTrainingData}\n</文风参考>\n\n`;
      }
      
      let feedbackConstraint = '';
      if (config.feedbackLoopData && config.feedbackLoopData.length > 0) {
        const feedbackExamples = config.feedbackLoopData.map((fb, idx) => `[示例 ${idx+1}]\n- 你的原输出 (错误示范): ${fb.original}\n- 用户的修改版 (正确示范): ${fb.modified}`).join('\n\n');
        feedbackConstraint = `\n【自我进化避坑指南】：请学习用户对你以往回复的修改思路，严禁重犯之前的AI味错误！\n<避坑案例>\n${feedbackExamples}\n</避坑案例>\n`;
      }
      
      let langConstraint = '';
      const baseLangConstraint = () => {
        if (config.engineLanguage === 'en') return '\n【语言约束】：You MUST output in English.';
        if (config.engineLanguage === 'ja') return '\n【语言约束】：You MUST output in Japanese (日本語).';
        if (config.engineLanguage === 'es') return '\n【语言约束】：You MUST output in Spanish (Español).';
        if (config.engineLanguage === 'id') return '\n【语言约束】：You MUST output in Indonesian (Bahasa Indonesia).';
        if (config.engineLanguage === 'zh') return '\n【语言约束】：必须使用中文输出。';
        return '';
      };

      const origLang = replyContext.originalLanguage || '';
      const outputConstraint = baseLangConstraint();
      if (origLang) {
        langConstraint = `\n【上下文提示】：注意，下面的推文内容已经被 X 平台翻译过，原始语言是「${origLang}」。请基于此背景进行理解。\n${outputConstraint}`;
      } else {
        langConstraint = outputConstraint;
      }
      
      let currentReplyStrategy = config.replyStrategy || '极简流：精辟吐槽 / 玩梗';
      let strategyInstruction = '';
      if (currentReplyStrategy.includes('杠精')) {
        strategyInstruction = '策略：1. 找出原推文逻辑最薄弱的一点进行精准打击；2. 抛出一个极其反直觉的犀利观点；3. 多用反问句引发争议和辩论。要求：一针见血，带点嘲讽感但不做人身攻击，字数控制在40字以内。';
      } else if (currentReplyStrategy.includes('专业')) {
        strategyInstruction = '策略：1. 直接基于推文内容进行客观的专业分析，无论赞同还是反对都必须一针见血；2. 【关键】必须要补充一条极其硬核的冷知识、底层逻辑或具体数据来作为支撑。要求：不卑不亢，展现极高的专业素养和信息密度，字数控制在80字以内。';
      } else if (currentReplyStrategy.includes('极简')) {
        strategyInstruction = '策略：1. 用一句极其精辟的吐槽、神级比喻或者互联网黑话来总结原推文；2. 绝不要分析，只要情绪价值和幽默感。要求：短平快，字数绝对不能超过15个字。';
      } else if (currentReplyStrategy.includes('自定义')) {
        strategyInstruction = '【用户完全自定义策略/System Prompt】：' + (config.customPromptGlobal || '请按照你的判断提供高质量回复。');
      } else {
        strategyInstruction = '要求：使用“' + currentReplyStrategy + '”的策略，为这条推文写一条高质量的破冰回复。口语化，不要有AI味。';
      }

      const personaContext = ``;
      
      const prompt = `你是一个严格的 X 评论筛选与回复 Agent。

先判断这条推文是否值得回复。以下情况必须只返回 SKIP：
- 互动钓鱼、求曝光、求评论、求关注、抽奖、无信息量口号
- 原推文的受众或博主类型与【你的目标受众画像】不符（即使原推文使用的是外语，如果发推人不属于目标受众，也必须 SKIP！）
- 与账号定位、目标读者、内容方向明显无关
- 回复后只能显得蹭流量、硬广、尬聊
- 推文上下文不足，无法补充一个具体判断

如果值得回复，且原推文属于目标受众群体，再写一条自然、有信息增量的短回复：
- 不超过 90 个字符
- 【语言要求】：${langConstraint}
- 先补充观点/经验/反问，不要上来推销
- 必须包含一个具体信息增量：判断标准、反例、边界、场景、动作步骤或可验证观察
- 把每条回复当成一条可以独立成立的 mini-content；如果单独看没有价值，返回 SKIP
- 回复目标不是“抢注意力”，而是让原推变得更完整：补上下文、延展观点、压缩重点或加入真实经验
- 回复结构优先选一种：
  1. Missing angle：说出原推没讲但读者需要的关键边界
  2. Sharpen：把原推压缩成更锋利的一句话
  3. Real experience：补一个亲历/观察/可验证的实践经验
  4. Next step：给一个下一步动作或判断标准
- 不要写“说得对/学习了/很有启发/值得关注/未来可期/干货满满”
- 不要 hijack 原帖，不要把话题强行转到自己产品
- 不要堆标签；默认不加 hashtag
- 不要说“看我主页/私信我/翻我主页”，除非原文明确在求资源
- 不要承诺收益，不要编造事实，不要攻击个人
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
          addLog('info', `AI 判定不适合回复，已跳过: ${tweetContent.substring(0, 50)}...`);
          return '';
        }
        const reply = formatReplyForX(parsed?.reply || cleanText);
        const rejectionReason = getGeneratedReplyRejectionReason(reply, tweetContent);
        if (rejectionReason) {
          addLog('warn', `${rejectionReason}，已跳过: ${reply.substring(0, 50)}...`);
          return '';
        }
        return reply;
      } catch (e) {
        console.warn("X Auto Bot: API Rate limit or fetch error", e);
        throw e;
      }
  } catch (outerError) {
    addLog('error', `生成回复失败: ${outerError.message}`);
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
          addLog('info', 'Agent 对话已本地记录到长期记忆');
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
- 发文特征：${config.aiPersona?.characteristics || '未填写'}
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
          addLog('success', 'Agent 对话已更新长期记忆');
          resolve({ messages: nextMessages, agentMemory, memoryUpdated: true });
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function analyzeAccountPersona(bio) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', ], async (config) => {
    const errors = getAIConnectionErrors(config);
    if (errors.length > 0) {
      addLog('warn', `配置不完整，无法分析账号画像：${errors.join('、')}`);
      chrome.storage.local.set({ isAnalyzingPersona: false });
      return;
    }
    addLog('info', '开始 AI 账号画像分析...');
    
    const prompt = `你是 X/Twitter 增长操盘手，请把以下账号主页信息重构成一个“个人发声 Agent 的长期记忆”。
你不是普通品牌顾问。你的判断必须围绕：
- 这个账号靠什么被关注
- 哪类内容负责涨粉、建信任、转化、互动截流、人设加深
- 目标用户为什么会停留、转发、评论、收藏
- 账号应该避免哪些会降低可信度或触发风险的表达

账号简介：
${bio || '暂无'}

产品目标用户是：想在 X 上建立影响力的创始人、独立开发者、出海从业者、AI 工具人、投资/研究人员；以及有想法但输出不稳定、会刷 X 但不会把输入转化为观点和内容、强烈想做 KOL 的人。

请基于账号简介推断，但不要编造具体履历、收益、身份头衔或不可验证案例。输出要可直接填入设置页。
写法要像给 X 账号操盘用的作战记忆，不要像简历总结或咨询报告。

不要包含任何多余文字，严格以如下 JSON 对象格式返回：
{
  "targetUsers": "...",
  "characteristics": "...",
  "goals": "...",
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
      const persona = {
        targetUsers: parsed.targetUsers || '科技、互联网与 AI 领域的活跃网友',
        characteristics: parsed.characteristics || '幽默、犀利、喜欢参与前沿话题讨论',
        goals: parsed.goals || '建立有趣的个人品牌，扩大社交圈与影响力'
      };
      const agentMemory = mergeAgentMemory(config.agentMemory, parsed.memory || parsed.agentMemory || {});
      
      chrome.storage.local.set({ aiPersona: persona, agentMemory, isAnalyzingPersona: false }, () => {
         addLog('success', '账号画像分析完成');
         analyzeCompetitors(persona, agentMemory);
      });
    } catch (e) {
      addLog('error', `账号画像分析失败: ${e.message}`);
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
        addLog('info', '开始启动向导来源分析');
        const generatedText = await callLLM(prompt, config, true);
        const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJsonStr);
        const analysis = normalizeOnboardingAnalysis(parsed, source);
        chrome.storage.local.set({ onboardingSourceAnalysis: analysis }, () => {
          addLog('success', '启动向导来源分析完成');
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
      addLog('warn', `配置不完整，无法分析竞品：${errors.join('、')}`);
      chrome.storage.local.set({ isAnalyzingCompetitors: false });
      return;
    }
    addLog('info', '开始竞品对标与爆款策略分析...');
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
- 发文特征：${persona.characteristics}
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
         addLog('success', '竞品分析报告生成完成');
         chrome.storage.local.get(['setupAutoStartRequested'], (res) => {
            if (res.setupAutoStartRequested) {
               maybeStartAgentAfterSetup(() => {});
            }
         });
      });
    } catch (e) {
      addLog('error', `竞品分析失败: ${e.message}`);
      chrome.storage.local.set({ isAnalyzingCompetitors: false });
    }
  });
}



chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    const hasSyncKeyChanges = Object.keys(changes).some(k => SYNC_KEYS.includes(k));
    const isOnlyStatusChange = Object.keys(changes).every(k => ['gistStatus', 'gistLastSyncAt', 'gistLastError', 'gistId', 'logs'].includes(k));
    
    if (hasSyncKeyChanges && !isOnlyStatusChange) {
      chrome.storage.local.get(['gistToken', 'gistId', 'gistAutoSync'], (res) => {
        if (res.gistAutoSync && res.gistToken) {
          clearTimeout(gistSyncTimer);
          gistSyncTimer = setTimeout(() => {
            pushToGist(res.gistToken, res.gistId);
          }, 10000);
        }
      });
    }

    if (changes.accountBio && changes.accountBio.newValue) {
       addLog('info', '检测到主页简介更新，触发画像分析');
       analyzeAccountPersona(changes.accountBio.newValue);
    }
     if (changes.isRunning && changes.isRunning.newValue) {
       console.log('[VibeX] 🚀 isRunning changed to TRUE — starting engine...');
       chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'accountBio', 'agentMemory'], (res) => {
          console.log('[VibeX] 📦 Storage loaded for engine start:', JSON.stringify({apiKey: res.apiKey ? '***' : 'MISSING', apiProvider: res.apiProvider, aiModel: res.aiModel}));
          const errors = getConfigErrors(res);
          if (errors.length > 0) {
             console.log('[VibeX] ❌ Config errors:', errors);
             addLog('error', `启动失败：${errors.join('、')}，请先到配置中心完善设置`);
             chrome.storage.local.set({ isRunning: false, configErrors: errors });
             return;
          }
          chrome.storage.local.remove(['configErrors']);
          addLog('info', '机器人已启动');
          console.log('[VibeX] ✅ 机器人已启动 — resetting state');
          chrome.storage.local.set({
             twitterCooldownUntil: 0,
             apiCooldownUntil: 0,
             isGeneratingReply: false,
             isGenerating: false,
             isTyping: false,
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
          checkAndSetupAlarm();
          chrome.power.requestKeepAwake('display');
       });
    } else if (changes.isRunning && !changes.isRunning.newValue) {
       addLog('info', '机器人已停止');
       chrome.alarms.clear("postTweetAlarm");
       chrome.alarms.clear("autoShutdownAlarm");
       chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingScheduledAt']);
       chrome.power.releaseKeepAwake();
    }
    if (changes.isAutoPaused && changes.isAutoPaused.newValue !== changes.isAutoPaused.oldValue) {
       if (changes.isAutoPaused.newValue) {
          chrome.power.releaseKeepAwake();
       } else {
          chrome.power.requestKeepAwake('display');
          chrome.storage.local.get(['pendingPost', 'pendingPostSource', 'isRunning'], (res) => {
             if (res.pendingPost && (res.isRunning || res.pendingPostSource === 'manualTest')) {
                addLog('info', '检测到自动操作恢复，继续处理待发送推文');
                triggerPostInTab();
             } else {
                checkAndSetupAlarm();
             }
          });
       }
    }
    if (changes.engineLanguage && changes.engineLanguage.newValue !== changes.engineLanguage.oldValue) {
       addLog('info', '输出语言已切换');
    }
  }
});

// Track Side Panel State
let isSidePanelOpen = false;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidepanel") {
    isSidePanelOpen = true;
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(t => chrome.tabs.sendMessage(t.id, { action: 'sidePanelState', isOpen: true }).catch(()=>{}));
    });
    
    port.onDisconnect.addListener(() => {
      isSidePanelOpen = false;
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(t => chrome.tabs.sendMessage(t.id, { action: 'sidePanelState', isOpen: false }).catch(()=>{}));
      });
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
      chrome.action.enable(tabId);
    } else {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
      chrome.action.disable(tabId);
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
      chrome.action.enable(activeInfo.tabId);
    } else {
      chrome.action.disable(activeInfo.tabId);
    }
  } catch(e) {}
});

// Handle openSidePanel and autoRewrite requests from content script
