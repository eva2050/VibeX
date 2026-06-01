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

console.log("X Auto Bot: Scraper loaded on X.com");

// Global cooldown to prevent hitting Gemini API rate limits (15 requests/min)
const REPLY_COOLDOWN_MS = 300000; // 5 minutes
const REPLY_ATTEMPT_LOCK_MS = 60000; // short lock while the automator tries to send
const MAX_LOGS = 50;
const MIN_REPLY_OPPORTUNITY_SCORE = 35;
const SEARCH_DISCOVERY_MIN_INTERVAL_MS = 90 * 1000;
const SEARCH_DISCOVERY_ROTATE_INTERVAL_MS = 2 * 60 * 1000;
const SEARCH_DISCOVERY_LOW_QUALITY_ROTATE_MS = 15 * 1000;
const SEARCH_DISCOVERY_LOOKBACK_DAYS = 14;
const SURFACE_NAVIGATION_MIN_INTERVAL_MS = 60 * 1000;
const DEFAULT_INTERACTION_TARGETS = {
  ai_product_kol: ['zarazhangrui', 'Leobai825', 'swyx', 'aakashg0', 'lennysan', 'kfk_ai', 'karpathy', 'sama'],
  monetization_global: ['Leobai825', 'levelsio', 'dvassallo', 'codie_sanchez', 'naval', 'gregisenberg'],
  indie_builder: ['levelsio', 'marckohlbrugge', 'patio11', 'robj3d3', 'dvassallo', 'gregisenberg'],
  research_growth: ['aakashg0', 'lennysan', 'shreyas', 'packyM', 'benthompson', 'stratechery'],
  brand_official: ['lennysan', 'shreyas', 'swyx', 'aakashg0', 'gregisenberg', 'patio11', 'levelsio']
};
const PROJECT_ACCOUNT_HANDLES = new Set([
  'openai', 'anthropicai', 'cursor_ai', 'vercel', 'linear', 'notionhq', 'github',
  'baseapp', 'stripe', 'figma', 'perplexity_ai', 'huggingface', 'producthunt'
]);
const DEFAULT_DISCOVERY_KEYWORDS = {
  ai_product_kol: ['AI工具', 'AI Agent', '提示词', 'AI自动化', 'Cursor', 'Claude', 'ChatGPT'],
  monetization_global: ['AI副业', 'AI出海', 'AI工具变现', '小产品变现', 'Cursor创业', 'SaaS出海', '独立开发者 AI'],
  indie_builder: ['独立开发者 AI', 'Build in Public', 'SaaS MRR', 'Cursor MVP', 'Product Hunt', '小产品上线'],
  research_growth: ['AI 投资', '产品增长', '市场趋势', '增长框架', '商业模式', '创始人洞察'],
  brand_official: ['AI产品', '产品发布', '用户案例', '产品更新', '工作流自动化', '效率工具']
};

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
    'compose', 'search', 'jobs', 'communities', 'premium', 'verified_orgs'
  ]);
  return /^[A-Za-z0-9_]{1,15}$/.test(firstSegment) && !blocked.has(firstSegment.toLowerCase());
}

function isDiscoverySurfacePage() {
  const pathname = window.location.pathname || '';
  return pathname === '/home' || pathname === '/explore' || pathname === '/search';
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
  chrome.storage.local.get(['isAutoPaused', 'pendingReply', 'pendingPost', 'lastSurfaceNavigationAt'], (result) => {
    if (result.isAutoPaused && !options.skipPauseCheck) {
      addLog('info', '自动操作已暂停，不启动自动滚动');
      return;
    }
    if (maybeNavigateToHomeSurface(result, '启动时停在个人主页或非发现页')) return;
    addLog('info', '启动自动滚动时间线');
    beginScrollCycle();
  });
}

function beginScrollCycle() {
  scrollCountInCycle = 0;
  const scrollsInThisCycle = 3 + Math.floor(Math.random() * 4); // 3~6 次
  addLog('info', `本轮计划滚动 ${scrollsInThisCycle} 次，然后休息`);

  function doOneScroll() {
    scrollCountInCycle++;
    const distance = 400 + Math.floor(Math.random() * 400); // 400~800 px，只向下
    window.scrollBy({ top: distance, behavior: 'smooth' });

    if (scrollCountInCycle >= scrollsInThisCycle) {
      // 本轮滚动结束，进入休息
      clearInterval(scrollInterval);
      scrollInterval = null;
      const restSec = 20 + Math.floor(Math.random() * 21); // 20~40 秒休息
      addLog('info', `滚动本轮结束，休息 ${restSec} 秒...`);
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
chrome.storage.local.get(['profileReadRequested', 'botNavigationTime', 'isRunning'], (result) => {
  const isBotNavigating = result.botNavigationTime && (Date.now() - result.botNavigationTime < 10000);
  
  if (isBotNavigating) {
    // Bot is navigating itself (e.g. rotating keywords), do not pause.
    if (result.isRunning) {
      startAutoScroll();
      ensureBioExtracted();
    }
  } else {
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
  chrome.runtime.sendMessage({ action: 'xLoginDetected' }, () => {});
}

const loginDetectInterval = setInterval(() => {
  notifyXLoginDetectedIfNeeded();
  if (xLoginDetectedNotified) clearInterval(loginDetectInterval);
}, 1500);
setTimeout(() => clearInterval(loginDetectInterval), 30000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'forceReadProfileBio') {
    ensureBioExtracted({ force: true });
    sendResponse({ success: true });
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
            chrome.runtime.sendMessage({ action: 'openProfileTab', url: `https://x.com${profilePath}` });
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
  const userLinks = tweetNode.querySelectorAll('a[href^="/"]');
  for (const link of userLinks) {
    const match = link.getAttribute('href').match(/^\/(\w{1,15})\/?$/);
    if (match) return match[1];
  }
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
  const altText = tweetNode.querySelector('[data-testid="tweet"] span');
  if (altText) return altText.innerText.trim();
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

function isNestedReplyTweet(tweetNode) {
  return /Replying to|回复给|正在回复/.test(tweetNode?.innerText || '');
}

function isLowValueReplyTarget(text = '') {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return true;

  const engagementBaitPatterns = [
    /\bjust say\b/,
    /\bsay ["']?hey["']?\b/,
    /\bneed .*impressions?\b/,
    /\bthank me later\b/,
    /\breply\b.*\b(i|me|this|below)\b/,
    /\bcomment\b.*\b(i|me|below|for)\b/,
    /\bdrop\b.*\b(reply|comment|handle|link)\b/,
    /\bfollow (me|for|back)\b/,
    /\blike (and|&)?\s*(rt|repost|share)\b/,
    /\b(rt|repost) (if|and|to)\b/,
    /\bwho wants\b/,
    /\btag someone\b/,
    /转发.*抽/,
    /评论.*领取/,
    /回复.*领取/,
    /求.*互/
  ];

  if (engagementBaitPatterns.some(pattern => pattern.test(normalized))) return true;

  const words = normalized.split(/\s+/).filter(Boolean);
  const hasUrlOnly = /https?:\/\/|pic\.x\.com|t\.co\//.test(normalized) && words.length < 10;
  const tooShort = normalized.length < 28 && words.length < 8;
  const mostlyEmojiOrPunctuation = normalized.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{P}\p{S}\s]/gu, '').length < 8;
  return hasUrlOnly || tooShort || mostlyEmojiOrPunctuation;
}

function parseTargetHandles(text = '') {
  return String(text || '')
    .split(/[\s,，、\n]+/)
    .map(item => item.trim().replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '').replace(/^@/, '').split('/')[0])
    .filter(item => /^[A-Za-z0-9_]{1,15}$/.test(item))
    .map(item => item.toLowerCase());
}

function inferStrategyArchetype(state = {}) {
  const strategy = state.onboardingStrategy || {};
  const memory = state.agentMemory || {};
  const persona = state.aiPersona || {};
  const signal = [
    strategy.strategyArchetype,
    strategy.sourceInput,
    persona.targetUsers,
    persona.characteristics,
    persona.goals,
    memory.contentPillars,
    memory.contentAngles,
    memory.marketPosition
  ].join('\n').toLowerCase();

  if (DEFAULT_INTERACTION_TARGETS[strategy.strategyArchetype]) return strategy.strategyArchetype;
  if (/leobai825|levelsio|出海|搞钱|副业|变现|monetization|income/.test(signal)) return 'monetization_global';
  if (/indie|独立开发|build in public|mrr|saas/.test(signal)) return 'indie_builder';
  if (/研究|投资|增长|research|vc|market|趋势/.test(signal)) return 'research_growth';
  if (/brand|official|品牌|官网|产品官方/.test(signal)) return 'brand_official';
  return 'ai_product_kol';
}

function getDefaultInteractionTargets(state = {}) {
  return DEFAULT_INTERACTION_TARGETS[inferStrategyArchetype(state)] || DEFAULT_INTERACTION_TARGETS.ai_product_kol;
}

function getDefaultDiscoveryKeywords(state = {}) {
  return DEFAULT_DISCOVERY_KEYWORDS[inferStrategyArchetype(state)] || DEFAULT_DISCOVERY_KEYWORDS.indie_builder;
}

function collectTargetHandles(state = {}) {
  const memory = state.agentMemory || {};
  return [...new Set([
    ...parseTargetHandles(state.targetUsers),
    ...parseTargetHandles(memory.interactionTargets),
    ...parseTargetHandles(getDefaultInteractionTargets(state).join('\n'))
  ])];
}

function parseDiscoveryKeywords(text = '') {
  return String(text || '')
    .split(/[\n,，、]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2 && item.length <= 80);
}

function collectDiscoveryKeywords(state = {}) {
  const memory = state.agentMemory || {};
  return [...new Set([
    ...parseDiscoveryKeywords(memory.discoveryKeywords),
    ...getDefaultDiscoveryKeywords(state)
  ])].slice(0, 12);
}

function getSearchLanguageOperator(state = {}) {
  const lang = state.onboardingStrategy?.preferredLanguage || 'zh-CN';
  if (lang === 'en') return 'lang:en';
  if (lang === 'ja') return 'lang:ja';
  if (lang === 'ko') return 'lang:ko';
  return 'lang:zh';
}

function detectKeywordLanguage(keyword = '') {
  const clean = keyword.replace(/["'\s]/g, '');
  const hasCJK = /[\u3400-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(clean);
  const hasLatin = /[a-zA-Z]{2,}/.test(clean);
  if (hasCJK && !hasLatin) return 'cjk';
  if (hasLatin && !hasCJK) return 'latin';
  return 'mixed';
}

function getLangFilterForKeyword(keyword, defaultLang) {
  const kwLang = detectKeywordLanguage(keyword);
  if (kwLang === 'latin') return 'lang:en';
  if (kwLang === 'cjk') return defaultLang;
  return '';  // mixed — don't filter by language
}

function getSearchThresholds(state = {}) {
  const lang = state.onboardingStrategy?.preferredLanguage || 'zh-CN';
  const isChinese = lang === 'zh-CN' || lang === 'zh-TW';
  return isChinese
    ? { minFaves: 20, minViews: 1000 }
    : { minFaves: 50, minViews: 5000 };
}

function getRecentSinceDate(days = SEARCH_DISCOVERY_LOOKBACK_DAYS) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function quoteSearchTerm(term = '') {
  const clean = String(term || '').trim().replace(/"/g, '');
  if (!clean) return '';
  if (isAdvancedSearchQuery(clean)) {
    return clean;
  }
  if (/[\u3400-\u9fff]/.test(clean)) {
    return clean;
  }
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

function isAdvancedSearchQuery(value = '') {
  return /\b(min_faves|min_retweets|from|lang|filter|since|until):|\bOR\b/i.test(String(value || ''));
}

function getNegativeSearchOperators(state = {}) {
  const memory = state.agentMemory || {};
  const signal = [
    state.onboardingStrategy?.strategyArchetype,
    state.onboardingStrategy?.sourceInput,
    memory.marketPosition,
    memory.contentPillars,
    memory.contentAngles,
    memory.coreOpinions
  ].join('\n').toLowerCase();
  if (/web3|crypto|defi|nft|blockchain|token|链上|加密|币圈/.test(signal)) return '';
  // Keep it minimal — too many negatives cause X to return zero results
  return '-airdrop -空投';
}

function buildDiscoverySearchQueries(state = {}) {
  const keywords = collectDiscoveryKeywords(state);
  const defaultLang = getSearchLanguageOperator(state);
  const { minFaves } = getSearchThresholds(state);
  const since = getRecentSinceDate();
  const negative = getNegativeSearchOperators(state);
  const baseFilters = `min_faves:${minFaves} -filter:replies since:${since} ${negative}`.trim();

  // Strategy 1: Individual keyword queries (most reliable on X)
  const topicQueries = keywords.map(keyword => {
    const term = quoteSearchTerm(keyword);
    if (!term) return '';
    if (isAdvancedSearchQuery(term)) {
      const langPart = /\blang:/i.test(term) ? '' : defaultLang;
      const sincePart = /\bsince:/i.test(term) ? '' : `since:${since}`;
      return `${term} ${langPart} -filter:replies ${sincePart} ${negative}`.trim();
    }
    const kwLang = getLangFilterForKeyword(keyword, defaultLang);
    return `${term} ${kwLang} ${baseFilters}`.replace(/\s+/g, ' ').trim();
  }).filter(Boolean);

  // Strategy 2: Small OR groups (max 2 keywords per group to keep query short)
  const groupedQueries = [];
  for (let i = 0; i < keywords.length; i += 2) {
    const group = keywords.slice(i, i + 2);
    const groupTerms = group.map(kw => quoteSearchTerm(kw)).filter(Boolean);
    if (groupTerms.length < 2) continue;
    const langs = group.map(kw => detectKeywordLanguage(kw));
    const allLatin = langs.every(l => l === 'latin');
    const allCJK = langs.every(l => l === 'cjk');
    const groupLang = allLatin ? 'lang:en' : (allCJK ? defaultLang : '');
    groupedQueries.push(`${groupTerms.join(' OR ')} ${groupLang} ${baseFilters}`.replace(/\s+/g, ' ').trim());
  }

  // Strategy 3: Account-based queries (lightweight — no lang filter needed)
  const accountQueries = collectTargetHandles(state)
    .filter(handle => !PROJECT_ACCOUNT_HANDLES.has(handle.toLowerCase()))
    .slice(0, 6)
    .map(handle => `from:${handle} min_faves:${Math.max(5, Math.floor(minFaves / 4))} -filter:replies since:${since}`.trim());

  return [...new Set([...topicQueries, ...groupedQueries, ...accountQueries])].slice(0, 18);
}

function isSearchPage() {
  return window.location.pathname === '/search';
}

function getCurrentSearchQuery() {
  try {
    return new URL(window.location.href).searchParams.get('q') || '';
  } catch (error) {
    return '';
  }
}

function hasOpenEditorText() {
  const editors = Array.from(document.querySelectorAll('[role="textbox"][contenteditable="true"], div[data-testid="tweetTextarea_0"]'));
  return editors.some(editor => (editor.innerText || editor.textContent || '').trim().length > 0);
}

function isDiscoveryNavigationUnsafe(state = {}) {
  const pathname = window.location.pathname || '';
  if (/^\/intent\//.test(pathname) || pathname.includes('/compose/')) return true;
  if (state.pendingReply || state.pendingPost) return true;
  return hasOpenEditorText();
}

function maybeNavigateToDiscoverySearch(state = {}, reason = '当前页面没有匹配候选', options = {}) {
  if (isDiscoveryNavigationUnsafe(state)) {
    addLog('info', '检测到未完成编辑器，暂不切换关键词搜索页');
    return false;
  }

  const queries = buildDiscoverySearchQueries(state);
  if (queries.length === 0) return false;

  const now = Date.now();
  const lastSearchAt = Number(state.lastDiscoverySearchAt) || 0;
  
  let minInterval = SEARCH_DISCOVERY_MIN_INTERVAL_MS;
  if (options.force) {
    minInterval = SEARCH_DISCOVERY_LOW_QUALITY_ROTATE_MS;
  } else if (isSearchPage()) {
    minInterval = SEARCH_DISCOVERY_ROTATE_INTERVAL_MS;
  } else if (window.location.pathname === '/home') {
    // If we are stuck on a messy home page with no candidates, jump to search quickly
    minInterval = 15 * 1000;
  }
  
  if (lastSearchAt && now - lastSearchAt < minInterval) return false;

  const currentQuery = getCurrentSearchQuery();
  let nextIndex = Number(state.discoverySearchIndex) || 0;
  if (isSearchPage() && currentQuery) {
    const currentIndex = queries.findIndex(query => query === currentQuery);
    if (currentIndex >= 0) nextIndex = currentIndex + 1;
  }
  const query = queries[nextIndex % queries.length];
  const url = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=top`;

  chrome.storage.local.set({
    lastDiscoverySearchAt: now,
    discoverySearchIndex: (nextIndex + 1) % queries.length,
    currentDiscoveryQuery: query,
    currentDiscoveryReason: reason,
    botNavigationTime: Date.now()
  });
  addLog('info', `切换到关键词热帖搜索：${query}`);
  window.location.assign(url);
  return true;
}

function maybeNavigateToHomeSurface(state = {}, reason = '当前页面不是发现流') {
  if (isDiscoverySurfacePage()) return false;
  if (isDiscoveryNavigationUnsafe(state)) {
    addLog('info', '检测到未完成编辑器，暂不离开当前页面');
    return false;
  }

  const now = Date.now();
  const lastSurfaceNavigationAt = Number(state.lastSurfaceNavigationAt) || 0;
  if (lastSurfaceNavigationAt && now - lastSurfaceNavigationAt < SURFACE_NAVIGATION_MIN_INTERVAL_MS) return false;

  chrome.storage.local.set({
    lastSurfaceNavigationAt: now,
    currentDiscoveryQuery: '',
    currentDiscoveryReason: reason,
    botNavigationTime: Date.now()
  });
  addLog('info', `当前不在推荐/搜索流，先进入推荐页：${reason}`);
  window.location.assign('https://x.com/home');
  return true;
}

function isSensitiveReplyTarget(text = '') {
  const normalized = String(text || '').toLowerCase();
  return [
    /\b(trump|biden|hunter biden|maga|democrat|republican|election|president|congress|senate)\b/,
    /\b(gaza|israel|palestine|ukraine|russia|war|military)\b/,
    /总统|大选|民主党|共和党|拜登|特朗普|川普|战争|军事|俄乌|巴以|以色列|巴勒斯坦|加沙/
  ].some(pattern => pattern.test(normalized));
}

function collectTopicKeywords(state = {}) {
  const memory = state.agentMemory || {};
  const persona = state.aiPersona || {};
  const strategy = state.onboardingStrategy || {};
  const base = [
    'ai', 'agent', 'chatgpt', 'claude', 'gemini', 'openai', 'llm', 'prompt',
    'automation', 'workflow', 'tool', 'startup', 'founder', 'indie', 'saas',
    'product', 'growth', 'marketing', 'monetization', 'mrr', 'build in public',
    'creator', 'research', 'investment', 'vc',
    '人工智能', '模型', '提示词', '自动化', '工作流', '工具', '创业', '创始人',
    '独立开发', '产品', '增长', '营销', '获客', '流量', '出海', '搞钱', '副业',
    '变现', '商业化', '用户', '付费', '研究', '投资', '复盘'
  ];
  const mapped = {
    insights: ['观点', '趋势', '判断'],
    playbooks: ['方法', '框架', '清单', '实操'],
    stories: ['复盘', '经历', '故事'],
    curation: ['报告', '信息', '新闻', '拆解'],
    softPromo: ['产品', '工具', '案例']
  };
  const configured = [
    persona.targetUsers,
    persona.characteristics,
    persona.goals,
    memory.contentPillars,
    memory.contentAngles,
    memory.audienceSegments,
    memory.audiencePains,
    strategy.contentCustom,
    strategy.audienceCustom
  ].join('\n');
  const extracted = configured
    .split(/[\s,，、。；;：:\n/|]+/)
    .map(item => item.trim().toLowerCase())
    .filter(item => item.length >= 2 && item.length <= 24);
  const strategyKeywords = Array.isArray(strategy.content)
    ? strategy.content.flatMap(item => mapped[item] || [])
    : [];
  return [...new Set([...base, ...strategyKeywords, ...extracted])];
}

function hasRelevantTopic(text = '', state = {}) {
  const normalized = String(text || '').toLowerCase();
  return collectTopicKeywords(state).some(keyword => normalized.includes(keyword));
}

function hasStandaloneReplyPotential(text = '') {
  const normalized = String(text || '').toLowerCase();
  return [
    /不是.*而是|not .* but|really about|本质|关键|核心|真正/,
    /because|why|how|lesson|mistake|framework|playbook|workflow|case|example/,
    /为什么|如何|怎么|经验|教训|框架|路径|清单|案例|复盘|步骤|判断|标准|边界/,
    /\d+[.)、]|[一二三四五六七八九十]个/
  ].some(pattern => pattern.test(normalized));
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

function parseMetricNumber(raw = '') {
  const text = String(raw || '').trim().replace(/,/g, '');
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)(万|千|[KkMm])?/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2] || '';
  if (unit === '万') return Math.round(value * 10000);
  if (unit === '千') return Math.round(value * 1000);
  if (unit.toLowerCase() === 'k') return Math.round(value * 1000);
  if (unit.toLowerCase() === 'm') return Math.round(value * 1000000);
  return Math.round(value);
}

function extractMetricFromText(text = '', labelPattern = '') {
  const metricPattern = '([0-9][0-9,.]*(?:\\.\\d+)?\\s*(?:万|千|[KkMm])?)';
  const patterns = [
    new RegExp(`${metricPattern}\\s*(?:${labelPattern})`, 'i'),
    new RegExp(`(?:${labelPattern})\\s*${metricPattern}`, 'i')
  ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    const parsed = parseMetricNumber(match?.[1]);
    if (parsed !== null) return parsed;
  }
  return null;
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

function metricKnown(value) {
  return Number.isFinite(Number(value));
}

function summarizeMetrics(metrics = {}) {
  const parts = [];
  if (metricKnown(metrics.views)) parts.push(`浏览 ${metrics.views}`);
  if (metricKnown(metrics.likes)) parts.push(`赞 ${metrics.likes}`);
  if (metricKnown(metrics.reposts)) parts.push(`转发 ${metrics.reposts}`);
  if (metricKnown(metrics.replies)) parts.push(`回复 ${metrics.replies}`);
  return parts.join(' / ') || '无可读互动指标';
}

function hasStrongEngagement(metrics = {}, thresholds = {}) {
  return (metricKnown(metrics.views) && metrics.views >= thresholds.minViews)
    || (metricKnown(metrics.likes) && metrics.likes >= thresholds.minFaves)
    || (metricKnown(metrics.reposts) && metrics.reposts >= thresholds.minRetweets)
    || (metricKnown(metrics.replies) && metrics.replies >= thresholds.minReplies);
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

function scoreFreshness(ageMinutes) {
  if (ageMinutes === null) return { score: 4, label: '未知发布时间' };
  if (ageMinutes <= 30) return { score: 24, label: '30分钟内' };
  if (ageMinutes <= 120) return { score: 20, label: '2小时内' };
  if (ageMinutes <= 360) return { score: 14, label: '6小时内' };
  if (ageMinutes <= 1440) return { score: 6, label: '24小时内' };
  if (ageMinutes <= 2880) return { score: -8, label: '24小时以上' };
  return { score: -24, label: '48小时以上' };
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
  const targetHandles = collectTargetHandles(state);
  const isTargetAuthor = targetHandles.includes(String(author || '').toLowerCase());
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
  const href = link?.getAttribute('href') || '';
  return {
    href,
    id: getStatusIdFromHref(href)
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
  return state.onboardingStrategy?.automationMode || 'autoReply';
}

function shouldGenerateReplySuggestion(mode) {
  return mode === 'autoReply';
}

function shouldSendReply(mode) {
  return mode === 'autoReply';
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
  if (Date.now() < twitterCooldownUntil) return;
  if (Date.now() < apiCooldownUntil) return;

  chrome.storage.local.get([
    'isRunning', 'isAutoPaused', 'aiPersona', 'agentMemory', 'competitorReport',
    'twitterCooldownUntil', 'apiCooldownUntil', 'onboardingStrategy', 'targetUsers',
    'pendingReply', 'pendingPost', 'lastDiscoverySearchAt', 'discoverySearchIndex',
    'currentDiscoveryQuery', 'lastSurfaceNavigationAt',
    'automationStartTime', 'sessionReplyCount', 'sessionPostCount'
  ], (result) => {
    if (!result.isRunning) return;
    if (result.isAutoPaused) {
      // Auto-heal: if isRunning is true but isAutoPaused is stale, clear it
      addLog('info', '检测到残留暂停标记，正在自动恢复...');
      chrome.storage.local.set({ isAutoPaused: false });
      return;
    }
    const automationMode = getAutomationMode(result);
    if (!shouldGenerateReplySuggestion(automationMode)) return;
    if (result.twitterCooldownUntil && Date.now() < result.twitterCooldownUntil) return;
    if (result.apiCooldownUntil && Date.now() < result.apiCooldownUntil) return;
    
    const persona = result.aiPersona || {};
    const hasPersona = persona.targetUsers || persona.characteristics || persona.goals || result.accountBio;
    if (!hasPersona) return;
    if (maybeNavigateToHomeSurface(result, '当前页面不是推荐/搜索流')) return;
    
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    if (articles.length === 0) {
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
        effectiveMinScore = 15; // Burst mode: lower threshold
      }

      if (opportunity.score < effectiveMinScore) {
        rememberProcessedTweet(tweetId);
        addLog('info', `跳过 @${author}: 互动机会分 ${opportunity.score} 低于 ${effectiveMinScore}（${opportunity.reasons.join('、')}）`);
        continue;
      }

      candidates.push({ article, author, text, tweetStatus, tweetId, opportunity });
    }

    if (candidates.length === 0) {
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
    chrome.storage.local.set({ isGeneratingReply: true });

    const detectedOrigLang = detectOriginalLanguage(selected.article);
    if (detectedOrigLang) {
      addLog('info', `检测到 X 翻译：原始语言为 ${detectedOrigLang}`);
    }

    chrome.runtime.sendMessage({
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
      isReplying = false;
      chrome.storage.local.set({ isGeneratingReply: false });
      if (chrome.runtime.lastError) {
        addLog('error', '生成回复失败: ' + chrome.runtime.lastError.message);
        return;
      }
      if (response && response.error) {
        addLog('error', 'AI 生成回复失败: ' + response.error);
        if (response.isApiCooldown) {
          apiCooldownUntil = Date.now() + 60000;
          chrome.storage.local.set({ apiCooldownUntil });
        }
        return;
      }
      const replyText = response ? (response.replyText || response.reply) : '';
      if (replyText) {
        const willSend = shouldSendReply(automationMode);
        twitterCooldownUntil = Date.now() + (willSend ? REPLY_ATTEMPT_LOCK_MS : REPLY_COOLDOWN_MS);
        chrome.storage.local.set({
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
        });
        addLog('success', willSend
          ? `已生成回复 @${selected.author}: ${replyText.substring(0, 40)}...`
          : `影子回复建议 @${selected.author}: ${replyText.substring(0, 40)}...`);

        if (willSend) {
          // Dispatch event for automator
          window.dispatchEvent(new CustomEvent('xAutoBot_ReadyToReply', {
            detail: {
              tweetElementId: selected.tweetId,
              replyText,
              tweetAuthor: selected.author,
              tweetContent: selected.text,
              tweetStatusHref: selected.tweetStatus.href,
              tweetStatusId: selected.tweetStatus.id
            }
          }));
        }
      }
    });
  });
}

// ==========================================
// Widget System & Confi (烤仔) AI Pet
// ==========================================
let botState = {};
let logPanelOpen = false;
let sidebarPanelOpen = false;
let activeTab = 'tab-dashboard';
let currentRewriteTweet = null;
let selectedArchetype = 'ai_product_kol';
let selectedStyle = 'concise';

// Confi Pet State
let petBubbleText = "嗨！我是烤仔！点击我可以和我聊天，或者帮你分析推文哦~ 🚀";
let petBubbleVisible = false;
let petBubbleTimeout = null;
let lastAnalyzedTweetId = "";
let idleCounter = 0;

// Dynamic Transparency Cache
let transparentPetUrls = {
  idle: "",
  thinking: "",
  happy: "",
  writing: ""
};

// Canvas White-to-Transparent Processor
function makeImageTransparent(url, callback) {
  const img = new Image();
  img.src = url;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        
        // If pixel is extremely close to pure white, feather its alpha to transparent
        const minVal = Math.min(r, g, b);
        if (minVal > 240) {
          const diff = 255 - minVal; // range 0 to 15
          const alpha = Math.floor((diff / 15) * 255);
          data[i+3] = Math.min(data[i+3], alpha);
        }
      }
      
      ctx.putImageData(imgData, 0, 0);
      callback(canvas.toDataURL("image/png"));
    } catch (e) {
      // CORS safety fallback
      callback(url);
    }
  };
  img.onerror = () => {
    callback(url);
  };
}

let transparentLogoUrl = "";

function initTransparentPetImages() {
  const assets = {
    idle: chrome.runtime.getURL('assets/confi_idle.png'),
    thinking: chrome.runtime.getURL('assets/confi_thinking.png'),
    happy: chrome.runtime.getURL('assets/confi_happy.png'),
    writing: chrome.runtime.getURL('assets/confi_writing.png')
  };
  
  Object.keys(assets).forEach(key => {
    if (transparentPetUrls[key]) return; // already cached
    makeImageTransparent(assets[key], (dataUrl) => {
      transparentPetUrls[key] = dataUrl;
      renderWidget();
    });
  });

  if (!transparentLogoUrl) {
    makeImageTransparent(chrome.runtime.getURL('assets/icons/icon-48.png'), (dataUrl) => {
      transparentLogoUrl = dataUrl;
      renderWidget();
    });
  }
}

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
    renderWidget();
  }
});

function ensureWidget() {
  if (!chrome.runtime?.id) return;
  let widget = document.getElementById('x-auto-bot-widget');
  if (!botState.isRunning) {
    if (!widget) renderWidget();
    return;
  }
  if (!widget) {
    renderWidget();
  } else if (widget.classList.contains('hidden')) {
    widget.classList.remove('hidden');
  }
  
  // 确保对话框 DOM 存在并预载透明资源
  if (botState.petEnabled !== false) {
    initTransparentPetImages();
    ensureChatConsole();
  } else {
    // 强制关闭对话框
    const consoleEl = document.getElementById('x-auto-bot-chat-console');
    if (consoleEl) consoleEl.classList.add('hidden');
  }
}

function formatLogTime(ts) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

function isResultLog(log = {}) {
  const message = String(log.message || '');
  if (/跳过推文抓取|不启动自动滚动|停止自动滚动|跳过发推调度|跳过本次发推|跳过发推|跳过 intent 回复|机器人已停止|用户手动恢复/.test(message)) {
    return false;
  }
  if (/跳过低价值互动目标|互动机会分 .*低于|主题与账号策略不相关|非优先互动账号|未读取到推文 status id/.test(message)) {
    return false;
  }
  const resultPatterns = [
    /已通过 X 官方 intent 回复/,
    /X 提示已回复过/,
    /X 提示这条内容已发布过/,
    /确认已回复/,
    /已回复 @/,
    /队列推文发送成功/,
    /测试推文发送成功/,
    /定时推文发送成功/,
    /X 原生定时发布(创建|写入)成功/,
    /已发 \d+ 条/,
    /已跳过/,
    /跳过 @/,
    /自动操作已暂停/,
    /已暂停/,
    /未确认成功/,
    /发送失败/,
    /发推失败/,
    /回复失败/
  ];
  return resultPatterns.some(pattern => pattern.test(message));
}

function formatResultLogMessage(log = {}) {
  const message = String(log.message || '');
  return message
    .replace(/^✅\s*/, '')
    .replace(/^⚠️\s*/, '')
    .replace(/，进入 \d+ 分钟互动冷却$/, '')
    .replace(/：检测到 X 发送成功提示$/, '')
    .replace(/：编辑器已关闭$/, '')
    .trim();
}

function getLevelEmoji(level) {
  switch (level) {
    case 'success': return '✅';
    case 'warn': return '⚠️';
    case 'error': return '❌';
    default: return 'ℹ️';
  }
}

function getWidgetConfigErrors(state) {
  const errors = [];
  if (!state.apiKey) errors.push('API Key');
  if (!state.leadTarget) errors.push('引流目标');
  if (state.apiProvider && state.apiProvider !== 'gemini' && !state.aiModel) errors.push('模型名称');
  return errors;
}

function refreshBotStateFromStorage() {
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(null, (res) => {
    botState = res || {};
    renderWidget();
  });
}

// 检查 X 页面当前是否处于暗黑/深色模式
function isXDarkMode() {
  const bg = window.getComputedStyle(document.body).backgroundColor;
  if (bg && (bg.includes('rgb(21,') || bg.includes('rgb(0,') || bg.includes('rgb(15,'))) {
    return true;
  }
  return false;
}

// 检查是否有新的回复建议并触发气泡
function checkNewSuggestions() {
  const suggest = botState.lastReplySuggestion;
  if (suggest && Date.now() - suggest.time < 12000 && suggest.tweetContent !== lastAnalyzedTweetId) {
    lastAnalyzedTweetId = suggest.tweetContent;
    const tweetAuthor = suggest.tweetAuthor || "未知用户";
    const textExcerpt = suggest.tweetContent.substring(0, 24) + "...";
    
    if (botState.petPersonality === 'hacker') {
      petBubbleText = `🔥 发现截流机会！对标 @${tweetAuthor} 的推文：「${textExcerpt}」。快点击我查看 AI 回复建议！`;
    } else {
      petBubbleText = `✨ 哇！@${tweetAuthor} 刚发了一条有意思的推文：「${textExcerpt}」。我为主人准备了绝佳的评论建议，快点击我看看吧~`;
    }
    triggerPetBubble(9000);
  }
}

// 定期进行宠物闲聊气泡
function checkIdleChat() {
  if (petBubbleVisible) return;
  idleCounter++;
  if (idleCounter < 45) return;
  idleCounter = 0;
  
  if (Math.random() < 0.4) {
    const explorerPhrases = [
      "Conflux 的星辰大海真是太美妙了！🌌 我们一起探索吧！",
      "今天的增长计划在稳步前进哦！要不要写一条关于 Web3 的推文？",
      "烤仔探测器已锁定！你可以随时点我让我帮你写推文哦~ ✨",
      "烤仔今天也在努力学习新姿势，主人今天有什么新想法吗？📝",
      "如果你看到好玩的推文，点开我的聊天面板，让我帮你吐槽！💬"
    ];
    
    const hackerPhrases = [
      "时间就是粉丝！主人，快来发帖冲数据！📈",
      "今天还没有新增回复，搞钱搞钱！💰 点我快速分析热门推文！",
      "让我来帮你写一条带节奏的爆款推文吧！点击聊天即可开始！🎯",
      "截流的本质是提供更高的信息增量。来，让烤仔帮你出谋划策！",
      "对标账号又有新动作了？赶紧让我来解构一下他们的爆款逻辑！"
    ];
    
    const phrases = botState.petPersonality === 'hacker' ? hackerPhrases : explorerPhrases;
    petBubbleText = phrases[Math.floor(Math.random() * phrases.length)];
    triggerPetBubble(6000);
  }
}

// 气泡控制
function triggerPetBubble(duration = 5000) {
  petBubbleVisible = true;
  clearTimeout(petBubbleTimeout);
  
  const bubble = document.getElementById('x-bot-pet-bubble');
  const bubbleText = document.getElementById('x-bot-pet-bubble-text');
  if (bubble && bubbleText) {
    bubbleText.textContent = petBubbleText;
    bubble.classList.add('show');
  }
  
  petBubbleTimeout = setTimeout(() => {
    petBubbleVisible = false;
    const bubble = document.getElementById('x-bot-pet-bubble');
    if (bubble) {
      bubble.classList.remove('show');
    }
  }, duration);
}

// 切换对话框显示
function toggleChatConsole() {
  const consoleEl = document.getElementById('x-auto-bot-chat-console');
  if (!consoleEl) return;
  
  const isHidden = consoleEl.classList.contains('hidden');
  if (isHidden) {
    // 隐藏气泡
    const bubble = document.getElementById('x-bot-pet-bubble');
    if (bubble) bubble.classList.remove('show');
    petBubbleVisible = false;
    clearTimeout(petBubbleTimeout);

    consoleEl.classList.remove('hidden');
    updateChatConsoleTheme();
    renderChatConsoleMessages();
    
    setTimeout(() => {
      const body = consoleEl.querySelector('.x-chat-body');
      if (body) body.scrollTop = body.scrollHeight;
    }, 100);
  } else {
    consoleEl.classList.add('hidden');
  }
}

function setupChatTab() {
  const sendBtn = document.getElementById('x-chat-send-btn');
  const textarea = document.getElementById('x-chat-textarea');
  
  const triggerSend = () => {
    const text = textarea.value;
    if (text.trim()) {
      sendChatMessage(text);
      textarea.value = '';
      textarea.style.height = 'auto';
    }
  };
  
  if(sendBtn) sendBtn.addEventListener('click', triggerSend);
  if(textarea) textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      triggerSend();
    }
  });
  
  if(textarea) textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(80, textarea.scrollHeight)}px`;
  });
  
  const qbtnWrite = document.getElementById('qbtn-write');
  if(qbtnWrite) qbtnWrite.addEventListener('click', () => {
    textarea.value = "帮我写一条关于最新产品/AI/Web3进展的爆款推文：";
    textarea.focus();
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(80, textarea.scrollHeight)}px`;
  });
  
  const qbtnAnalyze = document.getElementById('qbtn-analyze');
  if(qbtnAnalyze) qbtnAnalyze.addEventListener('click', () => {
    const tweet = getCenterVisibleTweet();
    if (!tweet) {
      alert("未发现可见推文，请将推文滚动到中心");
      return;
    }
    sendChatMessage(`请帮我深度分析这条推文并给出回复建议：\n\n作者：@${tweet.author}\n内容：${tweet.text}`);
  });
  
  const qbtnSummary = document.getElementById('qbtn-summary');
  if(qbtnSummary) qbtnSummary.addEventListener('click', () => {
    sendChatMessage("请帮我汇总今日战绩并给出建议！");
  });
  
  renderChatConsoleMessages();
}

// 渲染对话列表
function renderChatConsoleMessages() {
  const messagesContainer = document.getElementById('x-bot-chat-body');
  if (!messagesContainer) return;
  
  const messages = botState.agentChatMessages || [];
  
  if (messages.length === 0) {
    const greetingText = botState.petPersonality === 'hacker'
      ? "喂！终于舍得点我啦？我是烤仔！快把好推文、选题或者想法发给我，让我这个增长专家帮你搞定一切！📈"
      : "嗨！主人！我是烤仔，你的太空增长小助手！🚀 无论是要写推文、吐槽热门话题，还是更新长期记忆，快对我说吧！✨";
      
    messagesContainer.innerHTML = `
      <div class="x-bot-chat-msg-row assistant">
        <span class="x-bot-chat-msg-label">VibeX</span>
        <div class="x-bot-chat-msg-bubble">${escapeHtml(greetingText)}</div>
      </div>
    `;
    return;
  }
  
  messagesContainer.innerHTML = messages.map(msg => {
    const isUser = msg.role === 'user';
    const label = isUser ? "你" : "VibeX";
    const rowClass = isUser ? "user" : "assistant";
    return `
      <div class="x-bot-chat-msg-row ${rowClass}">
        <span class="x-bot-chat-msg-label">${label}</span>
        <div class="x-bot-chat-msg-bubble">${escapeHtml(msg.content)}</div>
      </div>
    `;
  }).join('');
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 显示思考动画
function showChatTypingIndicator(show) {
  const messagesContainer = document.getElementById('x-bot-chat-body');
  if (!messagesContainer) return;
  
  const existing = messagesContainer.querySelector('.x-chat-typing-row');
  if (existing) existing.remove();
  
  if (show) {
    const typingRow = document.createElement('div');
    typingRow.className = 'x-bot-chat-msg-row assistant x-chat-typing-row';
    typingRow.innerHTML = `
      <span class="x-bot-chat-msg-label">${tUI('烤仔正在思考...')}</span>
      <div class="x-bot-chat-msg-bubble x-chat-typing" style="display:flex;">
        <div class="x-bot-chat-typing-dot"></div>
        <div class="x-bot-chat-typing-dot"></div>
        <div class="x-bot-chat-typing-dot"></div>
      </div>
    `;
    messagesContainer.appendChild(typingRow);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

// 对话框暗黑模式更新
function updateChatConsoleTheme() {
  const consoleEl = document.getElementById('x-auto-bot-chat-console');
  if (!consoleEl) return;
  if (isXDarkMode()) {
    consoleEl.classList.add('x-bot-dark');
  } else {
    consoleEl.classList.remove('x-bot-dark');
  }
}

// 发送消息到 Agent 后台
function sendChatMessage(text) {
  if (!text.trim()) return;
  
  const messages = botState.agentChatMessages || [];
  const userEntry = { role: 'user', content: text, time: Date.now() };
  botState.agentChatMessages = [...messages, userEntry];
  renderChatConsoleMessages();
  
  showChatTypingIndicator(true);
  
  const petImg = document.getElementById('x-bot-pet-img');
  if (petImg) {
    // 强制转换为 thinking state
    petImg.src = transparentPetUrls.thinking || chrome.runtime.getURL('assets/confi_thinking.png');
  }
  
  chrome.runtime.sendMessage({ action: 'agentChat', message: text }, (response) => {
    showChatTypingIndicator(false);
    
    if (petImg) {
      // 重新计算并加载状态图片
      const isGenerating = botState.isGenerating || botState.isAnalyzingPersona || botState.isAnalyzingCompetitors;
      const petState = isGenerating ? 'thinking' : 'idle';
      petImg.src = transparentPetUrls[petState] || chrome.runtime.getURL(`assets/confi_${petState}.png`);
    }
    
    if (chrome.runtime.lastError || !response?.success) {
      const errorText = chrome.runtime.lastError?.message || response?.error || "消息发送失败，请检查配置";
      const errorEntry = { role: 'assistant', content: `❌ 烤仔好像断网了：${errorText}`, time: Date.now() };
      botState.agentChatMessages = [...botState.agentChatMessages, errorEntry];
      renderChatConsoleMessages();
      if (body) body.scrollTop = body.scrollHeight;
      return;
    }
    
    botState.agentChatMessages = response.messages || [];
    renderChatConsoleMessages();
  });
}

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
    if (!closestArticle.dataset.confiId) {
      closestArticle.dataset.confiId = 'tw_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }
    const id = closestArticle.dataset.confiId;
    const author = getTweetAuthor(closestArticle) || "未知用户";
    const text = getTweetText(closestArticle) || "";
    return { id, author, text };
  }
  return null;
}

// 确保对话框 DOM 绑定与生成
function ensureChatConsole() {
  if (!chrome.runtime?.id) return;
  let consoleEl = document.getElementById('x-auto-bot-chat-console');
  if (!consoleEl) {
    consoleEl = document.createElement('div');
    consoleEl.id = 'x-auto-bot-chat-console';
    consoleEl.className = 'hidden';
    document.body.appendChild(consoleEl);
    
    const avatarUrl = chrome.runtime.getURL('assets/icons/icon-128.png');
    consoleEl.innerHTML = `
      <div class="x-chat-header">
        <div class="x-chat-title-area">
          <div class="x-chat-avatar" style="background: transparent;">
            <img src="${avatarUrl}" id="x-chat-avatar-img" alt="VibeX" style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;">
          </div>
          <div>
            <div class="x-chat-title">VibeX 智能助手</div>
            <div class="x-chat-subtitle">VibeX AI Core</div>
          </div>
        </div>
        <button class="x-chat-close-btn" id="x-chat-close-btn">&times;</button>
      </div>
      
      <div class="x-chat-body"></div>
      
      <div class="x-chat-quick-actions">
        <button class="x-chat-quick-btn" id="qbtn-write">✍️ 帮我写推文</button>
        <button class="x-chat-quick-btn" id="qbtn-analyze">🎯 分析当前推文</button>
        <button class="x-chat-quick-btn" id="qbtn-summary">📊 汇报今日进展</button>
      </div>
      
      <div class="x-chat-composer">
        <textarea class="x-chat-textarea" id="x-chat-textarea" rows="1" placeholder="和烤仔聊聊..."></textarea>
        <button class="x-chat-send-btn" id="x-chat-send-btn">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    `;
    
    consoleEl.querySelector('#x-chat-close-btn').addEventListener('click', toggleChatConsole);
    
    const sendBtn = consoleEl.querySelector('#x-chat-send-btn');
    const textarea = consoleEl.querySelector('#x-chat-textarea');
    
    const triggerSend = () => {
      const text = textarea.value;
      if (text.trim()) {
        sendChatMessage(text);
        textarea.value = '';
        textarea.style.height = 'auto';
      }
    };
    
    sendBtn.addEventListener('click', triggerSend);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        triggerSend();
      }
    });
    
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(80, textarea.scrollHeight)}px`;
    });
    
    consoleEl.querySelector('#qbtn-write').addEventListener('click', () => {
      textarea.value = "帮我写一条关于最新产品/AI/Web3进展的爆款推文：";
      textarea.focus();
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(80, textarea.scrollHeight)}px`;
    });
    
    consoleEl.querySelector('#qbtn-analyze').addEventListener('click', () => {
      const tweet = getCenterVisibleTweet();
      if (!tweet) {
        alert("未在当前屏幕中心发现可见推文，请将一条推文滚动到屏幕中心后再试！");
        return;
      }
      const prompt = `请帮我深度分析下面这条推文的亮点、爆款元素，并给出一个高价值回复建议：\n\n作者：@${tweet.author}\n内容：${tweet.text}`;
      sendChatMessage(prompt);
    });
    
    consoleEl.querySelector('#qbtn-summary').addEventListener('click', () => {
      const prompt = "请帮我汇总今日的增长战绩并给出一个简短的鼓励 and 建议！";
      sendChatMessage(prompt);
    });
  }
  
  const avatarImg = consoleEl.querySelector('#x-chat-avatar-img');
  if (avatarImg) {
    const isGenerating = botState.isGenerating || botState.isAnalyzingPersona || botState.isAnalyzingCompetitors;
    if (isGenerating) {
      avatarImg.style.animation = 'x-chat-typing 1.4s infinite ease-in-out both';
    } else {
      avatarImg.style.animation = 'none';
    }
  }
}

function renderWidget() {
  const oldWidget = document.getElementById('x-auto-bot-widget');
  if (oldWidget) oldWidget.remove();
  
  if (sidebarPanelOpen && activeTab === 'tab-dashboard') {
    renderDashboardTab();
  }
}

window.toggleBotState = function() {
  const newState = !botState.isRunning;
  chrome.runtime.sendMessage({ action: 'toggleBot', state: newState }, (res) => {
    if(res && res.success) {
      botState.isRunning = newState;
      renderDashboardTab();
    }
  });
};

function renderDashboardTab() {
  const container = document.getElementById('x-bot-dashboard-content');
  if (!container) return;
  
  const isRunning = !!botState.isRunning;
  const statusLabel = isRunning ? "运行中" : "已停止";
  const statusClass = isRunning ? "active" : "idle";
  const btnText = isRunning ? "停止 Agent" : "启动 Agent";
  const btnClass = isRunning ? "x-bot-btn-main stop" : "x-bot-btn-main";
  
  const progress = botState.profileReadProgress || {};
  const isProfileDone = progress.stage === 'extracted';
  const hasPersona = !!(botState.aiPersona && (botState.aiPersona.targetUsers || botState.aiPersona.characteristics));
  const hasCompetitor = !!botState.competitorReport;
  const draftStatus = botState.xOfficialDraftStatus === 'success' ? '已读取' : (botState.xOfficialDraftStatus === 'reading' ? '读取中' : '未读取');
  
  const postsToday = Number(botState.postsToday) || 0;
  const repliesSent = botState.stats ? botState.stats.repliesSent : 0;
  const nextPostStr = botState.nextPostTime ? botState.nextPostTime : (botState.postDeliveryMode === 'xNativeSchedule' ? '已排入 X 官方草稿箱' : '等待中');
  
  let focusStatus = isRunning ? "正在执行自动化监控" : "待启动：点击上方按钮启动 Agent";
  if (isRunning) {
    if (botState.isTyping) focusStatus = "正在向 X 原生界面打字...";
    else if (botState.isGeneratingReply) focusStatus = "正在生成互动回复策略...";
    else if (botState.isAnalyzingPersona) focusStatus = "正在分析账号特征与受众...";
    else if (botState.isGenerating) focusStatus = "正在生成新推文...";
  }

  const personaRole = botState.aiPersona?.characteristics || "未定义";
  const personaReader = botState.aiPersona?.targetUsers || "未定义";
  const personaTopics = (botState.aiPersona?.contentTopics || []).join(' ') || "未定义";

  container.innerHTML = `
    <div class="x-bot-dash-card">
      <div class="x-bot-dash-header" style="margin-bottom: 20px;">
        <div style="display:flex;align-items:center;">
          <span class="x-bot-dash-status-dot ${statusClass}"></span>
          <span style="font-weight:700;font-size:15px;color:#0f172a;">${statusLabel}</span>
        </div>
      </div>
      <button class="${btnClass}" onclick="toggleBotState()">${btnText}</button>
    </div>

    <div class="x-bot-dash-card">
      <div class="x-bot-dash-header">
        <span class="x-bot-dash-title" style="color:#1d9bf0;">CURRENT FOCUS</span>
      </div>
      <div style="font-weight:700; color:#0f172a; margin-bottom: 16px; font-size:14px;">${focusStatus}</div>
      <div class="x-bot-dash-milestone ${isProfileDone ? 'done' : ''}">读取主页简介</div>
      <div class="x-bot-dash-milestone ${hasPersona ? 'done' : ''}">人设与目标用户</div>
      <div class="x-bot-dash-milestone ${hasCompetitor ? 'done' : ''}">竞品与爆款框架</div>
      <div class="x-bot-dash-milestone ${draftStatus==='已读取' ? 'done' : ''}">X 官方草稿 (${draftStatus})</div>
    </div>

    <div class="x-bot-dash-card">
      <div class="x-bot-dash-header">
        <span class="x-bot-dash-title">今日发声计划 & 成果</span>
      </div>
      <div class="x-bot-dash-grid">
        <div class="x-bot-dash-stat">
          <div class="x-bot-dash-stat-label">下次发布</div>
          <div class="x-bot-dash-stat-val" style="font-size:12px;">${nextPostStr}</div>
        </div>
        <div class="x-bot-dash-stat">
          <div class="x-bot-dash-stat-label">今日发帖 / 回复</div>
          <div class="x-bot-dash-stat-val">${postsToday} / ${repliesSent}</div>
        </div>
      </div>
    </div>

    <div class="x-bot-dash-card">
      <div class="x-bot-dash-header">
        <span class="x-bot-dash-title">AI 增长策略信号</span>
        <span class="x-bot-chip" style="background:#eff6ff;color:#1d9bf0;border-color:#bfdbfe;font-weight:700;">Strategy</span>
      </div>
      <div class="x-bot-dash-signal">
        <div class="x-bot-dash-signal-row">
          <span class="x-bot-dash-signal-label">角色</span>
          <span class="x-bot-dash-signal-val" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${personaRole}</span>
        </div>
        <div class="x-bot-dash-signal-row">
          <span class="x-bot-dash-signal-label">读者</span>
          <span class="x-bot-dash-signal-val" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${personaReader}</span>
        </div>
        <div class="x-bot-dash-signal-row" style="border:none;">
          <span class="x-bot-dash-signal-label">飞轮</span>
          <span class="x-bot-dash-signal-val" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${personaTopics}</span>
        </div>
      </div>
    </div>
  `;
}

function injectStyles() {
  if (document.getElementById('x-bot-injected-styles')) return;
  const style = document.createElement('style');
  style.id = 'x-bot-injected-styles';
  style.textContent = `

    /* --- PIXEL ART STYLES --- */

    /* --- TOGGLE SWITCH --- */
    .x-bot-toggle-switch input:checked + span {
      background-color: #10b981;
    }
    .x-bot-toggle-switch input:checked + span .x-bot-toggle-slider {
      transform: translateX(20px);
    }

    .x-bot-sidebar-vertical-nav {
      width: 70px;
      background: #f8fafc;
      border-left: 2px solid #000;
      border-right: 2px solid #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 16px;
      gap: 16px;
      box-sizing: border-box;
      z-index: 10;
    }
    .x-bot-sidebar-tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 8px 4px;
      width: 50px;
      border-radius: 8px;
      border: 2px solid transparent;
      color: #64748b;
      transition: all 0.2s;
    }
    .x-bot-sidebar-tab:hover { background: #e2e8f0; }
    .x-bot-sidebar-tab.active {
      background: #ffffff;
      border: 2px solid #000;
      color: #000;
      box-shadow: 2px 2px 0px #000;
    }
    .x-bot-nav-icon { font-size: 20px; margin-bottom: 4px; }
    .x-bot-nav-text { font-size: 11px; font-weight: 700; font-family: 'Courier New', Courier, monospace; }

    /* Pixel Chat Banner */
    .x-bot-pixel-banner {
      background: #ffffff;
      border: 2px solid #000;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 8px;
      box-shadow: 2px 2px 0px #000;
    }
    .x-bot-pixel-banner-top {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 2px solid #000;
      background: #f8fafc;
    }
    .x-bot-pixel-avatar {
      width: 40px; height: 40px;
      border: 2px solid #000;
      border-radius: 4px;
      background: #fff;
      margin-right: 12px;
      overflow: hidden;
    }
    .x-bot-pixel-avatar img { width:100%; height:100%; object-fit:cover; }
    .x-bot-pixel-info { flex: 1; }
    .x-bot-pixel-name { font-size: 14px; color: #000; }
    .x-bot-pixel-level { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
    .x-bot-pixel-bar { width: 60px; height: 8px; border: 2px solid #000; background: #fff; border-radius: 2px; }
    .x-bot-pixel-bar-inner { width: 60%; height: 100%; background: #10b981; }
    .x-bot-pixel-btn {
      background: #ffffff;
      border: 2px solid #000;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 900;
      font-family: 'Courier New', Courier, monospace;
      box-shadow: 1px 1px 0px #000;
      cursor: pointer;
    }
    .x-bot-pixel-btn:active { transform: translate(1px, 1px); box-shadow: 0 0 0 #000; }
    
    .x-bot-pixel-scene {
      height: 120px;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
    }
    .x-bot-pixel-pet-model {
      height: 70px;
      object-fit: contain;
      image-rendering: pixelated;
    }
    .x-bot-pixel-bubble {
      background: #fff;
      border: 2px solid #000;
      padding: 6px 10px;
      border-radius: 8px;
      position: absolute;
      top: 15px;
      color: #000;
    }
    .x-bot-pixel-bubble::after {
      content: '';
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      border-width: 6px 6px 0;
      border-style: solid;
      border-color: #000 transparent transparent transparent;
    }
    
    .x-bot-pixel-action-btn {
      background: #fff;
      border: 2px solid #000;
      color: #000;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: bold;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 1px 1px 0px #000;
    }
    .x-bot-pixel-action-btn:hover { background: #f8fafc; }
    
    .x-bot-pixel-textarea {
      flex: 1;
      border: 2px solid #000;
      border-radius: 8px;
      padding: 10px;
      font-family: 'Courier New', Courier, monospace;
      resize: none;
      box-shadow: 2px 2px 0px rgba(0,0,0,0.1);
    }
    .x-bot-pixel-send {
      width: 40px; height: 40px;
      background: #000;
      color: #fff;
      border: 2px solid #000;
      border-radius: 8px;
      font-size: 18px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    
    /* Modify Chat Bubble */
    .x-bot-chat-msg-row { display: flex; flex-direction: column; margin-bottom: 8px; }
    .x-bot-chat-msg-row.user { align-items: flex-end; }
    .x-bot-chat-msg-row.assistant { align-items: flex-start; }
    .x-bot-chat-msg-label { font-size: 11px; color: #64748b; margin-bottom: 4px; font-family: 'Courier New', Courier, monospace; font-weight: bold; }
    .x-bot-chat-msg-bubble {
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      color: #0f172a;
      max-width: 90%;
      line-height: 1.5;
    }
    .x-bot-chat-msg-row.user .x-bot-chat-msg-bubble {
      background: #334155;
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .x-bot-chat-msg-row.assistant .x-bot-chat-msg-bubble {
      background: #f1f5f9;
      border-bottom-left-radius: 4px;
      border: 2px solid #e2e8f0;
    }
    
    /* Pixelated Dashboard Cards */
    
    .x-bot-btn-main {
      background: #fff;
      border: 2px solid #000;
      color: #000;
      box-shadow: 2px 2px 0px #000;
      text-transform: uppercase;
      font-family: 'Courier New', Courier, monospace;
      font-weight: 900;
    }
    .x-bot-btn-main.stop {
      background: #ef4444; color: #fff; border-color: #000;
    }
    .x-bot-btn-main:active { transform: translate(2px, 2px); box-shadow: 0 0 0 #000; }

    /* X action bar collect button */
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
      border-radius: 99px;
      border: 1px solid rgba(29, 155, 240, 0.3);
      background: rgba(29, 155, 240, 0.05);
      color: #1d9bf0;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
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
    
    .x-bot-tooltip {
      position: absolute;
      bottom: -32px;
      left: 50%;
      transform: translateX(-50%) scale(0.9);
      background: rgba(15, 23, 42, 0.95);
      color: #ffffff;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 100000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .x-bot-collect-btn-wrapper:hover .x-bot-tooltip {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
    
    /* Sleek toast container */
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
      padding: 14px 20px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: auto;
      transform: translateX(120%) scale(0.9);
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .x-bot-toast.show {
      transform: translateX(0) scale(1);
      opacity: 1;
    }
    .x-bot-toast.success {
      border-left: 4px solid #10b981;
    }
    .x-bot-toast.error {
      border-left: 4px solid #ef4444;
    }
    .x-bot-toast.info {
      border-left: 4px solid #3b82f6;
    }
    
    /* Monica-Style Sidebar Panel */


    #x-bot-sidebar-container {
      position: fixed;
      top: 0;
      right: 0;
      width: 0;
      height: 100vh;
      z-index: 999999;
      pointer-events: none;
    }

    .x-bot-sidebar-toggle-btn {
      position: absolute;
      top: 50%;
      left: -40px;
      transform: translateY(-50%);
      width: 40px;
      height: 140px;
      background: #ffffff;
      border: 2px solid #000;
      border-right: none;
      border-radius: 12px 0 0 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: -4px 4px 0px rgba(0,0,0,1);
      z-index: 999999;
      font-weight: bold;
      font-size: 14px;
      transition: all 0.2s;
    }
    .x-bot-sidebar-toggle-btn:hover {
      background: #f8fafc;
      color: #1d9bf0;
      left: -44px;
    }

    /* Sidebar is fixed on the right, pushing body left */
    #x-bot-sidebar-panel {
      position: fixed;
      top: 0;
      right: -450px;
      width: 450px;
      height: 100vh;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(20px);
      border-left: 1px solid rgba(0, 0, 0, 0.08);
      box-shadow: -8px 0 30px rgba(0, 0, 0, 0.08);
      transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 999999;
    }
    #x-bot-sidebar-panel.open {
      right: 0;
    }

    /* Tabs Header */
    .x-bot-sidebar-header {
      padding: 20px 20px 0 20px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }
    .x-bot-sidebar-title {
      font-size: 18px;
      font-weight: 800;
      margin: 0 0 16px 0;
      color: #1d9bf0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .x-bot-sidebar-close {
      cursor: pointer;
      color: #94a3b8;
      font-size: 24px;
      line-height: 1;
      border: none;
      background: transparent;
      padding: 0;
    }
    .x-bot-sidebar-close:hover { color: #f8fafc; }

    .x-bot-sidebar-tabs {
      display: flex;
      gap: 16px;
    }
    .x-bot-sidebar-tab {
      padding: 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      position: relative;
    }
    .x-bot-sidebar-tab:hover { color: #334155; }
    .x-bot-sidebar-tab.active { color: #1d9bf0; }
    .x-bot-sidebar-tab.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      width: 100%;
      height: 2px;
      background: #1d9bf0;
      border-radius: 2px 2px 0 0;
    }

    /* Content Area */
    .x-bot-sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    .x-bot-tab-view {
      display: none;
      flex-direction: column;
      gap: 20px;
    }
    .x-bot-tab-view.active {
      display: flex;
    }

    /* Common Components inside Sidebar */
    .x-bot-sidebar-subtitle {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 8px;
      letter-spacing: 0.05em;
    }
    
    /* Rewrite Tab Specific */
    .x-bot-orig-author {
      font-weight: 700;
      color: #1d9bf0;
      margin-bottom: 6px;
      font-size: 14px;
    }
    .x-bot-orig-text {
      font-size: 13px;
      line-height: 1.5;
      color: #334155;
      background: #f8fafc;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(0, 0, 0, 0.06);
      white-space: pre-wrap;
      max-height: 150px;
      overflow-y: auto;
    }

    .x-bot-modal-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .x-bot-modal-group label {
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
    }

    .x-bot-chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .x-bot-chip {
      padding: 5px 10px;
      border-radius: 99px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      background: #ffffff;
      font-size: 12px;
      cursor: pointer;
      color: #475569;
      transition: all 0.2s ease;
    }
    .x-bot-chip:hover {
      border-color: #1d9bf0;
      background: rgba(29, 155, 240, 0.05);
      color: #1d9bf0;
    }
    .x-bot-chip.active {
      background: #1d9bf0;
      color: #ffffff;
      border-color: #1d9bf0;
      box-shadow: 0 4px 10px rgba(29, 155, 240, 0.3);
    }

    .x-bot-modal-textarea {
      width: 100%;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid rgba(0, 0, 0, 0.15);
      background: #ffffff;
      color: #0f172a;
      font-family: inherit;
      font-size: 13px;
      resize: vertical;
      outline: none;
      transition: border-color 0.2s ease;
      box-sizing: border-box;
    }
    .x-bot-modal-textarea:focus {
      border-color: #1d9bf0;
      box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.15);
    }

    .x-bot-btn-glowing {
      width: 100%;
      padding: 12px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #1d9bf0 0%, #0052ff 100%);
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(29, 155, 240, 0.4);
      transition: all 0.2s ease;
    }
    .x-bot-btn-glowing:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(29, 155, 240, 0.6);
    }

    /* Typing 3D Animation Arena */
    .x-bot-modal-animation-zone {
      position: relative;
      margin: 8px 0;
      padding: 12px;
      background: rgba(29, 155, 240, 0.03);
      border-radius: 12px;
      border: 1px dashed rgba(29, 155, 240, 0.3);
      text-align: center;
      display: none;
    }
    .x-bot-modal-animation-zone.active {
      display: block;
    }

    .x-bot-grid-keyboard {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 4px;
      width: 100%;
      margin: 8px auto;
      padding: 6px;
      background: #f1f5f9;
      border-radius: 8px;
      border: 1px solid rgba(29, 155, 240, 0.25);
    }
    .x-bot-grid-key {
      height: 10px;
      border-radius: 2px;
      background: #e2e8f0;
      border: 1px solid rgba(0, 0, 0, 0.05);
    }
    .x-bot-grid-keyboard.generating .x-bot-grid-key {
      animation: key-typing 0.4s infinite ease-in-out alternate;
    }
    @keyframes key-typing {
      0% { background: #e2e8f0; border-color: rgba(0,0,0,0.05); box-shadow: none; }
      100% { background: rgba(29, 155, 240, 0.8); border-color: #1d9bf0; box-shadow: 0 0 8px rgba(29, 155, 240, 0.5); }
    }

    .x-bot-scanline {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 2px;
      background: linear-gradient(90deg, transparent 0%, #00ffff 50%, transparent 100%);
      box-shadow: 0 0 10px #00ffff;
      animation: holo-scanning 2s infinite ease-in-out;
      opacity: 0.7;
    }
    @keyframes holo-scanning {
      0% { top: 0%; }
      50% { top: 100%; }
      100% { top: 0%; }
    }

    .x-bot-anim-label {
      font-size: 11px;
      color: #1d9bf0;
      font-weight: 600;
      margin-top: 8px;
    }

    .x-bot-btn-primary {
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #fff;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
      transition: all 0.2s ease;
      width: 100%;
      box-sizing: border-box;
      margin-top: 8px;
    }
    .x-bot-btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
    }

    /* Library Cards */
    .x-bot-lib-card {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .x-bot-lib-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .x-bot-lib-author { font-weight: 700; color: #1d9bf0; font-size: 13px; }
    .x-bot-lib-time { color: #94a3b8; font-size: 11px; }
    .x-bot-lib-text { font-size: 13px; color: #334155; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .x-bot-lib-actions { display: flex; gap: 8px; }
    .x-bot-btn-small {
      padding: 6px 12px;
      border-radius: 6px;
      border: none;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      background: #f1f5f9;
      color: #475569;
    }
    .x-bot-btn-small.rewrite { background: #eff6ff; color: #1d9bf0; border: 1px solid #bfdbfe; }
    .x-bot-btn-small.rewrite:hover { background: #dbeafe; }
    .x-bot-btn-small.delete { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; }
    .x-bot-btn-small.delete:hover { background: #fee2e2; }
    .x-bot-btn-small.post { background: #ecfdf5; color: #10b981; border: 1px solid #a7f3d0; }
    .x-bot-btn-small.post:hover { background: #d1fae5; }

    /* Empty State */
    .x-bot-empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #64748b;
    }
    .x-bot-empty-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }


    /* Dashboard specific styles */
    .x-bot-dash-card {
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .x-bot-dash-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .x-bot-dash-title { font-size: 14px; font-weight: 700; color: #0f172a; }
    .x-bot-dash-subtitle { font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 10px; }
    .x-bot-dash-status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
    .x-bot-dash-status-dot.active { background: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2); }
    .x-bot-dash-status-dot.idle { background: #94a3b8; }
    .x-bot-dash-status-dot.error { background: #ef4444; }
    .x-bot-btn-main {
      width: 100%;
      padding: 14px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      color: #fff;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      background: linear-gradient(135deg, #1d9bf0 0%, #0052ff 100%);
      box-shadow: 0 4px 15px rgba(29, 155, 240, 0.3);
    }
    .x-bot-btn-main.stop {
      background: #f1f5f9;
      color: #ef4444;
      box-shadow: none;
      border: 1px solid #e2e8f0;
    }
    .x-bot-btn-main:hover { transform: translateY(-1px); }
    
    .x-bot-dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .x-bot-dash-stat {
      background: #f8fafc;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #f1f5f9;
    }
    .x-bot-dash-stat-label { font-size: 11px; color: #64748b; font-weight: 600; margin-bottom: 4px; }
    .x-bot-dash-stat-val { font-size: 14px; font-weight: 700; color: #0f172a; }
    
    .x-bot-dash-milestone { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; color: #475569; font-weight: 500; }
    .x-bot-dash-milestone.done { color: #10b981; font-weight: 600; }
    .x-bot-dash-milestone.done::before { content: '●'; color: #10b981; font-size: 12px; }
    .x-bot-dash-milestone::before { content: '●'; color: #cbd5e1; font-size: 12px; }
    
    .x-bot-dash-signal { display: flex; flex-direction: column; gap: 10px; }
    .x-bot-dash-signal-row { display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
    .x-bot-dash-signal-label { font-size: 12px; color: #64748b; font-weight: 600; width: 60px; }
    .x-bot-dash-signal-val { font-size: 12px; font-weight: 700; color: #0f172a; flex: 1; text-align: right; }
    
    .x-bot-dash-log { background: #f8fafc; border-radius: 8px; padding: 10px; max-height: 120px; overflow-y: auto; font-size: 11px; font-family: monospace; color: #475569; }
    .x-bot-dash-log-line { border-bottom: 1px solid #f1f5f9; padding: 4px 0; }
    /* Switch */
    .x-bot-switch-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(0,0,0,0.08);
      margin-bottom: 16px;
    }
    .x-bot-switch-label { font-size: 13px; font-weight: 600; color: #0f172a; }
    .x-bot-switch-desc { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    .x-bot-switch { position: relative; display: inline-block; width: 40px; height: 22px; }
    .x-bot-switch input { opacity: 0; width: 0; height: 0; }
    .x-bot-slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #334155; transition: .3s; border-radius: 22px;
    }
    .x-bot-slider:before {
      position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px;
      background-color: white; transition: .3s; border-radius: 50%;
    }
    input:checked + .x-bot-slider { background-color: #10b981; }
    input:checked + .x-bot-slider:before { transform: translateX(18px); }


    /* Chat Tab */
    .x-bot-chat-msg-row { display: flex; flex-direction: column; margin-bottom: 16px; }
    .x-bot-chat-msg-row.user { align-items: flex-end; }
    .x-bot-chat-msg-row.assistant { align-items: flex-start; }
    .x-bot-chat-msg-label { font-size: 11px; color: #94a3b8; margin-bottom: 4px; font-weight: 600; }
    .x-bot-chat-msg-bubble {
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.5;
      max-width: 90%;
      word-wrap: break-word;
    }
    .x-bot-chat-msg-row.user .x-bot-chat-msg-bubble {
      background: #1d9bf0;
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .x-bot-chat-msg-row.assistant .x-bot-chat-msg-bubble {
      background: #f1f5f9;
      color: #1e293b;
      border-bottom-left-radius: 4px;
    }
    .x-bot-chat-typing-dot {
      display: inline-block; width: 6px; height: 6px; margin: 0 2px;
      background-color: #94a3b8; border-radius: 50%;
      animation: x-chat-typing 1.4s infinite ease-in-out both;
    }
    .x-bot-chat-typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .x-bot-chat-typing-dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes x-chat-typing { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

    .x-bot-sidebar-content::-webkit-scrollbar { width: 6px; }

    /* Chat Tab */
    .x-bot-chat-msg-row { display: flex; flex-direction: column; margin-bottom: 16px; }
    .x-bot-chat-msg-row.user { align-items: flex-end; }
    .x-bot-chat-msg-row.assistant { align-items: flex-start; }
    .x-bot-chat-msg-label { font-size: 11px; color: #94a3b8; margin-bottom: 4px; font-weight: 600; }
    .x-bot-chat-msg-bubble {
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.5;
      max-width: 90%;
      word-wrap: break-word;
    }
    .x-bot-chat-msg-row.user .x-bot-chat-msg-bubble {
      background: #1d9bf0;
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .x-bot-chat-msg-row.assistant .x-bot-chat-msg-bubble {
      background: #f1f5f9;
      color: #1e293b;
      border-bottom-left-radius: 4px;
    }
    .x-bot-chat-typing-dot {
      display: inline-block; width: 6px; height: 6px; margin: 0 2px;
      background-color: #94a3b8; border-radius: 50%;
      animation: x-chat-typing 1.4s infinite ease-in-out both;
    }
    .x-bot-chat-typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .x-bot-chat-typing-dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes x-chat-typing { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

    .x-bot-sidebar-content::-webkit-scrollbar-track { background: transparent; }

    /* Chat Tab */
    .x-bot-chat-msg-row { display: flex; flex-direction: column; margin-bottom: 16px; }
    .x-bot-chat-msg-row.user { align-items: flex-end; }
    .x-bot-chat-msg-row.assistant { align-items: flex-start; }
    .x-bot-chat-msg-label { font-size: 11px; color: #94a3b8; margin-bottom: 4px; font-weight: 600; }
    .x-bot-chat-msg-bubble {
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.5;
      max-width: 90%;
      word-wrap: break-word;
    }
    .x-bot-chat-msg-row.user .x-bot-chat-msg-bubble {
      background: #1d9bf0;
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .x-bot-chat-msg-row.assistant .x-bot-chat-msg-bubble {
      background: #f1f5f9;
      color: #1e293b;
      border-bottom-left-radius: 4px;
    }
    .x-bot-chat-typing-dot {
      display: inline-block; width: 6px; height: 6px; margin: 0 2px;
      background-color: #94a3b8; border-radius: 50%;
      animation: x-chat-typing 1.4s infinite ease-in-out both;
    }
    .x-bot-chat-typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .x-bot-chat-typing-dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes x-chat-typing { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

    .x-bot-sidebar-content::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 3px; }
  `;
  (document.head || document.documentElement).appendChild(style);
}
// Simple localization for content script
function tUI(msg) {
  const lang = botState.engineLanguage || 'zh';
  if (lang === 'zh') return msg;
  
  const dict = {
    '❌ 无法提取推文文字内容': '❌ Failed to extract tweet text',
    '❌ 生成失败: ': '❌ Generation failed: ',
    '❌ 收录失败：扩展后台未就绪': '❌ Save failed: extension backend not ready',
    'ℹ️ 该推文已被收录': 'ℹ️ Tweet already saved',
    '📥 成功收录至烤仔灵感库！': '📥 Successfully saved to Vault!',
    '❌ 收录失败: ': '❌ Save failed: ',
    '✅ 内容已填入': '✅ Content filled',
    '❌ 未找到输入框，请手动粘贴': '❌ Input box not found, please paste manually',
    '✅ 回复已自动填入！': '✅ Reply auto-filled!',
    '❌ 未找到该推文的回复按钮': '❌ Reply button not found',
    '❌ 页面已刷新或推文不在视野内': '❌ Page refreshed or tweet out of view',
    '未知错误': 'Unknown error',
    '仿写': 'Rewrite',
    '回复': 'Reply',
    '一键仿写': 'One-click Rewrite',
    '智能回复': 'Smart Reply',
    '烤仔正在思考...': 'VibeX is thinking...',
    'AI 正在思考...': 'AI is thinking...'
  };

  let res = msg;
  for (const [zh, en] of Object.entries(dict)) {
    if (res.includes(zh)) {
      res = res.replace(zh, en);
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

      chrome.runtime.sendMessage({
        action: 'autoRewrite',
        tweetData: tweetData
      }).catch(()=>{});
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
            streamBubble.style.cssText = 'position:fixed;bottom:120px;right:24px;width:320px;background:var(--primary, #0F0F0F);color:#fff;padding:16px;border-radius:16px;z-index:999999;box-shadow:0 12px 40px rgba(0,0,0,0.4);font-size:14px;line-height:1.6;max-height:400px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);white-space:pre-wrap;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
            const header = document.createElement('div');
            header.innerHTML = '<span style="color:#00BA7C;margin-right:8px;">✨</span>' + tUI('AI 正在思考...');
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

      chrome.runtime.sendMessage({
        action: 'magicPrompt',
        promptType: 'draft_reply',
        contextData: tweetData
      }, (res) => {
        if (chrome.runtime.lastError || !res || res.error) {
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
  
  chrome.runtime.sendMessage({ action: 'collectTweet', tweet }, (response) => {
    if (chrome.runtime.lastError) {
      showToast('❌ 收录失败：扩展后台未就绪', 'error');
      return;
    }
    if (response && response.success) {
      if (response.alreadyExists) {
        showToast('ℹ️ 该推文已被收录', 'info');
      } else {
        showToast('📥 成功收录至烤仔灵感库！', 'success');
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
      chrome.runtime.sendMessage({
        action: 'updateContext',
        contextType: 'profile',
        data: { author: author, bio: bioEl ? bioEl.textContent : '' }
      }).catch(e => {}); // ignore disconnect errors
    }
    return;
  }
  
  // Try to find center tweet
  const tweet = getCenterVisibleTweet();
  if (tweet) {
    if (lastContextId !== 'tweet_' + tweet.id) {
      lastContextId = 'tweet_' + tweet.id;
      chrome.runtime.sendMessage({
        action: 'updateContext',
        contextType: 'tweet',
        data: tweet
      }).catch(e => {});
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

// ==========================================
// MAGIC INJECTION (The Xiaolongxia Standard)
// ==========================================
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'openComposeModal') {
    const postBtn = document.querySelector('a[data-testid="SideNav_NewTweet_Button"]');
    if (postBtn) {
      postBtn.click();
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
          document.execCommand('insertText', false, req.text);
          showToast('✅ 内容已填入', 'system');
        } else {
          showToast('❌ 未找到输入框，请手动粘贴', 'error');
        }
      }, 800);
    } else {
      window.open(`https://x.com/compose/tweet?text=${encodeURIComponent(req.text)}`, '_top');
    }
    return;
  }

  if (req.action === 'injectReply') {
    if (!req.tweetId) return;
    
    // Find the specific tweet we saved context for
    const article = document.querySelector(`article[data-confi-id="${req.tweetId}"]`);
    if (article) {
      // Find the native reply button inside this article
      const replyBtn = article.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
      if (replyBtn) {
        replyBtn.click();
        
        // Wait for the modal editor to appear
        setTimeout(() => {
          // Twitter's reply modal editor
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
            
            // Due to React, setting innerText won't trigger state.
            // Using DataTransfer and paste event is the most robust way.
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', req.text);
            const pasteEvent = new ClipboardEvent('paste', {
              clipboardData: dataTransfer,
              bubbles: true,
              cancelable: true
            });
            editor.dispatchEvent(pasteEvent);
            
            showToast('✅ 回复已自动填入！', 'success');
          } else {
            showToast('❌ 未找到输入框，请手动粘贴', 'error');
          }
        }, 800);
      } else {
        showToast('❌ 未找到该推文的回复按钮', 'error');
      }
    } else {
      showToast('❌ 页面已刷新或推文不在视野内', 'error');
    }
  }
});

chrome.runtime.onMessage.addListener((req) => {
  if (req.action === 'requestSync') {
    lastContextId = null; // force sync
    syncContext();
  } else if (req.action === 'sidePanelState') {
    const btn = document.getElementById('confi-x-floating-btn');
    if (btn) {
      btn.style.display = req.isOpen ? 'none' : 'block';
    }
  }
});

function injectFloatingButton() {
  // Removed per user request: floating window disabled
  const existingBtn = document.getElementById('confi-x-floating-btn');
  if (existingBtn) existingBtn.remove();
}
// Run once
// setTimeout(injectFloatingButton, 1000);

// ==========================================
// CENTRAL PERFORMANCE OPTIMIZED LOOP
// ==========================================
let domUpdateTimer = null;
let lastScrapeTime = 0;
let lastStorageSyncTime = 0;

let lastUIInjectTime = 0;

const domObserver = new MutationObserver((mutations) => {
  // Check if mutations only originate from our own widget to prevent infinite loops
  let isOnlySelf = true;
  for (const m of mutations) {
    const isSelfId = m.target.id && m.target.id.startsWith && m.target.id.startsWith('x-auto-bot');
    const isInsideWidget = m.target.closest && m.target.closest('#x-auto-bot-widget');
    if (!isSelfId && !isInsideWidget) {
      isOnlySelf = false;
      break;
    }
  }
  if (isOnlySelf) return;

  if (domUpdateTimer) clearTimeout(domUpdateTimer);
  domUpdateTimer = setTimeout(() => {
    const now = Date.now();
    
    // UI injections (high priority, bound to DOM renders but throttled to avoid lag)
    if (now - lastUIInjectTime > 400) {
      ensureWidget();
      renderWidget();
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
    
    if (botState.isRunning && botState.petEnabled !== false) {
      checkNewSuggestions();
      checkIdleChat();
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

})();

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
                streamBubble.style.cssText = 'position:fixed;bottom:120px;right:24px;width:320px;background:var(--primary, #0F0F0F);color:#fff;padding:16px;border-radius:16px;z-index:999999;box-shadow:0 12px 40px rgba(0,0,0,0.4);font-size:14px;line-height:1.6;max-height:400px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);white-space:pre-wrap;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
                const header = document.createElement('div');
                header.innerHTML = '<span style="color:#00BA7C;margin-right:8px;">✨</span>AI 正在重新思考...';
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
            chrome.runtime.sendMessage({
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
        streamBubble.style.cssText = 'position:fixed;bottom:120px;right:24px;width:320px;background:var(--primary, #0F0F0F);color:#fff;padding:16px;border-radius:16px;z-index:999999;box-shadow:0 12px 40px rgba(0,0,0,0.4);font-size:14px;line-height:1.6;max-height:400px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);white-space:pre-wrap;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        
        const header = document.createElement('div');
        header.innerHTML = '<span style="color:#00BA7C;margin-right:8px;">✨</span>' + tUI('AI 正在思考...');
        header.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px;font-weight:600;display:flex;align-items:center;';
        streamBubble.appendChild(header);
        
        const content = document.createElement('div');
        content.id = 'stream-bubble-content';
        streamBubble.appendChild(content);
        
        document.body.appendChild(streamBubble);
     }
     const contentEl = streamBubble.querySelector('#stream-bubble-content');
     if (contentEl) {
       contentEl.innerHTML += request.chunk.replace(/\n/g, '<br>');
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
