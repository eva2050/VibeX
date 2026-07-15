async function insertIntoDraftJs(editor, text) {
  if (!editor) return;

  // Strip Markdown bold/italic markers (Twitter doesn't support Markdown)
  text = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');

  editor.focus();
  // Wait for the editor to be fully ready after focus
  await new Promise(r => setTimeout(r, 50));

  // Select all existing content so paste replaces it
  document.execCommand('selectAll', false, null);

  // Use text/plain ONLY — HTML breaks Draft.js block mapping
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', text);

  editor.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true
  }));

  // Give Draft.js time to process the paste, then wake up the Tweet button
  await new Promise(r => setTimeout(r, 100));
  editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
}
// content/x_scraper.js
(function() {
'use strict';

console.log("VibeX: Scraper loaded on X.com");

// Global cooldown to prevent hitting Gemini API rate limits (15 requests/min)
const REPLY_COOLDOWN_MS = 300000; // 5 minutes
const REPLY_ATTEMPT_LOCK_MS = 60000; // short lock while the automator tries to send
const MAX_LOGS = 50;
const MIN_REPLY_OPPORTUNITY_SCORE = 35;
const SEARCH_DISCOVERY_MIN_INTERVAL_MS = 90 * 1000;
const SEARCH_DISCOVERY_ROTATE_INTERVAL_MS = 2 * 60 * 1000;
const SEARCH_DISCOVERY_LOW_QUALITY_ROTATE_MS = 15 * 1000;
const SEARCH_DISCOVERY_DEAD_END_ROTATE_MS = 3000;
const SEARCH_EMPTY_ROTATE_MIN_AGE_MS = 8000;
const STARTUP_DISCOVERY_GRACE_MS = 60 * 1000;

const {
  SEARCH_DISCOVERY_LOOKBACK_DAYS,
  DEFAULT_INTERACTION_TARGETS,
  PROJECT_ACCOUNT_HANDLES,
  DEFAULT_DISCOVERY_KEYWORDS_ZH,
  DEFAULT_DISCOVERY_KEYWORDS_EN,
  isLowValueReplyTarget,
  parseTargetHandles,
  inferStrategyArchetype,
  getDefaultInteractionTargets,
  getDefaultDiscoveryKeywords,
  collectTargetHandles,
  parseDiscoveryKeywords,
  collectDiscoveryKeywords,
  getSearchLanguageOperator,
  detectKeywordLanguage,
  getLangFilterForKeyword,
  getSearchThresholds,
  getRecentSinceDate,
  quoteSearchTerm,
  isAdvancedSearchQuery,
  getNegativeSearchOperators,
  buildDiscoverySearchQueries,
  isSensitiveReplyTarget,
  collectTopicKeywords,
  hasRelevantTopic,
  hasStandaloneReplyPotential,
  isLikelyProjectAccountLabel,
  parseMetricNumber,
  extractMetricFromText,
  metricKnown,
  summarizeMetrics,
  hasStrongEngagement,
  scoreFreshness
} = window.VibeXEvaluator;

// ==========================================
// Logging System
// ==========================================
function addLog(level, message) {
  if (!chrome.runtime?.id) return;
  const entry = {
    time: Date.now(),
    level: level,
    message: message,
    source: 'scraper'
  };
  chrome.storage.local.get(['logs'], (result) => {
    let logs = result.logs || [];
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    chrome.storage.local.set({ logs });
  });
}

function safeRuntimeSendMessage(message, callback) {
  if (!chrome.runtime?.id) return;
  try {
    const result = chrome.runtime.sendMessage(message, callback);
    if (result?.catch) result.catch(() => {});
  } catch (error) {
    // Happens when the extension is reloaded while this old content script is still running.
  }
}

const ReplyFlowState = window.VibeXAutomationState;
const ReplyFlowEvents = ReplyFlowState.EVENTS;
let replyFlowLocalLockUntil = 0;

function hasActiveReplyFlow(state = {}) {
  return Date.now() < replyFlowLocalLockUntil || ReplyFlowState.hasActiveReplyFlow(state);
}

function startReplyFlowLocalLock(ttlMs = 3 * 60 * 1000) {
  replyFlowLocalLockUntil = Date.now() + ttlMs;
}

function clearReplyFlowLocalLock() {
  replyFlowLocalLockUntil = 0;
}

window.addEventListener('xAutoBot_ReplyFlowStateVisible', () => {
  clearReplyFlowLocalLock();
});

function hasActivePostFlow(state = {}) {
  return Boolean(state.pendingPost || state.isPosting);
}

function applyReplyFlowEvent(event, payload = {}, extra = {}, callback) {
  ReplyFlowState.applyReplyFlowEvent(chrome.storage.local, event, payload, extra, callback);
}

function clearReplyFlowState(values = {}, callback) {
  clearReplyFlowLocalLock();
  applyReplyFlowEvent(ReplyFlowEvents.CLEAR, {}, values, callback);
}

function normalizeUiLanguage(value = 'auto') {
  const lang = String(value || 'auto').trim();
  const browserLang = (navigator.language || 'en').toLowerCase();
  if (lang === 'auto') {
    if (browserLang.startsWith('zh')) return 'zh';
    if (browserLang.startsWith('ja')) return 'ja';
    if (browserLang.startsWith('es')) return 'es';
    if (browserLang.startsWith('id')) return 'id';
    return 'en';
  }
  if (lang === 'zh-CN' || lang === 'zh-TW') return 'zh';
  return ['zh', 'en', 'ja', 'es', 'id'].includes(lang) ? lang : 'en';
}

function incrementProcessedTweets() {
  chrome.storage.local.get(['stats'], (res) => {
    const stats = res.stats || { tweetsProcessed: 0, repliesSent: 0 };
    stats.tweetsProcessed = (stats.tweetsProcessed || 0) + 1;
    chrome.storage.local.set({ stats });
  });
}

function setProfileProgress(stage, message, percent) {
  if (!chrome.runtime?.id) return;
  const progress = {
    stage,
    message,
    percent,
    updatedAt: Date.now()
  };
  chrome.storage.local.set({ profileReadProgress: progress });
}

function getProfileLinkNode() {
  const directSelectors = [
    'a[data-testid="AppTabBar_Profile_Link"]',
    'header[role="banner"] a[aria-label*="Profile"]',
    'header[role="banner"] a[aria-label*="个人"]',
    'nav a[aria-label*="Profile"]',
    'nav a[aria-label*="个人"]'
  ];

  for (const selector of directSelectors) {
    const node = document.querySelector(selector);
    if (node?.href) return node;
  }

  return Array.from(document.querySelectorAll('header[role="banner"] nav a[href^="/"], nav a[href^="/"]'))
    .find(link => isProfilePath(new URL(link.href).pathname));
}

function isProfilePath(pathname = '') {
  const firstSegment = pathname.split('/').filter(Boolean)[0] || '';
  const blocked = new Set([
    'home', 'explore', 'notifications', 'messages', 'i', 'settings',
    'compose', 'search', 'intent', 'login', 'logout', 'oauth', 'share',
    'jobs', 'communities', 'premium', 'verified_orgs'
  ]);
  return /^[A-Za-z0-9_]{1,15}$/.test(firstSegment) && !blocked.has(firstSegment.toLowerCase());
}

function isDiscoverySurfacePage(state = {}) {
  const pathname = window.location.pathname || '';
  if (getAutomationMode(state) === 'autoReply') {
    return pathname === '/home' || pathname === '/explore' || pathname.startsWith('/i/lists/');
  }
  return pathname === '/home' || pathname === '/explore' || pathname === '/search' || pathname.startsWith('/i/lists/');
}

function isElementVisible(element) {
  if (!element || !element.getClientRects?.().length) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0
    && rect.height > 0
    && rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth;
}

function normalizeComposerText(text = '') {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function getComposerText(editor) {
  const text = normalizeComposerText(editor?.innerText || editor?.textContent || editor?.value || '');
  if (/^(what is happening\?!?|what's happening\?!?|post your reply|tweet your reply|发布你的回复|有什么新鲜事|正在发生什么)$/i.test(text)) {
    return '';
  }
  return text;
}

function hasEnabledComposerSubmit(editor) {
  const root = editor?.closest('div[role="dialog"]') || editor?.closest('main') || document;
  const button = root.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
  return Boolean(button && isElementVisible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true');
}

function hasVisibleUnfinishedTweetEditor() {
  const selectors = [
    '[data-testid="tweetTextarea_0"] [contenteditable="true"]',
    '[data-testid="tweetTextarea_0"][contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]'
  ];
  const editors = [...new Set(selectors.flatMap(selector => Array.from(document.querySelectorAll(selector))))]
    .filter(editor => editor.isContentEditable && isElementVisible(editor));

  return editors.some(editor => getComposerText(editor) || hasEnabledComposerSubmit(editor));
}

function getCurrentProfilePath() {
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  return isProfilePath(`/${firstSegment}`) ? `/${firstSegment}` : '';
}

function getProfilePathFromNav() {
  const profileLinkNode = getProfileLinkNode();
  if (!profileLinkNode?.href) return '';
  return new URL(profileLinkNode.href).pathname.split('/').slice(0, 2).join('/');
}

function isOnTargetProfilePage(profilePath) {
  const currentProfilePath = getCurrentProfilePath();
  if (!currentProfilePath) return false;
  return profilePath ? currentProfilePath.toLowerCase() === profilePath.toLowerCase() : true;
}

function extractFirstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function extractProfileSnapshot() {
  const bioText = document.querySelector('div[data-testid="UserDescription"]')?.innerText?.trim() || '';
  const nameText = document.querySelector('div[data-testid="UserName"]')?.innerText?.trim() || '';
  const nameLines = nameText.split('\n').map(line => line.trim()).filter(Boolean);
  const displayName = nameLines.find(line => !line.startsWith('@')) || '';
  const handleFromName = extractFirstMatch(nameText, [/@([A-Za-z0-9_]{1,15})/]);
  const handleFromPath = getCurrentProfilePath().replace('/', '');
  const handle = handleFromName || handleFromPath;
  const avatarUrl = document.querySelector('[data-testid^="UserAvatar-Container"] img')?.src
    || document.querySelector('main a[href$="/photo"] img')?.src
    || '';
  const mainText = document.querySelector('main')?.innerText || document.body.innerText || '';
  const following = extractFirstMatch(mainText, [
    /([0-9,.万千Kk]+)\s*(?:Following|正在关注|关注中)/,
    /(?:Following|正在关注|关注中)\s*([0-9,.万千Kk]+)/
  ]);
  const followers = extractFirstMatch(mainText, [
    /([0-9,.万千Kk]+)\s*(?:Followers|粉丝|关注者)/,
    /(?:Followers|粉丝|关注者)\s*([0-9,.万千Kk]+)/
  ]);

  const lines = [];
  if (displayName || handle) lines.push(`账号：${displayName || '未读取到昵称'}${handle ? ` (@${handle})` : ''}`);
  lines.push(`主页简介：${bioText || '未填写或未公开显示'}`);
  if (following || followers) {
    lines.push(`账号数据：${following ? `关注 ${following}` : ''}${following && followers ? '，' : ''}${followers ? `粉丝 ${followers}` : ''}`);
  }
  if (handle) lines.push(`主页链接：https://x.com/${handle}`);

  return {
    text: lines.join('\n').trim(),
    profile: {
      source: 'profile_scan',
      username: handle,
      handle,
      name: displayName,
      description: bioText,
      profile_image_url: avatarUrl,
      avatarUrl,
      followers,
      following,
      followersCount: parseMetricNumber(followers),
      followingCount: parseMetricNumber(following)
    },
    hasIdentity: Boolean(displayName || handle || bioText),
    hasBio: Boolean(bioText)
  };
}

// ==========================================
// Auto Scroll Logic
// ==========================================
let scrollInterval = null;
let restTimeout = null;
let scrollCountInCycle = 0;
let xLoginDetectedNotified = false;

function startAutoScroll(options = {}) {
  if (scrollInterval || restTimeout) return;
  chrome.storage.local.get(['isAutoPaused', 'pendingReply', 'pendingPost', 'isPosting', 'lastSurfaceNavigationAt', 'onboardingStrategy', 'isGeneratingReply', 'isReplyTyping', 'isTyping', 'replyFlowLockUntil'], (result) => {
    if (result.isAutoPaused && !options.skipPauseCheck) {
      addLog('info', '自动操作已暂停，不启动自动滚动');
      return;
    }
    if (hasActiveReplyFlow(result)) {
      addLog('info', '正在处理上一条自动回复，暂不启动自然浏览');
      return;
    }
    if (hasActivePostFlow(result)) {
      addLog('info', '正在处理待发推文，暂不启动自然浏览');
      return;
    }
    if (hasVisibleUnfinishedTweetEditor()) {
      addLog('info', '检测到未完成编辑器，暂不启动自然浏览');
      return;
    }
    if (maybeNavigateToHomeSurface(result, '启动时停在个人主页或非发现页')) return;
    
    const modeName = result.onboardingStrategy?.automationMode || 'autoEngage';
    let actionText = '点赞/回复或发帖调度';
    if (modeName === 'autoPost') actionText = '发帖调度';
    else if (modeName === 'autoReply') actionText = '点赞/回复调度';
    
    addLog('info', `正在自然浏览时间线，等待触发下一次${actionText}...`);
    beginScrollCycle();
  });
}

function beginScrollCycle() {
  scrollCountInCycle = 0;
  const scrollsInThisCycle = 3 + Math.floor(Math.random() * 4); // 3~6 次

  function doOneScroll() {
    scrollCountInCycle++;
    const distance = 400 + Math.floor(Math.random() * 400); // 400~800 px，只向下
    window.scrollBy({ top: distance, behavior: 'smooth' });

    if (scrollCountInCycle >= scrollsInThisCycle) {
      // 本轮滚动结束，进入休息
      clearInterval(scrollInterval);
      scrollInterval = null;
      const restSec = 20 + Math.floor(Math.random() * 21); // 20~40 秒休息
      restTimeout = setTimeout(() => {
        restTimeout = null;
        beginScrollCycle();
      }, restSec * 1000);
    }
  }

  // 首次立即滚动一次
  doOneScroll();
  // 后续每隔 2~5 秒滚动一次
  scrollInterval = setInterval(doOneScroll, 2000 + Math.floor(Math.random() * 3000));
}

function stopAutoScroll() {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  if (restTimeout) {
    clearTimeout(restTimeout);
    restTimeout = null;
  }
  addLog('info', '停止自动滚动');
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.isRunning) {
    if (changes.isRunning.newValue) {
      isReplying = false;
      twitterCooldownUntil = 0;
      apiCooldownUntil = 0;
      // Force clear isAutoPaused to prevent race condition
      chrome.storage.local.set({ isAutoPaused: false }, () => {
        startAutoScroll({ skipPauseCheck: true });
        ensureBioExtracted();
      });
    } else {
      stopAutoScroll();
    }
  }
  if (namespace === 'local' && changes.profileReadRequested?.newValue) {
    ensureBioExtracted({ force: true });
  }
});

// Initial check for auto-scroll
chrome.storage.local.get(['profileReadRequested', 'botNavigationTime', 'isRunning', 'automationStartTime'], (result) => {
  const isBotNavigating = result.botNavigationTime && (Date.now() - result.botNavigationTime < 10000);
  const isJustStarted = result.automationStartTime && (Date.now() - result.automationStartTime < 30000);
  const isHiddenSystemNavigation = isBotNavigating && document.visibilityState === 'hidden';

  if (isHiddenSystemNavigation) {
    return;
  }
  
  if (isBotNavigating || isJustStarted) {
    // Bot is navigating itself (e.g. rotating keywords) or just started, do not pause.
    if (result.isRunning) {
      startAutoScroll();
      ensureBioExtracted();
    }
  } else if (result.isRunning) {
    // Turn off automation on manual page refresh by default per user request
    chrome.storage.local.set({ isRunning: false, isAutoPaused: true });
  }
  
  if (result.profileReadRequested) {
    ensureBioExtracted({ force: true });
  }
});

function notifyXLoginDetectedIfNeeded() {
  if (xLoginDetectedNotified || !chrome.runtime?.id) return;
  const profileLinkNode = getProfileLinkNode();
  const accountSwitcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  if (!profileLinkNode && !accountSwitcher) return;
  xLoginDetectedNotified = true;
  safeRuntimeSendMessage({ action: 'xLoginDetected' }, () => {});
}

const loginDetectInterval = setInterval(() => {
  notifyXLoginDetectedIfNeeded();
  if (xLoginDetectedNotified) clearInterval(loginDetectInterval);
}, 1500);
setTimeout(() => clearInterval(loginDetectInterval), 30000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'readProfileSnapshot') {
    const snapshot = extractProfileSnapshot();
    sendResponse({
      success: Boolean(snapshot.hasIdentity),
      bio: snapshot.text || ''
    });
    return false;
  }

  if (request.action === 'forceReadProfileBio') {
    ensureBioExtracted({ force: true });
    sendResponse({ success: true });
    return false;
  }

  if (request.action === 'readPostPerformance') {
    setTimeout(() => {
      sendResponse(readTweetPerformanceSnapshot(request));
    }, 300);
    return true;
  }

  if (request.action === 'scanProfilePerformanceBaseline') {
    const profilePath = getProfilePathFromNav();
    if (!isOnTargetProfilePage(profilePath) && profilePath) {
      window.location.assign(`https://x.com${profilePath}`);
      sendResponse({ success: false, navigating: true, error: 'navigating to profile' });
      return false;
    }
    setTimeout(() => {
      sendResponse(scanProfilePerformanceBaseline(request.limit || 30));
    }, 500);
    return true;
  }

  if (request.action === 'scanCreatorCenterSnapshot') {
    setTimeout(() => {
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      const isCreatorPage = /creator|analytics|monetization|verified/i.test(location.href + ' ' + text);
      sendResponse({
        success: Boolean(text && isCreatorPage),
        url: location.href,
        text: text.slice(0, 5000),
        capturedAt: Date.now()
      });
    }, 800);
    return true;
  }

  if (request.action === 'startAutomationLoop') {
    isReplying = false;
    twitterCooldownUntil = 0;
    apiCooldownUntil = 0;
    chrome.storage.local.set({
      isAutoPaused: false,
      twitterCooldownUntil: 0,
      apiCooldownUntil: 0,
      ...ReplyFlowState.buildReplyFlowTransition({}, ReplyFlowEvents.CLEAR).update,
      botNavigationTime: Date.now()
    }, () => {
      startAutoScroll({ skipPauseCheck: true });
      scrapeTweets();
    });
    sendResponse({ success: true });
    return true;
  }
});

// ==========================================
// Bio Extraction Logic with Progress Tracking
// ==========================================
function ensureBioExtracted(options = {}) {
  if (!chrome.runtime?.id) return;
  const force = Boolean(options.force);
  chrome.storage.local.get(['accountBio', 'isRunning', 'profileReadProgress', 'isAutoPaused'], (result) => {
    if (result.isAutoPaused && !force) return;
    if ((!result.isRunning && !force) || (result.accountBio && !force)) {
      if (result.accountBio) {
        setProfileProgress('extracted', '主页简介已读取', 100);
      }
      return;
    }
    
    addLog('info', '开始提取账号主页简介...');
    setProfileProgress('checking_link', '正在检测 Profile 导航链接...', 15);
    
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      if (!chrome.runtime?.id) { clearInterval(checkInterval); return; }
      checkCount++;
      
      const profilePath = getProfilePathFromNav();
      if (!profilePath && !getCurrentProfilePath()) {
        if (force && checkCount > 20) {
          addLog('warn', '未检测到 X 登录态，无法读取主页简介');
          chrome.storage.local.set({
            accountBio: '',
            profileReadRequested: false
          });
          setProfileProgress('failed', '未检测到 X 登录态，请先登录 X 后重试', 0);
          clearInterval(checkInterval);
          return;
        }
        if (checkCount % 3 === 0) {
          addLog('info', `等待 Profile 导航链接加载... (${checkCount}s)`);
        }
        return;
      }
      
      if (isOnTargetProfilePage(profilePath)) {
        setProfileProgress('waiting_bio', '正在 Profile 页面读取账号信息...', 65);
        const snapshot = extractProfileSnapshot();
        if (snapshot.hasIdentity) {
          chrome.storage.local.set({ accountBio: snapshot.text, profileReadRequested: false }, () => {
            addLog('success', `主页信息已提取: ${snapshot.text.substring(0, 50)}...`);
            setProfileProgress(
              'extracted',
              snapshot.hasBio ? '主页简介已读取' : '主页信息已读取，简介为空，已使用账号信息兜底',
              100
            );
          });
          clearInterval(checkInterval);
          return;
        }
        if (checkCount > 30) {
          addLog('warn', '在 Profile 页面等待账号信息超时，未读取到简介');
          chrome.storage.local.set({ accountBio: '', profileReadRequested: false });
          setProfileProgress('failed', '简介读取失败，可在长期记忆中心手动填写人设', 0);
          clearInterval(checkInterval);
        }
      } else {
        if (checkCount === 1) {
          setProfileProgress('opening_page', '正在打开 Profile 页面...', 35);
          addLog('info', '当前不在 Profile 页面，后台静默打开...');
          chrome.storage.local.set({ botNavigationTime: Date.now(), profileReadRequested: true }, () => {
            safeRuntimeSendMessage({ action: 'openProfileTab', url: `https://x.com${profilePath}` });
          });
          clearInterval(checkInterval);
        }
        if (checkCount > 25) {
          addLog('warn', '等待 Profile 页面加载超时，跳过简介提取');
          chrome.storage.local.set({ accountBio: '', profileReadRequested: false });
          setProfileProgress('failed', '简介读取失败，可刷新 X 后重试或手动填写人设', 0);
          clearInterval(checkInterval);
        }
      }
    }, 1000);
  });
}

// ==========================================
// Tweet Scraping Logic
// ==========================================
function getTweetAuthor(tweetNode) {
  const nameDiv = tweetNode.querySelector('div[data-testid="User-Name"]');
  if (nameDiv) {
    const atText = nameDiv.innerText.match(/@(\w{1,15})/);
    if (atText) return atText[1];
  }
  return '未知用户';
}

function getTweetText(tweetNode) {
  const textDiv = tweetNode.querySelector('div[data-testid="tweetText"]');
  if (textDiv) return textDiv.innerText.trim();
  return getTweetCardText(tweetNode) || getTweetFallbackContentText(tweetNode);
}

function isLikelyNonContentCardLine(line = '') {
  const text = String(line || '').trim();
  if (!text) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(text)) return true;
  if (/^(read more|show more|查看更多|显示更多|阅读更多|from .+)$/i.test(text)) return true;
  if (/^@[A-Za-z0-9_]{1,15}$/.test(text)) return true;
  if (/^(\d+([.,]\d+)?[KkMm万]?)$/.test(text)) return true;
  if (/^(views?|likes?|reposts?|replies|查看|浏览|点赞|转发|回复|收藏)$/i.test(text)) return true;
  return false;
}

function getTweetCardText(tweetNode) {
  const card = tweetNode.querySelector('[data-testid="card.wrapper"]')
    || tweetNode.querySelector('a[href*="/i/article/"]')?.closest('[role="link"]')
    || tweetNode.querySelector('a[href*="/articles/"]')?.closest('[role="link"]')
    || tweetNode.querySelector('a[href*="/i/article/"]')?.closest('div')
    || tweetNode.querySelector('a[href*="/articles/"]')?.closest('div');
  if (!card) return '';
  const lines = String(card.innerText || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => !isLikelyNonContentCardLine(line));
  const uniqueLines = [];
  lines.forEach((line) => {
    if (!uniqueLines.includes(line)) uniqueLines.push(line);
  });
  return uniqueLines.slice(0, 3).join('\n').trim();
}

function getTweetArticleHref(tweetNode) {
  return tweetNode?.querySelector?.('a[href*="/i/article/"], a[href*="/articles/"], a[href*="/i/web/status/"]')?.getAttribute('href') || '';
}

function hasArticleCard(tweetNode) {
  return Boolean(getTweetArticleHref(tweetNode));
}

function getTweetFallbackContentText(tweetNode) {
  if (!tweetNode?.cloneNode) return '';
  const clone = tweetNode.cloneNode(true);
  [
    'div[data-testid="User-Name"]',
    '[data-testid="socialContext"]',
    'div[role="group"]',
    'time',
    'svg',
    'img',
    'button',
    '[aria-label]',
    '[data-testid="caret"]',
    '[data-testid="reply"]',
    '[data-testid="retweet"]',
    '[data-testid="like"]',
    '[data-testid="bookmark"]'
  ].forEach((selector) => {
    clone.querySelectorAll(selector).forEach(node => node.remove());
  });
  const author = getTweetAuthor(tweetNode).toLowerCase();
  const lines = String(clone.innerText || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => !isLikelyNonContentCardLine(line))
    .filter(line => line.toLowerCase() !== author)
    .filter(line => line.length >= 8 || /[\u3400-\u9fff]/.test(line));
  const uniqueLines = [];
  lines.forEach((line) => {
    if (!uniqueLines.includes(line)) uniqueLines.push(line);
  });
  return uniqueLines.slice(0, 4).join('\n').trim();
}

function getArticleIdFromHref(href = '') {
  const match = String(href || '').match(/\/(?:(?:i\/)?article(?:s)?|i\/web\/status)\/(\d+)/i);
  if (match?.[1]) return `article-${match[1]}`;
  return '';
}

/**
 * Detect if a tweet has been translated by X's built-in translation feature.
 * When X translates a tweet, it shows an indicator like "翻译自 英语" or "Translated from English"
 * near the tweet text. This function extracts the original language name from that indicator.
 * @param {Element} tweetNode - The tweet article element
 * @returns {string} The original language name (e.g. "English", "英语", "Japanese") or empty string if not translated
 */
function detectOriginalLanguage(tweetNode) {
  if (!tweetNode) return '';
  // X renders the translation indicator as a clickable element near the tweet text,
  // containing text like "翻译自 英语" (Chinese UI) or "Translated from English" (English UI).
  // We search all text nodes within the tweet for these patterns.
  const innerText = tweetNode.innerText || '';

  // Chinese UI: "翻译自 英语", "翻译自 日语", "翻译自 法语" etc.
  const zhMatch = innerText.match(/翻译自\s+(\S+)/);
  if (zhMatch) return zhMatch[1];

  // English UI: "Translated from English", "Translated from Japanese" etc.
  const enMatch = innerText.match(/Translated from\s+(\w+)/i);
  if (enMatch) return enMatch[1];

  return '';
}

function getTweetCreatedAt(tweetNode) {
  const datetime = tweetNode.querySelector('time')?.getAttribute('datetime') || '';
  const ts = Date.parse(datetime);
  return Number.isFinite(ts) ? ts : 0;
}

function getTweetAgeMinutes(tweetNode) {
  const createdAt = getTweetCreatedAt(tweetNode);
  if (!createdAt) return null;
  return Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
}

function getOwnHandle() {
  return (getProfilePathFromNav() || getCurrentProfilePath()).replace('/', '').toLowerCase();
}

function isPromotedTweet(tweetNode) {
  return /Promoted|Ad\b|广告|推广/.test(tweetNode?.innerText || '');
}

function isRepostedTweet(tweetNode) {
  const socialContext = tweetNode?.querySelector?.('[data-testid="socialContext"]')?.innerText || '';
  return /reposted|retweeted|转帖|转发|转推/i.test(socialContext);
}

function isNestedReplyTweet(tweetNode) {
  return /Replying to|回复给|正在回复/.test(tweetNode?.innerText || '');
}


function getTweetAuthorLabel(tweetNode) {
  return tweetNode.querySelector('div[data-testid="User-Name"]')?.innerText || '';
}

function isLikelyProjectAccount(tweetNode, author = '') {
  const handle = String(author || '').toLowerCase();
  if (PROJECT_ACCOUNT_HANDLES.has(handle)) return true;

  const label = getTweetAuthorLabel(tweetNode).toLowerCase();
  const companySignals = [
    /\b(official|hq|labs|studio|team|protocol|network|foundation|inc\.?|corp\.?|company)\b/,
    /官方|项目方|基金会|实验室|协议|网络/
  ];
  return companySignals.some(pattern => pattern.test(label));
}


function getTweetMetrics(tweetNode) {
  const ariaText = Array.from(tweetNode.querySelectorAll('[aria-label]'))
    .map(node => node.getAttribute('aria-label') || '')
    .filter(Boolean)
    .join('\n');
  const combined = `${ariaText}\n${tweetNode.innerText || ''}`;
  return {
    views: extractMetricFromText(combined, 'views?|次查看|查看|浏览|观看'),
    likes: extractMetricFromText(combined, 'likes?|喜欢|赞'),
    reposts: extractMetricFromText(combined, 'reposts?|retweets?|转帖|转发'),
    replies: extractMetricFromText(combined, 'replies|reply|回复|评论')
  };
}

function normalizePostTextForMatch(text = '') {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findTweetArticleForPerformance({ statusId = '', postText = '', author = '' } = {}) {
  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  if (statusId) {
    const byStatus = articles.find(article => getTweetStatusMeta(article).id === String(statusId));
    if (byStatus) return byStatus;
  }

  const targetText = normalizePostTextForMatch(postText);
  const targetAuthor = String(author || '').replace(/^@/, '').toLowerCase();
  if (!targetText) return articles[0] || null;

  return articles.find((article) => {
    const articleText = normalizePostTextForMatch(getTweetText(article));
    if (!articleText) return false;
    const authorMatches = !targetAuthor || getTweetAuthor(article).toLowerCase() === targetAuthor || targetAuthor === 'auto agent';
    return authorMatches && (
      articleText === targetText
      || articleText.includes(targetText.slice(0, 120))
      || targetText.includes(articleText.slice(0, 120))
    );
  }) || null;
}

function readTweetPerformanceSnapshot(target = {}) {
  const article = findTweetArticleForPerformance(target);
  if (!article) {
    return { success: false, error: 'post article not found' };
  }
  const metrics = getTweetMetrics(article);
  const status = getTweetStatusMeta(article);
  const text = getTweetText(article);
  const author = getTweetAuthor(article);
  if (!metricKnown(metrics.views)) {
    return {
      success: false,
      error: 'views not visible yet',
      metrics,
      statusId: status.id,
      postUrl: status.href ? `https://x.com${status.href}` : ''
    };
  }
  return {
    success: true,
    metrics,
    statusId: status.id,
    postUrl: status.href ? `https://x.com${status.href}` : '',
    text,
    author
  };
}

      const baselineScanCache = new Map();

function getBaselineEngagementScore(post = {}) {
  const metrics = post.performanceMetrics || {};
  return (
    (Number(metrics.views) || 0)
    + (Number(metrics.likes) || 0) * 80
    + (Number(metrics.reposts) || 0) * 180
    + (Number(metrics.replies) || 0) * 120
  );
}

function scanProfilePerformanceBaseline(limit = 30) {
  const ownHandle = getOwnHandle();
  const profileSnapshot = extractProfileSnapshot();
  Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
    .forEach((article) => {
      if (isPromotedTweet(article) || isRepostedTweet(article)) return;
      const metrics = getTweetMetrics(article);
      const views = Number(metrics.views) || 0;
      const isArticle = hasArticleCard(article);
      const author = getTweetAuthor(article);
      if (ownHandle && author && author.toLowerCase() !== ownHandle) return;
      const status = getTweetStatusMeta(article);
      const text = getTweetText(article);
      if (!text) return;
      const hasStableStatusId = /^\d+$/.test(String(status.id || ''));
      if (!views && !isArticle && !hasStableStatusId) return;
      const id = status.id || `${author}:${normalizePostTextForMatch(text).slice(0, 140)}`;
      const createdAt = getTweetCreatedAt(article) || (Date.now() - 49 * 60 * 60 * 1000);
      baselineScanCache.set(id, {
        id,
        text,
        author,
        postUrl: status.href ? `https://x.com${status.href}` : '',
        statusId: status.id || id,
        actualViews: views,
        performanceMetrics: metrics,
        contentMode: isNestedReplyTweet(article) ? 'reply' : 'post',
        isRepost: false,
        engagementScore: getBaselineEngagementScore({ performanceMetrics: metrics }),
        reviewedAt: Date.now(),
        createdAt,
        publishedAt: createdAt,
        scannedAt: Date.now()
      });
    });

  const maxItems = Math.max(1, Math.min(Number(limit) || 60, 80));
  const posts = Array.from(baselineScanCache.values())
    .sort((a, b) => {
      const scoreDiff = getBaselineEngagementScore(b) - getBaselineEngagementScore(a);
      if (scoreDiff) return scoreDiff;
      return Number(b.actualViews || 0) - Number(a.actualViews || 0);
    })
    .slice(0, maxItems);

  return {
    success: posts.length > 0 || Boolean(profileSnapshot.hasIdentity),
    posts,
    profile: profileSnapshot.profile,
    handle: ownHandle || profileSnapshot.profile?.username || '',
    count: posts.length,
    sampledCount: baselineScanCache.size
  };
}


function getLowEngagementReason(tweetNode, state = {}) {
  const metrics = getTweetMetrics(tweetNode);
  const knownCount = ['views', 'likes', 'reposts', 'replies'].filter(key => metricKnown(metrics[key])).length;
  if (!isSearchPage() && !state.currentDiscoveryQuery) return '';
  if (knownCount === 0) return '';

  const thresholds = getSearchThresholds(state);
  if (hasStrongEngagement(metrics, thresholds)) return '';
  return `搜索结果互动量过低（${summarizeMetrics(metrics)}）`;
}


function getReplyOpportunity(article, author, text, state = {}) {
  const targetHandles = collectTargetHandles(state);
  const authorHandle = String(author || '').toLowerCase();
  const isTargetAuthor = targetHandles.includes(authorHandle);
  const topicRelevant = hasRelevantTopic(text, state);
  const ageMinutes = getTweetAgeMinutes(article);
  const freshness = scoreFreshness(ageMinutes);
  const ownHandle = getOwnHandle();
  const projectAccount = isLikelyProjectAccount(article, author);
  const metrics = getTweetMetrics(article);
  const thresholds = getSearchThresholds(state);

  let score = 0;
  const reasons = [];

  if (ownHandle && authorHandle === ownHandle) {
    return { score: -999, reasons: ['自己的推文'], ageMinutes, isTargetAuthor, topicRelevant };
  }
  if (isPromotedTweet(article)) {
    return { score: -999, reasons: ['广告/推广内容'], ageMinutes, isTargetAuthor, topicRelevant };
  }
  if (projectAccount) {
    score -= 70;
    reasons.push('疑似项目方/官方号');
  }
  if (isNestedReplyTweet(article) && !isTargetAuthor) {
    score -= 12;
    reasons.push('非目标账号的二级回复');
  }

  if (isTargetAuthor) {
    score += 36;
    reasons.push('优先互动账号');
  } else if (targetHandles.length > 0) {
    score -= 8;
    reasons.push('非目标账号');
  }

  if (topicRelevant) {
    score += 22;
    reasons.push('主题相关');
  }

  score += freshness.score;
  reasons.push(freshness.label);

  if (hasStrongEngagement(metrics, thresholds)) {
    score += 36;
    reasons.push(`高互动(${summarizeMetrics(metrics)})`);
    
    // 超高互动额外加分 (热门爆款)
    if ((metricKnown(metrics.views) && metrics.views >= thresholds.minViews * 5) || 
        (metricKnown(metrics.likes) && metrics.likes >= thresholds.minFaves * 5)) {
      score += 24;
      reasons.push('极度热门爆款');
    }
  } else if (isSearchPage() && ['views', 'likes', 'reposts', 'replies'].some(key => metricKnown(metrics[key]))) {
    score -= 24;
    reasons.push(`互动不足(${summarizeMetrics(metrics)})`);
  }

  // 取消对推文长度的严格限制，因为短小精悍的爆款同样值得回复
  const visualChars = Array.from(text).length;
  if (visualChars > 1000) {
    score -= 8;
    reasons.push('原推过长');
  }

  if (hasStandaloneReplyPotential(text)) {
    score += 18;
    reasons.push('适合补充观点');
  }

  if (/[?？]|\bhow\b|\bwhy\b|如何|怎么|为什么/.test(text)) {
    score += 8;
    reasons.push('可回答问题');
  }

  if (/launch|released|introducing|发布|上线|刚做了|复盘|case study|案例|数据|增长|转化|用户/.test(text.toLowerCase())) {
    score += 8;
    reasons.push('适合补充经验/判断');
  }

  return {
    score,
    reasons,
    ageMinutes,
    isTargetAuthor,
    topicRelevant
  };
}

function getReplySkipReason(author, text, state = {}) {
  if (isSensitiveReplyTarget(text)) return '涉及政治/战争等敏感话题';
  
  const authorHandle = String(author || '').toLowerCase();
  const recentAuthors = state.recentRepliedAuthors || {};
  if (recentAuthors[authorHandle]) {
    const hoursSinceLastReply = (Date.now() - recentAuthors[authorHandle]) / (60 * 60 * 1000);
    if (hoursSinceLastReply < 24) {
      return `24小时内已互动过该账号`;
    }
  }

  const targetHandles = collectTargetHandles(state);
  const isTargetAuthor = targetHandles.includes(authorHandle);
  if (targetHandles.length > 0 && !isTargetAuthor && !hasRelevantTopic(text, state)) {
    return '非优先互动账号，且主题与账号策略不相关';
  }
  if (targetHandles.length === 0 && !hasRelevantTopic(text, state)) {
    return '主题与账号策略不相关';
  }
  return '';
}

function stableHash(text) {
  let hash = 0;
  const input = String(text || '');
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getStatusIdFromHref(href = '') {
  const match = String(href || '').match(/\/status\/(\d+)/);
  return match?.[1] || '';
}

function getTweetStatusMeta(tweetNode) {
  const links = Array.from(tweetNode.querySelectorAll('a[href*="/status/"]'));
  const link = links.find(item => item.querySelector('time'))
    || links.find(item => getStatusIdFromHref(item.getAttribute('href') || ''));
  const href = link?.getAttribute('href') || getTweetArticleHref(tweetNode) || '';
  return {
    href,
    id: getStatusIdFromHref(href) || getArticleIdFromHref(href)
  };
}

function getTweetStatusHref(tweetNode) {
  return getTweetStatusMeta(tweetNode).href;
}

function getTweetBotId(tweetNode, author, text) {
  if (tweetNode.dataset.botId) return tweetNode.dataset.botId;
  const status = getTweetStatusMeta(tweetNode);
  const seed = status.id || status.href || `${author}:${text.slice(0, 160)}`;
  const id = `xbot-${stableHash(seed)}`;
  tweetNode.dataset.botId = id;
  return id;
}

function getAutomationMode(state = {}) {
  return state.onboardingStrategy?.automationMode || 'autoEngage';
}

function shouldGenerateReplySuggestion(mode) {
  return mode === 'autoReply' || mode === 'autoEngage';
}

function shouldSendReply(mode) {
  return mode === 'autoReply' || mode === 'autoEngage';
}

function shouldUseKeywordDiscovery(mode) {
  return mode === 'autoEngage';
}

function isAutomationJustStarted(state = {}, graceMs = STARTUP_DISCOVERY_GRACE_MS) {
  const startedAt = Number(state.automationStartTime) || 0;
  return Boolean(startedAt && Date.now() - startedAt < graceMs);
}

let processedTweetIds = new Set();
let isReplying = false;
let twitterCooldownUntil = 0;
let apiCooldownUntil = 0;

function rememberProcessedTweet(tweetId) {
  processedTweetIds.add(tweetId);
  incrementProcessedTweets();
  if (processedTweetIds.size > 500) {
    const oldest = processedTweetIds.values().next().value;
    processedTweetIds.delete(oldest);
  }
}

function scrapeTweets() {
  if (!chrome.runtime?.id) return;
  if (isReplying) return;

  chrome.storage.local.get([
    'isRunning', 'isAutoPaused', 'aiPersona', 'agentMemory', 'competitorReport',
    'twitterCooldownUntil', 'apiCooldownUntil', 'onboardingStrategy', 'targetUsers',
    'pendingReply', 'pendingPost', 'isPosting', 'lastDiscoverySearchAt', 'discoverySearchIndex',
    'currentDiscoveryQuery', 'lastSurfaceNavigationAt',
    'automationStartTime', 'sessionReplyCount', 'sessionPostCount', 'recentRepliedAuthors',
    'isGeneratingReply', 'isReplyTyping', 'isTyping', 'replyFlowLockUntil'
  ], (result) => {
    if (!result.isRunning) return;
    if (hasActiveReplyFlow(result)) return;
    if (hasActivePostFlow(result)) return;
    if (maybeEscapeDeadEndSearch(result)) return;
    if (Date.now() < twitterCooldownUntil) return;
    if (Date.now() < apiCooldownUntil) return;
    if (result.isAutoPaused) {
      // Auto-heal: if isRunning is true but isAutoPaused is stale, clear it
      addLog('info', '检测到残留暂停标记，正在自动恢复...');
      chrome.storage.local.set({ isAutoPaused: false });
      return;
    }
    const automationMode = getAutomationMode(result);
    if (!shouldSendReply(automationMode)) return;
    
    if (result.twitterCooldownUntil && Date.now() < result.twitterCooldownUntil) return;
    if (result.apiCooldownUntil && Date.now() < result.apiCooldownUntil) return;
    
    // Legacy persona check removed since we now use reply strategy & custom prompts
    if (maybeNavigateToHomeSurface(result, automationMode === 'autoReply'
      ? 'AutoReply 模式不使用关键词搜索，返回推荐页'
      : '当前页面不是推荐/搜索流')) return;
    
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    if (articles.length === 0) {
      if (!shouldUseKeywordDiscovery(automationMode)) return;
      maybeNavigateToDiscoverySearch(result, '当前页面没有可读推文', {
        force: isSearchPage()  // Empty search = rotate immediately
      });
      return;
    }

    const candidates = [];
    let lowEngagementSkips = 0;
    for (const article of articles) {
      const author = getTweetAuthor(article);
      const text = getTweetText(article);
      const tweetStatus = getTweetStatusMeta(article);
      
      if (!text || text.length < 10) continue;
      const tweetId = getTweetBotId(article, author, text);
      if (processedTweetIds.has(tweetId)) continue;

      if (isLowValueReplyTarget(text)) {
        rememberProcessedTweet(tweetId);
        addLog('info', `跳过低价值互动目标 @${author}: ${text.substring(0, 50)}...`);
        continue;
      }
      if (isSearchPage() && isNestedReplyTweet(article)) {
        rememberProcessedTweet(tweetId);
        addLog('info', `跳过 @${author}: 搜索结果中的二级回复不适合截流`);
        continue;
      }
      const lowEngagementReason = getLowEngagementReason(article, result);
      if (lowEngagementReason) {
        lowEngagementSkips++;
        rememberProcessedTweet(tweetId);
        addLog('info', `跳过 @${author}: ${lowEngagementReason}`);
        continue;
      }
      const skipReason = getReplySkipReason(author, text, result);
      if (skipReason) {
        rememberProcessedTweet(tweetId);
        addLog('info', `跳过 @${author}: ${skipReason}。${text.substring(0, 50)}...`);
        continue;
      }
      if (shouldSendReply(automationMode) && !tweetStatus.id) {
        rememberProcessedTweet(tweetId);
        addLog('warn', `跳过 @${author}: 未读取到推文 status id，无法走官方 intent 回复。${text.substring(0, 50)}...`);
        continue;
      }

      const opportunity = getReplyOpportunity(article, author, text, result);
      let effectiveMinScore = MIN_REPLY_OPPORTUNITY_SCORE;
      if (automationMode === 'autoReply' && (result.sessionReplyCount || 0) < 5) {
        // Burst mode: lower the bar slightly at the start of a session so it
        // doesn't stall with zero candidates. Kept well above a bare
        // "topicRelevant" match (+22 alone) so at least one more positive
        // signal (freshness, engagement, target author, etc.) is still
        // required — a single weak signal should not be enough to reply.
        effectiveMinScore = 24;
      }

      if (opportunity.score < effectiveMinScore) {
        rememberProcessedTweet(tweetId);
        addLog('info', `跳过 @${author}: 互动机会分 ${opportunity.score} 低于 ${effectiveMinScore}（${opportunity.reasons.join('、')}）`);
        continue;
      }

      candidates.push({ article, author, text, tweetStatus, tweetId, opportunity });
    }

    if (candidates.length === 0) {
      if (!shouldUseKeywordDiscovery(automationMode)) return;
      maybeNavigateToDiscoverySearch(result, '当前页面没有高质量高互动候选', {
        force: lowEngagementSkips >= 2
      });
      return;
    }

    candidates.sort((a, b) => b.opportunity.score - a.opportunity.score);
    const selected = candidates[0];
    rememberProcessedTweet(selected.tweetId);

    addLog('info', `选择互动 @${selected.author}: 机会分 ${selected.opportunity.score}（${selected.opportunity.reasons.join('、')}）`);

    isReplying = true;
    stopAutoScroll();
    startReplyFlowLocalLock();
    applyReplyFlowEvent(ReplyFlowEvents.START_GENERATION, {
      candidate: {
        tweetAuthor: selected.author,
        tweetContent: selected.text,
        tweetStatusId: selected.tweetStatus.id,
        tweetStatusHref: selected.tweetStatus.href,
        startedAt: Date.now()
      }
    });

    const detectedOrigLang = detectOriginalLanguage(selected.article);
    if (detectedOrigLang) {
      addLog('info', `检测到 X 翻译：原始语言为 ${detectedOrigLang}`);
    }

    safeRuntimeSendMessage({
      action: 'generateReply',
      tweetText: selected.text,
      tweetContent: selected.text,
      tweetAuthor: selected.author,
      tweetElementId: selected.tweetId,
      tweetStatusHref: selected.tweetStatus.href,
      tweetStatusId: selected.tweetStatus.id,
      replyOpportunity: selected.opportunity,
      originalLanguage: detectedOrigLang
    }, (response) => {
      if (chrome.runtime.lastError) {
        isReplying = false;
        clearReplyFlowLocalLock();
        applyReplyFlowEvent(ReplyFlowEvents.GENERATION_FAILED, { reason: chrome.runtime.lastError.message });
        addLog('error', '生成回复失败: ' + chrome.runtime.lastError.message);
        return;
      }
      if (response && response.error) {
        isReplying = false;
        clearReplyFlowLocalLock();
        applyReplyFlowEvent(ReplyFlowEvents.GENERATION_FAILED, { reason: response.error });
        addLog('error', 'AI 生成回复失败: ' + response.error);
        if (response.isApiCooldown) {
          apiCooldownUntil = Date.now() + 60000;
          chrome.storage.local.set({ apiCooldownUntil });
        }
        return;
      }
      const replyText = response ? (response.replyText || response.reply) : '';
      if (!replyText) {
        isReplying = false;
        clearReplyFlowLocalLock();
        applyReplyFlowEvent(ReplyFlowEvents.GENERATION_FAILED, { reason: 'empty_reply_text' });
        return;
      }
      const willSend = shouldSendReply(automationMode);

      let dynamicCooldownMs = REPLY_COOLDOWN_MS;
      if (willSend) {
        dynamicCooldownMs = REPLY_ATTEMPT_LOCK_MS; // wait for automator to finish
      } else {
        let minMins = 12;
        let maxMins = 20;
        if (automationMode === 'autoEngage') {
          minMins = 20;
          maxMins = 30;
        }
        const randomMins = Math.floor(Math.random() * (maxMins - minMins + 1)) + minMins;
        dynamicCooldownMs = randomMins * 60000;
      }

      twitterCooldownUntil = Date.now() + dynamicCooldownMs;
      const replyEvent = willSend
        ? ReplyFlowEvents.GENERATION_READY_TO_SEND
        : ReplyFlowEvents.GENERATION_SHADOW_DONE;
      applyReplyFlowEvent(replyEvent, {}, {
        twitterCooldownUntil,
        lastReplySuggestion: {
          tweetAuthor: selected.author,
          tweetContent: selected.text,
          replyText,
          mode: automationMode,
          opportunityScore: selected.opportunity.score,
          opportunityReasons: selected.opportunity.reasons,
          time: Date.now()
        }
      }, () => {
        addLog('success', willSend
          ? `已生成回复 @${selected.author}: ${replyText.substring(0, 40)}...`
          : `影子回复建议 @${selected.author}: ${replyText.substring(0, 40)}...`);

        if (!willSend) {
          isReplying = false;
          clearReplyFlowLocalLock();
          return;
        }

        setTimeout(() => {
          isReplying = false;
        }, 1000);
        // Dispatch event for automator only after the cross-page lock is visible.
        window.dispatchEvent(new CustomEvent('xAutoBot_ReadyToReply', {
          detail: {
            tweetElementId: selected.tweetId,
            replyText,
            tweetAuthor: selected.author,
            tweetContent: selected.text,
            tweetStatusHref: selected.tweetStatus.href,
            tweetStatusId: selected.tweetStatus.id,
            engineLanguage: response.engineLanguage || detectedOrigLang || 'unknown',
            automationMode
          }
        }));
      });
    });
  });
}

// ==========================================
// Runtime state used by page automation
// ==========================================
let botState = {};
let currentRewriteTweet = null;

refreshBotStateFromStorage();

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    Object.keys(changes).forEach(key => {
      botState[key] = changes[key].newValue;
    });
    if (changes.isAutoPaused && changes.isAutoPaused.newValue) {
      stopAutoScroll();
      addLog('info', '自动操作已暂停，停止自动滚动');
    }
    if (
      (changes.replyFlowLockUntil || changes.isGeneratingReply || changes.isReplyTyping || changes.isTyping || changes.pendingReply || changes.pendingPost || changes.isPosting)
      && botState.isRunning
      && !botState.isAutoPaused
      && !hasActiveReplyFlow(botState)
      && !hasActivePostFlow(botState)
    ) {
      startAutoScroll();
    }
    if (changes.engineLanguage) {
      document.querySelectorAll('.x-bot-collect-btn-wrapper').forEach(node => node.remove());
      injectCollectButtons();
    }
  }
});

function refreshBotStateFromStorage() {
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(null, (res) => {
    botState = res || {};
  });
}

function removeLegacyWidgetDom() {
  document.getElementById('x-auto-bot-widget')?.remove();
  document.getElementById('x-auto-bot-chat-console')?.remove();
}

removeLegacyWidgetDom();

// 获取当前视野最中心的推文
function getCenterVisibleTweet() {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  if (articles.length === 0) return null;

  let closestArticle = null;
  let minDistance = Infinity;
  const centerY = window.innerHeight / 2;

  for (const article of articles) {
    const rect = article.getBoundingClientRect();
    const articleCenterY = rect.top + rect.height / 2;
    const distance = Math.abs(articleCenterY - centerY);
    if (distance < minDistance) {
      minDistance = distance;
      closestArticle = article;
    }
  }

  if (closestArticle) {
    const status = getTweetStatusMeta(closestArticle);
    const author = getTweetAuthor(closestArticle) || "未知用户";
    const text = getTweetText(closestArticle) || "";
    const id = (status && status.id) ? status.id : String(text).substring(0, 30).trim();
    return { id, author, text };
  }
  return null;
}

function injectStyles() {
  if (document.getElementById("x-bot-injected-styles")) return;
  const style = document.createElement("style");
  style.id = "x-bot-injected-styles";
  style.textContent = `
    .x-bot-collect-btn-wrapper {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-left: 12px;
      z-index: 999999;
      flex-shrink: 0;
    }
    .x-bot-collect-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 12px;
      height: 28px;
      border-radius: 999px;
      border: 1px solid rgba(29, 155, 240, 0.3);
      background: rgba(29, 155, 240, 0.05);
      color: #1d9bf0;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
      white-space: nowrap;
    }
    .x-bot-collect-btn:hover {
      background: #1d9bf0;
      color: #ffffff;
      box-shadow: 0 4px 10px rgba(29, 155, 240, 0.3);
      transform: translateY(-1px);
    }
    .x-bot-collect-btn svg {
      width: 17px;
      height: 17px;
    }
    #x-bot-toast-container {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 1000000;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
    }
    .x-bot-toast {
      min-width: 285px;
      max-width: min(420px, calc(100vw - 48px));
      padding: 14px 20px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: auto;
      transform: translateX(120%) scale(0.9);
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      word-break: break-word;
    }
    .x-bot-toast.show {
      transform: translateX(0) scale(1);
      opacity: 1;
    }
    .x-bot-toast.success { border-left: 4px solid #10b981; }
    .x-bot-toast.error { border-left: 4px solid #ef4444; }
    .x-bot-toast.info { border-left: 4px solid #3b82f6; }
    @media (max-width: 520px) {
      #x-bot-toast-container { left: 16px; right: 16px; top: 16px; }
      .x-bot-toast { min-width: 0; width: 100%; }
      .x-bot-collect-btn { padding: 0 9px; font-size: 11px; }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}
// Simple localization for content script
function tUI(msg) {
  const lang = normalizeUiLanguage(botState.engineLanguage || 'auto');
  
  const errorCodes = {
    'ERR_MISSING_API_KEY': {
      zh: '请先在系统设置面板中配置并保存您真实的 API Key！',
      en: 'Please configure and save your real API Key in Settings first!',
      ja: '先に設定画面で本物の API Key を設定して保存してください。',
      es: 'Configura y guarda tu API Key real en Ajustes primero.',
      id: 'Konfigurasikan dan simpan API Key asli di Pengaturan terlebih dahulu.'
    },
    'ERR_MOCK_KEY_NOT_ALLOWED': {
      zh: '请配置真实的 API Key，当前为本地预览占位符',
      en: 'Please configure a real API Key, current is a mock placeholder',
      ja: '本物の API Key を設定してください。現在はローカルプレビュー用です。',
      es: 'Configura una API Key real; la actual es un marcador local.',
      id: 'Konfigurasikan API Key asli; saat ini masih placeholder lokal.'
    }
  };

  let res = msg;
  for (const [code, trans] of Object.entries(errorCodes)) {
    if (res.includes(code)) {
      res = res.replace(code, trans[lang] || trans.en || trans.zh);
    }
  }

  if (lang === 'zh') return res;
  
  const dict = {
    '❌ 无法提取推文文字内容': { en: '❌ Failed to extract tweet text', ja: '❌ ツイート本文を取得できません', es: '❌ No se pudo extraer el texto', id: '❌ Gagal mengambil teks tweet' },
    '❌ 生成失败: ': { en: '❌ Generation failed: ', ja: '❌ 生成に失敗: ', es: '❌ Error al generar: ', id: '❌ Gagal membuat: ' },
    '❌ 收录失败：扩展后台未就绪': { en: '❌ Save failed: extension backend not ready', ja: '❌ 保存失敗: 拡張のバックグラウンドが未準備です', es: '❌ Error al guardar: backend no listo', id: '❌ Gagal menyimpan: backend belum siap' },
    'ℹ️ 该推文已被收录': { en: 'ℹ️ Tweet already saved', ja: 'ℹ️ このツイートは保存済みです', es: 'ℹ️ Tweet ya guardado', id: 'ℹ️ Tweet sudah disimpan' },
    '📥 成功收录至VibeX灵感库！': { en: '📥 Saved to VibeX Vault!', ja: '📥 VibeX Vault に保存しました', es: '📥 Guardado en VibeX Vault', id: '📥 Tersimpan ke VibeX Vault' },
    '❌ 收录失败: ': { en: '❌ Save failed: ', ja: '❌ 保存失敗: ', es: '❌ Error al guardar: ', id: '❌ Gagal menyimpan: ' },
    '✅ 内容已填入': { en: '✅ Content filled', ja: '✅ 内容を入力しました', es: '✅ Contenido insertado', id: '✅ Konten terisi' },
    '❌ 未找到输入框，请手动粘贴': { en: '❌ Input box not found, please paste manually', ja: '❌ 入力欄が見つかりません。手動で貼り付けてください', es: '❌ No se encontró el campo; pega manualmente', id: '❌ Kotak input tidak ditemukan, tempel manual' },
    '✅ 回复已自动填入！': { en: '✅ Reply auto-filled!', ja: '✅ 返信を自動入力しました', es: '✅ Respuesta insertada', id: '✅ Balasan otomatis terisi' },
    '❌ 未找到该推文的回复按钮': { en: '❌ Reply button not found', ja: '❌ 返信ボタンが見つかりません', es: '❌ No se encontró el botón de respuesta', id: '❌ Tombol balas tidak ditemukan' },
    '❌ 页面已刷新或推文不在视野内': { en: '❌ Page refreshed or tweet out of view', ja: '❌ ページ更新またはツイートが表示外です', es: '❌ Página actualizada o tweet fuera de vista', id: '❌ Halaman dimuat ulang atau tweet tidak terlihat' },
    '未知错误': { en: 'Unknown error', ja: '不明なエラー', es: 'Error desconocido', id: 'Kesalahan tidak diketahui' },
    '仿写': { en: 'Rewrite', ja: '書き換え', es: 'Reescribir', id: 'Tulis ulang' },
    '回复': { en: 'Reply', ja: '返信', es: 'Responder', id: 'Balas' },
    '一键仿写': { en: 'One-click Rewrite', ja: 'ワンクリック書き換え', es: 'Reescritura rápida', id: 'Tulis ulang sekali klik' },
    '智能回复': { en: 'Smart Reply', ja: 'スマート返信', es: 'Respuesta inteligente', id: 'Balasan pintar' },
    'AI 正在思考...': { en: 'AI is thinking...', ja: 'AI が考えています...', es: 'La IA está pensando...', id: 'AI sedang berpikir...' },
    '请先在系统设置面板中配置并保存 API Key！': { en: 'Please configure and save your API Key in Settings first!', ja: '先に設定で API Key を保存してください。', es: 'Configura y guarda tu API Key en Ajustes primero.', id: 'Konfigurasikan dan simpan API Key di Pengaturan terlebih dahulu.' }
  };

  for (const [zh, translations] of Object.entries(dict)) {
    if (res.includes(zh)) {
      res = res.replace(zh, translations[lang] || translations.en || zh);
    }
  }
  return res;
}

function showToast(message, type = 'success') {
  message = tUI(message);
  let container = document.getElementById('x-bot-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'x-bot-toast-container';
    (document.body || document.documentElement).appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `x-bot-toast ${type}`;
  
  let icon = '✨';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'info') icon = 'ℹ️';
  
  toast.innerHTML = `
    <span>${icon}</span>
    <div>${escapeHtml(message)}</div>
  `;
  
  container.appendChild(toast);
  
  toast.offsetHeight;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.remove(); }, 400);
  }, 3500);
}

function injectCollectButtons() {
  if (!chrome.runtime?.id) return;
  injectStyles();
  
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    articles.forEach(article => {
      if (article.closest('[role="dialog"]')) return;
      if (article.querySelector('.x-bot-collect-btn-wrapper')) return;
      
      const groups = article.querySelectorAll('div[role="group"]');
      const actionBar = groups.length > 0 ? groups[groups.length - 1] : null;

      const wrapper = document.createElement('div');
      wrapper.className = 'x-bot-collect-btn-wrapper';
    wrapper.innerHTML = `
      <button class="x-bot-collect-btn rewrite-btn" aria-label="${tUI('一键仿写')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        ${tUI('仿写')}
      </button>
      <button class="x-bot-collect-btn reply-btn" aria-label="${tUI('智能回复')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
        </svg>
        ${tUI('回复')}
      </button>
    `;
    
    const getTweetData = () => {
      const author = getTweetAuthor(article);
      const text = getTweetText(article);
      const statusMeta = getTweetStatusMeta(article);
      const url = statusMeta.href ? (statusMeta.href.startsWith('http') ? statusMeta.href : 'https://x.com' + statusMeta.href) : '';
      const time = getTweetCreatedAt(article) || Date.now();
      const id = statusMeta.id || 'collect-' + Date.now();
      const originalLanguage = detectOriginalLanguage(article);
      
      if (!text) {
        showToast('❌ 无法提取推文文字内容', 'error');
        return null;
      }
      return { id, author, text, url, time, originalLanguage };
    };

    const rewriteBtn = wrapper.querySelector('.rewrite-btn');
    rewriteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const tweetData = getTweetData();
      if (!tweetData) return;

      safeRuntimeSendMessage({
        action: 'autoRewrite',
        tweetData: tweetData
      });
    });

    const replyBtn = wrapper.querySelector('.reply-btn');
    replyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const tweetData = getTweetData();
      if (!tweetData) return;
      window.lastReplyTweetData = tweetData;

      const nativeReply = article.querySelector('[data-testid="reply"]');
      if (nativeReply) {
        nativeReply.click();
      }

      let editorFound = false;
      const showLoader = setInterval(() => {
        let editor = null;
          const dialog = document.querySelector('[role="dialog"]');
          if (dialog) {
            editor = dialog.querySelector('[contenteditable="true"]');
          } else {
            editor = document.querySelector('[data-testid="tweetTextarea_0"] [contenteditable="true"]');
            if (!editor) {
              const editors = document.querySelectorAll('[contenteditable="true"]');
              if (editors.length > 0) editor = editors[editors.length - 1];
            }
          }
        if (editor) {
          clearInterval(showLoader);
          editorFound = true;
          editor.focus();
          // Immediately show the premium stream bubble instead of the ugly toast
          if (!streamBubble) {
            streamBubble = document.createElement('div');
            streamBubble.style.cssText = 'position:fixed;bottom:120px;right:24px;width:320px;background:#0F0F0F;color:#fff;padding:16px;border-radius:16px;z-index:999999;box-shadow:0 12px 40px rgba(0,0,0,0.4);font-size:14px;line-height:1.6;max-height:400px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);white-space:pre-wrap;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
            const header = document.createElement('div');
            const iconSpan = document.createElement('span');
            iconSpan.style.color = '#00BA7C';
            iconSpan.style.marginRight = '8px';
            iconSpan.textContent = '✨';
            header.appendChild(iconSpan);
            header.appendChild(document.createTextNode(tUI('AI 正在思考...')));
            header.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px;font-weight:600;display:flex;align-items:center;';
            streamBubble.appendChild(header);
            const content = document.createElement('div');
            content.id = 'stream-bubble-content';
            streamBubble.appendChild(content);
            document.body.appendChild(streamBubble);
          }
        }
      }, 100);
      setTimeout(() => clearInterval(showLoader), 2000);

      safeRuntimeSendMessage({
        action: 'magicPrompt',
        promptType: 'draft_reply',
        contextData: tweetData
      }, (res) => {
        if (chrome.runtime.lastError || !res || res.error) {
          clearInterval(showLoader);
          if (streamBubble) {
            streamBubble.remove();
            streamBubble = null;
          }
          showToast('❌ 生成失败: ' + (chrome.runtime.lastError?.message || res?.error), 'error');
          return;
        }
        
        setTimeout(() => {
          let editor = null;
          const dialog = document.querySelector('[role="dialog"]');
          if (dialog) {
            editor = dialog.querySelector('[contenteditable="true"]');
          } else {
            editor = document.querySelector('[data-testid="tweetTextarea_0"] [contenteditable="true"]');
            if (!editor) {
              const editors = document.querySelectorAll('[contenteditable="true"]');
              if (editors.length > 0) editor = editors[editors.length - 1];
            }
          }
          if (editor) {
            editor.focus();
            insertIntoDraftJs(editor, res.result);
            // Show the regenerate button only when AI is used
            const regenBtns = document.querySelectorAll('.magic-regen-native-btn');
            regenBtns.forEach(b => b.style.display = 'inline-flex');
          }
        }, 300);
      });
    });
    
    if (actionBar) {
      actionBar.appendChild(wrapper);
    } else {
      if (window.getComputedStyle(article).position === 'static') {
        article.style.position = 'relative';
      }
      wrapper.style.position = 'absolute';
      wrapper.style.bottom = '12px';
      wrapper.style.right = '16px';
      article.appendChild(wrapper);
    }
  });
}

function handleCollectClick(article) {
  const author = getTweetAuthor(article);
  const text = getTweetText(article);
  const statusMeta = getTweetStatusMeta(article);
  const url = statusMeta.href ? (statusMeta.href.startsWith('http') ? statusMeta.href : 'https://x.com' + statusMeta.href) : '';
  const time = getTweetCreatedAt(article) || Date.now();
  const id = statusMeta.id || 'collect-' + Date.now();
  
  if (!text) {
    showToast('❌ 无法提取推文文字内容', 'error');
    return;
  }
  
  const tweet = { id, author, text, url, time };
  
  safeRuntimeSendMessage({ action: 'collectTweet', tweet }, (response) => {
    if (chrome.runtime.lastError) {
      showToast('❌ 收录失败：扩展后台未就绪', 'error');
      return;
    }
    if (response && response.success) {
      if (response.alreadyExists) {
        showToast('ℹ️ 该推文已被收录', 'info');
      } else {
        showToast('📥 成功收录至VibeX灵感库！', 'success');
      }
    } else {
      showToast('❌ 收录失败: ' + (response?.message || '未知错误'), 'error');
    }
  });
}

// Run scan once initially
setTimeout(injectCollectButtons, 500);


function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==========================================
// CONTEXT SYNC (The Xiaolongxia Standard)
// ==========================================
let lastContextId = null;

function syncContext() {
  if (!chrome.runtime) return;
  
  const path = window.location.pathname;
  if (isProfilePath(path)) {
    const author = path.replace('/', '').split('/')[0];
    if (lastContextId !== 'profile_' + author) {
      lastContextId = 'profile_' + author;
      const bioEl = document.querySelector('[data-testid="UserDescription"]');
      safeRuntimeSendMessage({
        action: 'updateContext',
        contextType: 'profile',
        data: { author: author, bio: bioEl ? bioEl.textContent : '' }
      });
    }
    return;
  }
  
  // Try to find center tweet
  const tweet = getCenterVisibleTweet();
  if (tweet) {
    if (lastContextId !== 'tweet_' + tweet.id) {
      lastContextId = 'tweet_' + tweet.id;
      safeRuntimeSendMessage({
        action: 'updateContext',
        contextType: 'tweet',
        data: tweet
      });
    }
  }
}

// Throttle scroll listener
let scrollTimeout = null;
window.addEventListener('scroll', () => {
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(syncContext, 500);
});

// Run once on load
setTimeout(syncContext, 2000);

chrome.runtime.onMessage.addListener((req) => {
  if (req.action === 'requestSync') {
    lastContextId = null; // force sync
    syncContext();
  }
});

// ==========================================
// CENTRAL PERFORMANCE OPTIMIZED LOOP
// ==========================================
let domUpdateTimer = null;
let lastScrapeTime = 0;
let lastStorageSyncTime = 0;

let lastUIInjectTime = 0;

const domObserver = new MutationObserver((mutations) => {
  if (domUpdateTimer) clearTimeout(domUpdateTimer);
  domUpdateTimer = setTimeout(() => {
    const now = Date.now();
    
    // UI injections (high priority, bound to DOM renders but throttled to avoid lag)
    if (now - lastUIInjectTime > 400) {
      injectCollectButtons();
      lastUIInjectTime = now;
    }
    
    // Scrape logic (throttled to ~5s)
    if (now - lastScrapeTime > 5000) {
      scrapeTweets();
      lastScrapeTime = now;
    }
    
    // Storage sync (throttled to ~3s)
    if (now - lastStorageSyncTime > 3000) {
      refreshBotStateFromStorage();
      lastStorageSyncTime = now;
    }
    
  }, 100);
});

if (document.body) {
  domObserver.observe(document.body, { childList: true, subtree: true, attributes: false });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    domObserver.observe(document.body, { childList: true, subtree: true, attributes: false });
  });
}

// Resilient heartbeat loop: Ensures critical loops run even if DOM is completely static (e.g. empty search pages)
setInterval(() => {
  const now = Date.now();
  
  // UI injections fallback
  if (now - lastUIInjectTime > 2000) {
    injectCollectButtons();
    lastUIInjectTime = now;
  }
  
  // Scrape logic fallback (crucial for rotating out of empty pages)
  if (now - lastScrapeTime > 6000) {
    scrapeTweets();
    lastScrapeTime = now;
  }
  
  // Storage sync fallback
  if (now - lastStorageSyncTime > 4000) {
    refreshBotStateFromStorage();
    lastStorageSyncTime = now;
  }
}, 2000);


// Native Compose Toolbar Observer for "Regenerate" button
const composeObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.addedNodes.length) {
      const toolbars = document.querySelectorAll('[data-testid="toolBar"]');
      toolbars.forEach(toolbar => {
        if (toolbar.querySelector('.magic-regen-native-btn')) return;
        
        // Ensure this is a reply toolbar
        const btn = toolbar.querySelector('[data-testid="tweetButtonInline"]');
        if (btn) {
          const regenBtn = document.createElement('div');
          regenBtn.className = 'magic-regen-native-btn';
          // Using inline-flex and vertical-align to sit nicely next to the Post button without breaking Twitter's layout
          regenBtn.style.cssText = 'margin-right: 12px; cursor: pointer; display: none; vertical-align: middle; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: #F3F4F6; color: #0F0F0F; transition: background 0.2s; border: 1px solid #E5E7EB;';
          regenBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 21v-5h5"></path></svg>`;
          regenBtn.title = "不喜欢？一键重新生成";
          
          regenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            let editor = null;
          const dialog = document.querySelector('[role="dialog"]');
          if (dialog) {
            editor = dialog.querySelector('[contenteditable="true"]');
          } else {
            editor = document.querySelector('[data-testid="tweetTextarea_0"] [contenteditable="true"]');
            if (!editor) {
              const editors = document.querySelectorAll('[contenteditable="true"]');
              if (editors.length > 0) editor = editors[editors.length - 1];
            }
          }
            if (editor) {
              editor.focus();
              if (!streamBubble) {
                streamBubble = document.createElement('div');
                streamBubble.style.cssText = 'position:fixed;bottom:120px;right:24px;width:320px;background:#0F0F0F;color:#fff;padding:16px;border-radius:16px;z-index:999999;box-shadow:0 12px 40px rgba(0,0,0,0.4);font-size:14px;line-height:1.6;max-height:400px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);white-space:pre-wrap;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
                const header = document.createElement('div');
                const iconSpan = document.createElement('span');
                iconSpan.style.color = '#00BA7C';
                iconSpan.style.marginRight = '8px';
                iconSpan.textContent = '✨';
                header.appendChild(iconSpan);
                header.appendChild(document.createTextNode('AI 正在重新思考...'));
                header.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px;font-weight:600;display:flex;align-items:center;';
                streamBubble.appendChild(header);
                const content = document.createElement('div');
                content.id = 'stream-bubble-content';
                streamBubble.appendChild(content);
                document.body.appendChild(streamBubble);
              }
            }

            // Since we might not have the original tweetData locally in scope,
            // we ask background to just re-run the last magicPrompt.
            safeRuntimeSendMessage({
              action: 'magicPrompt',
              promptType: 'draft_reply',
              contextData: window.lastReplyTweetData,
              isRegenerate: true
            }, (res) => {
              if (res && res.result) {
                let ed = null;
                const dlg = document.querySelector('[role="dialog"]');
                if (dlg) {
                  ed = dlg.querySelector('[contenteditable="true"]');
                } else {
                  ed = document.querySelector('[data-testid="tweetTextarea_0"] [contenteditable="true"]');
                  if (!ed) {
                    const eds = document.querySelectorAll('[contenteditable="true"]');
                    if (eds.length > 0) ed = eds[eds.length - 1];
                  }
                }
                if (ed) {
                  ed.focus();
                  insertIntoDraftJs(ed, res.result);
                }
              } else {
                 showToast('❌ 生成失败: ' + (res?.error || '未知错误'), 'error');
              }
            });
          });

          // Force the parent to display as a flex row so the button aligns horizontally instead of overlapping
          btn.parentNode.style.display = 'flex';
          btn.parentNode.style.flexDirection = 'row';
          btn.parentNode.style.alignItems = 'center';
          btn.parentNode.insertBefore(regenBtn, btn);
        }
      });
    }
  }
});
composeObserver.observe(document.body, { childList: true, subtree: true });


let streamBubble = null;
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'magicPromptStreamChunk') {
     if (!streamBubble) {
        streamBubble = document.createElement('div');
        streamBubble.style.cssText = 'position:fixed;bottom:120px;right:24px;width:320px;background:#0F0F0F;color:#fff;padding:16px;border-radius:16px;z-index:999999;box-shadow:0 12px 40px rgba(0,0,0,0.4);font-size:14px;line-height:1.6;max-height:400px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);white-space:pre-wrap;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        
        const header = document.createElement('div');
        const iconSpan = document.createElement('span');
        iconSpan.style.color = '#00BA7C';
        iconSpan.style.marginRight = '8px';
        iconSpan.textContent = '✨';
        header.appendChild(iconSpan);
        header.appendChild(document.createTextNode(tUI('AI 正在思考...')));
        header.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px;font-weight:600;display:flex;align-items:center;';
        streamBubble.appendChild(header);
        
        const content = document.createElement('div');
        content.id = 'stream-bubble-content';
        streamBubble.appendChild(content);
        
        document.body.appendChild(streamBubble);
     }
     const contentEl = streamBubble.querySelector('#stream-bubble-content');
     if (contentEl) {
       const lines = request.chunk.split('\n');
       lines.forEach((line, i) => {
         if (i > 0) contentEl.appendChild(document.createElement('br'));
         if (line) contentEl.appendChild(document.createTextNode(line));
       });
       streamBubble.scrollTop = streamBubble.scrollHeight;
     }
  } else if (request.action === 'magicPromptStreamEnd') {
     if (streamBubble) {
        streamBubble.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        streamBubble.style.opacity = '0';
        streamBubble.style.transform = 'translateY(10px)';
        const toRemove = streamBubble;
        setTimeout(() => toRemove.remove(), 400);
        streamBubble = null;
     }
  }
});

// RE-INJECTED MISSING FUNCTIONS
function maybeNavigateToHomeSurface(state = {}, reason = '当前页面不是发现流') {
  if (isDiscoverySurfacePage(state)) return false;
  const isDiscoveryNavigationUnsafe = (state) => { return false; }; // placeholder or use actual
  if (hasActiveReplyFlow(state)) {
    addLog('info', '正在处理上一条自动回复，暂不切回推荐页');
    return false;
  }
  if (hasActivePostFlow(state)) {
    addLog('info', '正在处理待发推文，暂不切回推荐页');
    return false;
  }
  if (hasVisibleUnfinishedTweetEditor()) {
    addLog('info', '检测到未完成编辑器，暂不离开当前页面');
    return false;
  }

  const now = Date.now();
  const lastSurfaceNavigationAt = Number(state.lastSurfaceNavigationAt) || 0;
  const shouldBypassSurfaceThrottle = getAutomationMode(state) === 'autoReply' && isSearchPage();
  if (!shouldBypassSurfaceThrottle && lastSurfaceNavigationAt && now - lastSurfaceNavigationAt < 300000) return false;

  chrome.storage.local.set({
    lastSurfaceNavigationAt: now,
    currentDiscoveryQuery: '',
    currentDiscoveryReason: reason,
    botNavigationTime: Date.now()
  });
  addLog('info', '当前不在推荐/搜索流，先进入推荐页：' + reason);
  window.location.assign('https://x.com/home');
  return true;
}

function isSearchPage() {
  return window.location.pathname === '/search';
}

function getCurrentSearchQuery() {
  try {
    return new URLSearchParams(window.location.search).get('q') || '';
  } catch (error) {
    return '';
  }
}

function isRelaxedDiscoveryQuery(query = '') {
  return /\bmin_faves:(?:[0-9]|10)\b/i.test(String(query || ''));
}

function relaxDiscoveryQuery(query = '') {
  const relaxedSince = typeof getRecentSinceDate === 'function'
    ? getRecentSinceDate(14)
    : '';
  let nextQuery = String(query || '').trim();
  if (!nextQuery) return '';
  nextQuery = /\bmin_faves:\d+\b/i.test(nextQuery)
    ? nextQuery.replace(/\bmin_faves:\d+\b/i, 'min_faves:10')
    : `${nextQuery} min_faves:10`;
  if (relaxedSince) {
    nextQuery = /\bsince:\d{4}-\d{2}-\d{2}\b/i.test(nextQuery)
      ? nextQuery.replace(/\bsince:\d{4}-\d{2}-\d{2}\b/i, `since:${relaxedSince}`)
      : `${nextQuery} since:${relaxedSince}`;
  }
  return nextQuery.replace(/\s+/g, ' ').trim();
}

function getSearchPageAgeMs(state = {}) {
  const navStart = performance?.timeOrigin || 0;
  const sinceNavigation = navStart ? Date.now() - navStart : 0;
  const botNavigationAge = state.botNavigationTime ? Date.now() - Number(state.botNavigationTime) : 0;
  return Math.max(sinceNavigation || 0, botNavigationAge || 0);
}

function isDeadEndSearchPage() {
  if (!isSearchPage()) return false;
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  const hasTweets = document.querySelectorAll('article[data-testid="tweet"]').length > 0;
  const emptySignals = [
    /没有找到.*结果/,
    /没有.*结果/,
    /无结果/,
    /尝试搜索其他内容/,
    /检查你的搜索设置/,
    /No results/i,
    /Search for something else/i,
    /Try searching for something else/i,
    /Check your Search settings/i
  ];
  return emptySignals.some(pattern => pattern.test(text)) && (!hasTweets || /尝试搜索其他内容|No results/i.test(text));
}

function maybeEscapeDeadEndSearch(state = {}) {
  if (!shouldUseKeywordDiscovery(getAutomationMode(state))) return false;
  if (!isDeadEndSearchPage()) return false;
  if (getSearchPageAgeMs(state) < SEARCH_EMPTY_ROTATE_MIN_AGE_MS) return false;
  return maybeNavigateToDiscoverySearch(state, '搜索页无结果，切换下一个关键词', {
    force: true,
    deadEnd: true,
    retryCurrentRelaxed: true
  });
}

function maybeNavigateToDiscoverySearch(state = {}, reason = '当前页面没有匹配候选', options = {}) {
  if (!shouldUseKeywordDiscovery(getAutomationMode(state))) {
    return false;
  }
  if (!options.deadEnd && !isSearchPage() && isAutomationJustStarted(state)) {
    return false;
  }
  if (hasActiveReplyFlow(state)) {
    addLog('info', '正在处理上一条自动回复，暂不切换关键词搜索页');
    return false;
  }
  if (hasActivePostFlow(state)) {
    addLog('info', '正在处理待发推文，暂不切换关键词搜索页');
    return false;
  }
  if (hasVisibleUnfinishedTweetEditor()) {
    addLog('info', '检测到未完成编辑器，暂不切换关键词搜索页');
    return false;
  }
  const queries = typeof buildDiscoverySearchQueries === 'function' ? buildDiscoverySearchQueries(state) : [];
  if (queries.length === 0) return false;
  const now = Date.now();
  const lastSearchAt = Number(state.lastDiscoverySearchAt) || 0;
  let minInterval = SEARCH_DISCOVERY_MIN_INTERVAL_MS;
  if (options.deadEnd) {
    minInterval = SEARCH_DISCOVERY_DEAD_END_ROTATE_MS;
  } else if (options.force) {
    minInterval = SEARCH_DISCOVERY_LOW_QUALITY_ROTATE_MS;
  } else if (isSearchPage()) {
    minInterval = SEARCH_DISCOVERY_ROTATE_INTERVAL_MS;
  } else if (window.location.pathname === '/home') {
    minInterval = 15000;
  }
  if (lastSearchAt && now - lastSearchAt < minInterval) return false;
  const currentQuery = getCurrentSearchQuery();
  let nextIndex = Number(state.discoverySearchIndex) || 0;
  let query = '';
  if (options.retryCurrentRelaxed && currentQuery && !isRelaxedDiscoveryQuery(currentQuery)) {
    query = relaxDiscoveryQuery(currentQuery);
  }
  if (isSearchPage() && currentQuery) {
    const currentIndex = queries.findIndex(q => q === currentQuery);
    if (currentIndex >= 0) nextIndex = currentIndex + 1;
  }
  if (!query) query = queries[nextIndex % queries.length];
  const url = 'https://x.com/search?q=' + encodeURIComponent(query) + '&src=typed_query&f=top';
  chrome.storage.local.set({
    lastDiscoverySearchAt: now,
    discoverySearchIndex: (nextIndex + 1) % queries.length,
    currentDiscoveryQuery: query,
    currentDiscoveryReason: reason,
    botNavigationTime: Date.now()
  });
  addLog('info', '切换到关键词热帖搜索：' + query);
  window.location.assign(url);
  return true;
}


})();
