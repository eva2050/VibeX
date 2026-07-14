// content/x_automator.js
(function() {
'use strict';

console.log("VibeX: Automator loaded on X.com");

const MAX_LOGS = 50;
const POSTING_LOCK_TTL_MS = 20 * 1000;
let isAutomatorBusy = false;
let consecutiveFailures = 0;
let pendingPostRetryTimer = null;
const ReplyFlowState = window.VibeXAutomationState;
const ReplyFlowEvents = ReplyFlowState.EVENTS;

function isFreshPostingLock(state = {}, now = Date.now()) {
  return Boolean(state.isPosting && now - Number(state.isPostingStartedAt || 0) < POSTING_LOCK_TTL_MS);
}

function checkAndPause(pauseFn = pauseAutomation) {
  if (consecutiveFailures >= 2) {
    pauseFn(`连续 ${consecutiveFailures} 次操作失败，请检查当前页面状态后手动点击继续`);
  }
}

function pauseAutomation(reason) {
  addLog('error', reason);
  chrome.storage.local.set({
    isAutoPaused: true,
    pauseReason: reason,
    isPosting: false,
    isPostingStartedAt: 0
  });
  try {
    const result = chrome.runtime.sendMessage({ action: 'postFailed', reason });
    if (result?.catch) result.catch(() => {});
  } catch (e) {
    // Extension context may be gone during reload; local pause state is already written.
  }
}

function pauseReplyAutomation(reason) {
  addLog('error', reason);
  chrome.storage.local.set({
    isAutoPaused: true,
    pauseReason: reason
  });
  notifyReplyFailed(reason);
}

function safeRuntimeMessage(message) {
  try {
    const result = chrome.runtime.sendMessage(message);
    if (result?.catch) result.catch(() => {});
  } catch (e) {
    // Extension context may be gone during reload.
  }
}

function runtimeMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

function notifyReplyFailed(reason) {
  applyReplyFlowEvent(ReplyFlowEvents.REPLY_FAILED, { reason });
  notifyReplyFlowStateVisible();
  safeRuntimeMessage({ action: 'replyFailed', reason });
}

function notifyReplyCompleted(tweetAuthor, tweetContent, replyText) {
  applyReplyFlowEvent(ReplyFlowEvents.REPLY_COMPLETED);
  notifyReplyFlowStateVisible();
  safeRuntimeMessage({
    action: 'replyCompleted',
    tweetAuthor,
    tweetContent,
    replyText
  });
}

function applyReplyFlowEvent(event, payload = {}, extra = {}, callback) {
  ReplyFlowState.applyReplyFlowEvent(chrome.storage.local, event, payload, extra, callback);
}

function notifyReplyFlowStateVisible() {
  window.dispatchEvent(new CustomEvent('xAutoBot_ReplyFlowStateVisible'));
}

function notifyPostCompleted(source, meta = {}) {
  chrome.storage.local.set({ isPosting: false, isPostingStartedAt: 0 });
  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      action: 'postCompleted',
      source: source || 'queue',
      postUrl: meta.postUrl || '',
      statusId: meta.statusId || ''
    }, () => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingScheduledAt']);
      }
      resolve();
    });
  });
}

function schedulePendingPostRetry(reason = '等待当前操作完成后重试发帖', delay = 3000) {
  if (pendingPostRetryTimer) return;
  addLog('info', reason);
  pendingPostRetryTimer = setTimeout(() => {
    pendingPostRetryTimer = null;
    handlePendingPost();
  }, delay);
}

function resumePendingPostIfAny(delay = 1500) {
  chrome.storage.local.get(['pendingPost', 'pendingPostSource', 'isRunning'], (res) => {
    if (res.pendingPost && (res.isRunning || res.pendingPostSource === 'manualTest')) {
      schedulePendingPostRetry('检测到待发推文，当前操作结束后继续发帖', delay);
    }
  });
}

function setLocalStorage(values) {
  return new Promise(resolve => chrome.storage.local.set(values, resolve));
}

function removeLocalStorage(keys) {
  return new Promise(resolve => chrome.storage.local.remove(keys, resolve));
}

function addLog(level, message) {
  if (!chrome.runtime?.id) return;
  const entry = {
    time: Date.now(),
    level: level,
    message: message,
    source: 'automator'
  };
  chrome.storage.local.get(['logs'], (result) => {
    let logs = result.logs || [];
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    chrome.storage.local.set({ logs });
  });
}

function getIntentPostUrl(text) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text || '')}`;
}

function getIntentReplyUrl(statusId, text) {
  return `https://twitter.com/intent/tweet?in_reply_to=${encodeURIComponent(statusId || '')}&text=${encodeURIComponent(text || '')}`;
}

function getIntentParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name) || '';
  } catch (error) {
    return '';
  }
}

function getStatusIdFromHref(href = '') {
  const match = String(href || '').match(/\/status\/(\d+)/);
  return match?.[1] || '';
}

function getTweetStatusHrefFromNode(tweetNode) {
  return tweetNode?.querySelector('a[href*="/status/"]')?.getAttribute('href') || '';
}

function getTweetStatusIdFromNode(tweetNode) {
  const links = Array.from(tweetNode?.querySelectorAll('a[href*="/status/"]') || []);
  const link = links.find(item => item.querySelector('time'))
    || links.find(item => getStatusIdFromHref(item.getAttribute('href') || ''));
  return getStatusIdFromHref(link?.getAttribute('href') || '');
}

function getLatestVisibleStatusMeta() {
  const links = Array.from(document.querySelectorAll('a[href*="/status/"]'))
    .filter(isVisibleElement)
    .map(link => {
      const href = link.getAttribute('href') || '';
      const statusId = getStatusIdFromHref(href);
      if (!statusId) return null;
      const url = href.startsWith('http') ? href : `https://x.com${href}`;
      const rect = link.getBoundingClientRect();
      return { url, statusId, top: rect.top };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(a.top) - Math.abs(b.top));
  return links[0] || { url: '', statusId: '' };
}

function normalizeText(text) {
  return (text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function normalizeComparableText(text) {
  return normalizeText(text)
    .replace(/\s+/g, '')
    .toLowerCase();
}

function hasSubstantialTextMatch(actualText, expectedText) {
  const actual = normalizeText(actualText);
  const expected = normalizeText(expectedText);
  if (!actual || !expected) return false;
  if (actual === expected) return true;

  const actualCompact = normalizeComparableText(actual);
  const expectedCompact = normalizeComparableText(expected);
  if (!actualCompact || !expectedCompact) return false;
  if (actualCompact === expectedCompact) return true;

  const shortestMeaningfulLength = Math.min(60, Math.max(20, Math.floor(expectedCompact.length * 0.35)));
  if (actualCompact.length >= shortestMeaningfulLength && expectedCompact.includes(actualCompact)) return true;
  if (actualCompact.includes(expectedCompact.slice(0, shortestMeaningfulLength))) return true;

  const expectedTokens = expected
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(token => token.length > 2)
    .slice(0, 12);
  if (expectedTokens.length >= 4) {
    const actualLower = actual.toLowerCase();
    const hitCount = expectedTokens.filter(token => actualLower.includes(token)).length;
    return hitCount / expectedTokens.length >= 0.7;
  }

  return false;
}

function getEditorText(element) {
  return normalizeText(element?.innerText || element?.textContent || element?.value || '');
}

function findTweetEditor(scope) {
  const activeDialog = scope ? null : document.querySelector('div[role="dialog"]');
  const root = scope || activeDialog || document;
  const selectors = [
    '[data-testid="tweetTextarea_0"] [contenteditable="true"]',
    '[data-testid="tweetTextarea_0"][contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]'
  ];
  const candidates = [...new Set(selectors.flatMap(selector => Array.from(root.querySelectorAll(selector))))]
    .filter(element => element.isContentEditable && isVisibleElement(element));
  return candidates.find((element) => {
    const label = `${element.getAttribute('aria-label') || ''} ${element.closest('[data-testid="tweetTextarea_0"]') ? 'tweetTextarea' : ''}`;
    return /tweet|post|reply|回复|发帖|发布|tweetTextarea/i.test(label);
  }) || candidates[0] || null;
}

function getIntentComposerDiagnostics() {
  const editorCandidates = Array.from(document.querySelectorAll('[contenteditable="true"], [role="textbox"]'))
    .filter(isVisibleElement);
  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
    .filter(isVisibleElement)
    .map(button => `${button.innerText || ''} ${button.getAttribute('aria-label') || ''}`.trim())
    .filter(Boolean)
    .slice(0, 8);
  const pageText = normalizeText([
    document.querySelector('main')?.innerText || '',
    document.querySelector('#layers')?.innerText || '',
    getToastOrAlertText()
  ].filter(Boolean).join('\n')).slice(0, 180);
  return [
    `url=${window.location.pathname}${window.location.search ? '?...' : ''}`,
    `editors=${editorCandidates.length}`,
    `loggedOutOrBlocked=${isLoggedOutOrBlocked()}`,
    buttons.length ? `buttons=${buttons.join(' | ').slice(0, 140)}` : '',
    pageText ? `page=${pageText}` : ''
  ].filter(Boolean).join(' ; ');
}

function findActiveDialog() {
  const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
  return dialogs.find(dialog => findTweetEditor(dialog)) || dialogs[0] || null;
}

function findSendButton(scope) {
  const root = scope || document;
  return root.querySelector('[data-testid="tweetButton"]')
    || root.querySelector('[data-testid="tweetButtonInline"]')
    || findButtonByText(root, [/^(post|tweet|reply)$/i, /^(发布|发帖|回复)$/]);
}

function isVisibleElement(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findButtonByText(scope, patterns = []) {
  const root = scope || document;
  return Array.from(root.querySelectorAll('button, [role="button"]'))
    .filter(isVisibleElement)
    .find((button) => {
      const text = `${button.innerText || ''} ${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`;
      return patterns.some(pattern => pattern.test(text));
    });
}

function findScheduleButton(scope = document) {
  const root = scope || document;
  return root.querySelector('[data-testid="scheduleOption"]')
    || root.querySelector('button[aria-label*="Schedule"]')
    || root.querySelector('button[aria-label*="定时"]')
    || root.querySelector('button[aria-label*="安排"]')
    || findButtonByText(root, [/schedule/i, /定时|安排|日程/]);
}

function findDraftsButton(scope = document) {
  const root = scope || document;
  return root.querySelector('[data-testid="draftsButton"]')
    || root.querySelector('a[href*="draft"]')
    || root.querySelector('button[aria-label*="Draft"]')
    || root.querySelector('button[aria-label*="草稿"]')
    || findButtonByText(root, [/drafts?/i, /草稿/]);
}

function findComposeButton(scope = document) {
  const root = scope || document;
  return root.querySelector('a[data-testid="SideNav_NewTweet_Button"]')
    || root.querySelector('a[href="/compose/post"]')
    || root.querySelector('[data-testid="FloatingActionButtons_Tweet_Button"]')
    || findButtonByText(root, [/^post$/i, /^tweet$/i, /发帖|发布/]);
}

function findCloseDialogButton(scope = document) {
  const root = scope || document;
  return root.querySelector('[data-testid="app-bar-close"]')
    || root.querySelector('button[aria-label*="Close"]')
    || root.querySelector('button[aria-label*="关闭"]')
    || root.querySelector('button[aria-label*="Back"]')
    || root.querySelector('button[aria-label*="返回"]')
    || findButtonByText(root, [/^close$/i, /^back$/i, /^关闭$/, /^返回$/]);
}

function findDiscardDraftButton(scope = document) {
  return findButtonByText(scope, [
    /^discard$/i,
    /discard (post|tweet|draft)/i,
    /^delete$/i,
    /放弃|舍弃|丢弃|删除草稿|删除帖子|删除推文/
  ]);
}

function parseDraftCountFromText(text = '') {
  const patterns = [
    /Drafts?\s*\(?\s*(\d+)\s*\)?/i,
    /(\d+)\s+Drafts?/i,
    /草稿\s*\(?\s*(\d+)\s*\)?/,
    /(\d+)\s*个?草稿/
  ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

function countDraftRows(scope = document) {
  const textCount = parseDraftCountFromText(scope.innerText || '');
  if (Number.isFinite(textCount)) return textCount;

  const rows = Array.from(scope.querySelectorAll('[data-testid="cellInnerDiv"], [role="listitem"], article, div[role="button"]'))
    .filter(isVisibleElement)
    .filter((row) => {
      const text = (row.innerText || '').trim();
      if (text.length < 4) return false;
      if (/Drafts?|草稿|Close|关闭|Back|返回|Done|完成/i.test(text) && text.length < 18) return false;
      if (/Post|Tweet|发布|发帖|Schedule|定时/i.test(text) && text.length < 18) return false;
      return true;
    });
  return rows.length;
}

async function closeTopDialogIfSafe() {
  const dialog = findActiveDialog();
  if (!dialog) return;
  const editor = findTweetEditor(dialog);
  if (editor && getEditorText(editor)) return;
  const closeButton = findCloseDialogButton(dialog);
  if (closeButton) {
    simulateRealClick(closeButton);
    await sleep(500);
  }
}

async function closeOpenComposerBeforeNavigation(reason = '页面跳转') {
  const dialog = findActiveDialog();
  const editor = dialog ? findTweetEditor(dialog) : findTweetEditor(document);
  if (!dialog && !editor) return true;

  const textBeforeClose = getEditorText(editor);
  const sendButton = dialog ? findSendButton(dialog) : findSendButton(document);
  const hasRealDraft = Boolean(textBeforeClose)
    || Boolean(sendButton && !sendButton.disabled && sendButton.getAttribute('aria-disabled') !== 'true');
  if (!hasRealDraft) return true;

  const closeButton = dialog ? findCloseDialogButton(dialog) : findCloseDialogButton(document);
  if (!closeButton) return false;

  addLog('info', `${reason} 前检测到未发送编辑器，先关闭并丢弃当前草稿`);
  simulateRealClick(closeButton);
  await sleep(800);

  const discardButton = await waitForElement(() => findDiscardDraftButton(document), textBeforeClose ? 4000 : 1200, 250);
  if (discardButton) {
    simulateRealClick(discardButton);
    await sleep(1000);
  }

  const remainingEditor = findTweetEditor(document);
  const remainingText = getEditorText(remainingEditor);
  return !remainingEditor || !remainingText;
}

async function settleComposerAfterSuccessfulSend(expectedText = '', reason = '发送成功后清理编辑器残留') {
  const expected = normalizeText(expectedText);
  for (let i = 0; i < 12; i += 1) {
    const dialog = findActiveDialog();
    const editor = findTweetEditor(dialog || document);
    if (!dialog && !editor) return true;
    await sleep(500);
  }

  const dialog = findActiveDialog();
  const editor = findTweetEditor(dialog || document);
  const editorText = getEditorText(editor);
  if (!dialog && !editor) return true;
  if (editorText && expected && !hasSubstantialTextMatch(editorText, expected)) {
    addLog('warn', `${reason}：检测到不同编辑器内容，保留不自动关闭`);
    return false;
  }

  const closeButton = dialog ? findCloseDialogButton(dialog) : findCloseDialogButton(document);
  if (!closeButton) {
    addLog('warn', `${reason}：未找到关闭按钮，保留页面状态`);
    return false;
  }

  addLog('info', `${reason}：关闭 X 残留编辑器`);
  simulateRealClick(closeButton);
  await sleep(800);

  const discardButton = await waitForElement(() => findDiscardDraftButton(document), editorText ? 2500 : 800, 250);
  if (discardButton) {
    simulateRealClick(discardButton);
    await sleep(800);
  }

  const remainingEditor = findTweetEditor(document);
  const remainingText = getEditorText(remainingEditor);
  return !remainingEditor || !remainingText;
}

async function leaveIntentPostPageAfterSuccess() {
  if (!/\/intent\/(post|tweet)/.test(window.location.pathname) || window.location.search.includes('in_reply_to')) return;
  await new Promise(resolve => chrome.storage.local.set({ botNavigationTime: Date.now() }, resolve));
  window.location.assign('https://x.com/home');
}

async function clickPostSendAndWait(expectedText, isManualTest) {
  const postDialog = findActiveDialog() || document.querySelector('div[role="dialog"]');
  let sendBtn = postDialog ? findSendButton(postDialog) : findSendButton(document);
  if (!sendBtn) {
    sendBtn = await waitForElement(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      return dialog ? findSendButton(dialog) : findSendButton(document);
    }, 5000);
  }

  if (!sendBtn) {
    consecutiveFailures++;
    addLog('error', `未找到发推按钮 (连续失败 ${consecutiveFailures} 次)`);
    checkAndPause();
    return null;
  }

  sendBtn = await waitForEnabledButton(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    return dialog ? findSendButton(dialog) : findSendButton(document);
  }, 10000);

  if (!sendBtn) {
    consecutiveFailures++;
    addLog('error', `发推按钮未自然启用，取消发推 (连续失败 ${consecutiveFailures} 次)`);
    checkAndPause();
    return null;
  }

  const clickResult = await clickElementReliably(sendBtn, '发推按钮');
  let outcome = await waitForIntentSendOutcome(expectedText, 10000);

  if (outcome.status === 'pending' && clickResult?.blockedByOverlay) {
    // The click point was intercepted by something we don't recognize (unknown popup, phone
    // verification, sensitive-content confirm, etc). Retrying the exact same click is unlikely
    // to help and may interact with the wrong element, so skip the blind retry and surface the
    // overlay snapshot instead so it's diagnosable from logs.
    outcome.reason = `${outcome.reason}；发送按钮点击疑似被未知弹窗遮挡（${describeBlockingOverlay(clickResult.overlaySnapshot)}），已跳过盲目重试`;
  } else if (outcome.status === 'pending') {
    const dialog = findActiveDialog();
    const editor = findTweetEditor(dialog || document);
    const retryButton = await waitForEnabledButton(() => {
      const activeDialog = findActiveDialog();
      return activeDialog ? findSendButton(activeDialog) : findSendButton(document);
    }, 2000);

    if (retryButton && hasSubstantialTextMatch(getEditorText(editor), expectedText)) {
      addLog('warn', '首次点击发推后未检测到发送结果，重试一次真实鼠标点击');
      const retryClickResult = await clickElementReliably(retryButton, '发推按钮重试');
      outcome = await waitForIntentSendOutcome(expectedText, 18000);
      if (outcome.status === 'pending' && retryClickResult?.blockedByOverlay) {
        outcome.reason = `${outcome.reason}；重试点击同样被疑似未知弹窗遮挡（${describeBlockingOverlay(retryClickResult.overlaySnapshot)}）`;
      }
    }
  }

  if (!['success', 'duplicate'].includes(outcome.status)) {
    consecutiveFailures++;
    addLog('warn', `发帖未确认成功，已暂停。${outcome.reason} (连续失败 ${consecutiveFailures} 次)`);
    pauseAutomation(`发帖未确认成功，已暂停。${outcome.reason}`);
    return null;
  }

  consecutiveFailures = 0;
  addLog('success', outcome.status === 'duplicate'
    ? `X 提示这条内容已发布过，已消费当前待发任务：${outcome.reason}`
    : (isManualTest ? `测试推文发送成功！${outcome.reason}` : `定时推文发送成功！${outcome.reason}`));
  return outcome;
}

function findMatchingOpenPostComposer(expectedText) {
  const expected = normalizeText(expectedText);
  const editors = [
    ...new Set(Array.from(document.querySelectorAll(
      '[data-testid="tweetTextarea_0"] [contenteditable="true"], [data-testid="tweetTextarea_0"][contenteditable="true"], [role="textbox"][contenteditable="true"]'
    )))
  ].filter(element => element.isContentEditable && isVisibleElement(element));

  for (const editor of editors) {
    const text = getEditorText(editor);
    if (!text || !hasSubstantialTextMatch(text, expected)) continue;
    const dialog = editor.closest('div[role="dialog"]') || document;
    if (dialog?.innerText && /replying to|回复给|正在回复/i.test(dialog.innerText)) continue;
    return { editor, dialog };
  }
  return null;
}

async function safeNavigateTo(url, reason = '页面跳转', options = {}) {
  const result = (success, extra = {}) => options.returnDetails ? { success, ...extra } : success;
  if (!url) return result(false);
  if (window.location.href === url) return result(true, { openedCleanTab: false, samePage: true });
  const closed = await closeOpenComposerBeforeNavigation(reason);
  if (!closed) {
    if (options.openCleanTabOnBlocked) {
      const response = await runtimeMessage({ action: 'openAutomationTab', url, reason }).catch(error => ({
        success: false,
        error: error.message
      }));
      if (response?.success) {
        addLog('warn', `${reason} 前无法自动关闭当前未保存编辑器，已改用新的干净 X 标签页继续`);
        return result(true, { openedCleanTab: true, tabId: response.tabId || null });
      }
    }
    pauseAutomation(`${reason} 前无法自动关闭未保存编辑器，已暂停以避免浏览器离站确认弹窗`);
    return result(false);
  }
  await new Promise(resolve => chrome.storage.local.set({ botNavigationTime: Date.now() }, resolve));
  window.location.assign(url);
  return result(true, { openedCleanTab: false });
}

function getButtonDisabledReason(button) {
  if (!button) return 'button-not-found';
  return [
    button.disabled ? 'disabled=true' : '',
    button.getAttribute('aria-disabled') ? `aria-disabled=${button.getAttribute('aria-disabled')}` : '',
    button.getAttribute('disabled') !== null ? 'disabled-attr' : ''
  ].filter(Boolean).join(', ') || 'unknown';
}

function getToastOrAlertText() {
  const toastText = document.querySelector('div[data-testid="toast"]')?.innerText || '';
  const alertText = document.querySelector('div[role="alert"]')?.innerText || '';
  return toastText + '\n' + alertText;
}

function getVisibleSendError() {
  const text = getToastOrAlertText();
  const patterns = [
    /Something went wrong[^。\n]*/i,
    /Whoops[^。\n]*/i,
    /Try again[^。\n]*/i,
    /You are over the daily limit[^。\n]*/i,
    /Rate limit[^。\n]*/i,
    /出错了[^。\n]*/,
    /出了点问题[^。\n]*/,
    /请稍后再试[^。\n]*/,
    /发送失败[^。\n]*/,
    /无法发送[^。\n]*/
  ];
  const match = patterns.map(pattern => text.match(pattern)?.[0]).find(Boolean);
  return match || '';
}

function getDuplicateSendSignal() {
  const text = getToastOrAlertText();
  const patterns = [
    /You already said that[^。\n]*/i,
    /You already posted that[^。\n]*/i,
    /Whoops[^。\n]*already[^。\n]*/i,
    /已经发过了[^。\n]*/,
    /你已经发过了[^。\n]*/,
    /已经发布过[^。\n]*/,
    /重复内容[^。\n]*/
  ];
  const match = patterns.map(pattern => text.match(pattern)?.[0]).find(Boolean);
  return match || '';
}

function hasSendSuccessSignal() {
  return /Your (post|tweet|reply) was sent|Your post has been sent|Your Tweet has been sent|Post sent|Tweet sent|Reply sent|Post scheduled|Tweet scheduled|Your post was scheduled|Your Tweet was scheduled|你的帖子已发送|你的回复已发送|帖子已发送|回复已发送|已发送你的帖子|已发送你的回复|帖子已定时|推文已定时|已定时发送|已安排发送|已预定发布/i.test(getToastOrAlertText());
}

async function waitForElement(getter, timeout = 8000, interval = 250) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const element = typeof getter === 'function' ? getter() : document.querySelector(getter);
    if (element) return element;
    await sleep(interval);
  }
  return null;
}

async function waitForEnabledButton(getter, timeout = 10000, interval = 500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const button = getter();
    if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
      return button;
    }
    await sleep(interval);
  }
  return null;
}

function isLoggedOutOrBlocked() {
  if (document.querySelector('a[href="/login"], a[href="/i/flow/login"]')) return true;
  if (document.querySelector('iframe[src*="arkoselabs.com"], iframe[src*="FunCaptcha"], iframe[id^="arkose_iframe"]')) return true;

  const layersText = document.getElementById('layers')?.innerText || '';
  const errorDetailText = document.querySelector('div[data-testid="error-detail"]')?.innerText || '';
  const emptyStateText = document.querySelector('div[data-testid="emptyState"]')?.innerText || '';
  
  // We only check for hard blocks here, not transient errors like "Something went wrong" toasts.
  // Those are handled by getVisibleSendError() during the posting flow.
  let textToCheck = errorDetailText + '\n' + emptyStateText;
  
  // If there's no editor or tweet in layers, the layers might contain a captcha or block modal.
  if (!document.querySelector('#layers div[data-testid^="tweetTextarea"]') && !document.querySelector('#layers article[data-testid="tweet"]')) {
    textToCheck += '\n' + layersText;
  }

  return /Sign in to X|Log in to X|登录 X|登录到 X|验证码|Verify your identity|Confirm your identity|验证你的身份|需要验证|captcha/i.test(textToCheck);
}

async function startIntentReplyFlow({ statusId, replyText, tweetAuthor, tweetContent, reason }) {
  if (!statusId) return false;
  addLog('info', `${reason || '开始 X 官方 intent 回复'}，打开官方回复页`);
  const targetUrl = getIntentReplyUrl(statusId, replyText);
  await new Promise(resolve => {
    applyReplyFlowEvent(ReplyFlowEvents.PENDING_REPLY_CREATED, {
      pendingReply: {
        statusId,
        replyText,
        tweetAuthor,
        tweetContent,
        createdAt: Date.now()
      }
    }, {
      isAutoPaused: false,
      pauseReason: ''
    }, (result) => {
      notifyReplyFlowStateVisible();
      resolve(result);
    });
  });
  const navigation = await safeNavigateTo(targetUrl, '打开 X 官方 intent 回复页', {
    openCleanTabOnBlocked: true,
    returnDetails: true
  });
  if (!navigation.success) {
    notifyReplyFailed(`未能打开 X 官方 intent 回复页：${reason || '页面跳转失败'}`);
    return false;
  }
  if (!navigation.openedCleanTab) {
    setTimeout(() => {
      isAutomatorBusy = false;
      handlePendingReply();
    }, 3500);
  } else {
    setTimeout(() => {
      isAutomatorBusy = false;
    }, 1000);
  }
  return true;
}

window.addEventListener('xAutoBot_ReadyToReply', async (e) => {
  if (isAutomatorBusy) {
    addLog('warn', '上一次回复/发推操作尚未完成，跳过本次回复触发');
    return;
  }
  if (!chrome.runtime?.id) return;
  const { tweetElementId, replyText, tweetAuthor, tweetContent, tweetStatusHref, tweetStatusId } = e.detail;
  const author = tweetAuthor || '未知用户';
  const originalText = tweetContent || '';
  let statusId = tweetStatusId || getStatusIdFromHref(tweetStatusHref);
  
  chrome.storage.local.get(['isRunning'], async (result) => {
    if (!result.isRunning) return;

    isAutomatorBusy = true;
    
    // Find the original tweet article element on the page
    let tweetNode = null;
    if (statusId) {
      tweetNode = Array.from(document.querySelectorAll('article')).find(article => {
        return article.querySelector(`a[href*="/status/${statusId}"]`);
      });
    }

    if (!statusId) {
      const reason = `未读取到 @${author} 推文 status id，已跳过自动回复，避免卡在 X 灰色回复按钮`;
      addLog('warn', reason);
      notifyReplyFailed(reason);
      isAutomatorBusy = false;
      return;
    }

    if (tweetNode) {
      // Execute Like and RT with dynamic pacing
      await simulateLikeAndRetweet(tweetNode, e.detail.automationMode);
    }

    // Attempt Native Reply Flow First (Much more reliable and less bot-detectable than intent/tweet)
    if (tweetNode) {
      const replyIconBtn = tweetNode.querySelector('[data-testid="reply"]');
      if (replyIconBtn) {
        addLog('info', `尝试在当前页面原生弹窗回复 @${author}`);
        await clickElementReliably(replyIconBtn, '原生回复图标');
        const draftEditor = await waitForElement(() => {
          const dialog = findActiveDialog();
          return dialog ? findTweetEditor(dialog) : null;
        }, 6000);
        
        if (draftEditor) {
          await sleep(500); // Wait for modal animation
          await simulateTyping(draftEditor, replyText);
          
          let sendBtn = await waitForEnabledButton(() => {
            const dialog = findActiveDialog();
            return dialog ? findSendButton(dialog) : findSendButton(document);
          }, 6000);
          
          if (sendBtn) {
            addLog('info', '原生弹窗输入完成，准备发送');
            await clickElementReliably(sendBtn, '原生回复发送按钮');
            
            // Try Ctrl+Enter fallback immediately just in case
            draftEditor.focus();
            draftEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true }));
            
            const outcome = await waitForIntentSendOutcome(normalizeText(replyText), 12000);
            if (['success', 'duplicate'].includes(outcome.status)) {
              addLog('success', `成功发送回复给 @${author}`);
              notifyReplyCompleted(author, originalText, replyText);
              isAutomatorBusy = false;
              
              // Close modal if still open
              const closeBtn = findCloseDialogButton(findActiveDialog());
              if (closeBtn) simulateRealClick(closeBtn);
              return;
            } else {
              addLog('warn', `原生回复发送失败: ${outcome.reason}`);
            }
          }
          
          // Close the modal and discard draft if we failed so we can fallback cleanly
          await closeOpenComposerBeforeNavigation('清理原生回复异常草稿');
        }
      }
    }

    // Fallback to Intent Flow if Native Flow failed or tweetNode wasn't found
    addLog('warn', '原生回复失败，回退到 Intent 页面模式');
    const intentStarted = await startIntentReplyFlow({
      statusId,
      replyText,
      tweetAuthor: author,
      tweetContent: originalText,
      reason: `准备通过 X 官方 intent 回复 @${author}`
    });
    if (!intentStarted) {
      isAutomatorBusy = false;
    }
  });
});

async function simulateLikeAndRetweet(tweetNode, mode) {
  if (mode !== 'autoEngage' && mode !== 'autoReply') return;
  
  const now = Date.now();
  const res = await new Promise(resolve => chrome.storage.local.get(['lastLikeTime', 'lastRtTime'], resolve));
  const lastLikeTime = res.lastLikeTime || 0;
  const lastRtTime = res.lastRtTime || 0;
  
  // Like Logic (10-20 per 10h -> 1 every 30-60 mins)
  const minLikeWait = 30 * 60000;
  if (now - lastLikeTime > minLikeWait) {
    // 50% chance if we've passed the minimum wait, to randomize it more up to 60 mins
    if (Math.random() > 0.5 || now - lastLikeTime > 60 * 60000) {
      const likeBtn = tweetNode.querySelector('[data-testid="like"]');
      if (likeBtn) {
        await clickElementReliably(likeBtn, '自动点赞');
        addLog('info', '自动点赞触发');
        chrome.storage.local.set({ lastLikeTime: now });
        await sleep(Math.floor(Math.random() * 800) + 500);
      }
    }
  }

  // RT Logic (Max 1 per 10h)
  if (mode === 'autoEngage') {
    const minRtWait = 10 * 60 * 60000; // 10 hours
    if (now - lastRtTime > minRtWait) {
      const rtBtn = tweetNode.querySelector('[data-testid="retweet"]');
      if (rtBtn) {
        await clickElementReliably(rtBtn, '自动转推');
        addLog('info', '自动转推触发');
        chrome.storage.local.set({ lastRtTime: now });
        await sleep(Math.floor(Math.random() * 500) + 300);
        
        // Wait for dropdown and click confirm
        const rtConfirm = document.querySelector('[data-testid="retweetConfirm"]');
        if (rtConfirm) {
          await clickElementReliably(rtConfirm, '确认转推');
        }
        await sleep(Math.floor(Math.random() * 800) + 500);
      }
    }
  }
}

async function simulateTyping(element, text) {
  const normalized = normalizeText(text);
  const methods = [
    insertByPasteEvent,      // Prioritize paste (most reliable for React/Draft.js hydration)
    insertByExecCommand,
    insertByKeyboardEvents
  ];
  if (!element.isContentEditable) methods.push(insertByDirectInput);

  for (const method of methods) {
    try {
      await method(element, normalized);
      await sleep(650);
      if (getEditorText(element) === normalized) {
        await nudgeEditorState(element);
        await sleep(1200);
        return;
      }
    } catch (error) {
      addLog('warn', `输入方法失败，尝试下一种: ${error.message}`);
    }
  }

  await sleep(1200);
}

function setEditorSelection(element, selectAll = false) {
  if (!element) return;
  element.focus();
  if (!element.isContentEditable) {
    if (selectAll) {
      element.setSelectionRange?.(0, element.value?.length || 0);
    }
    return;
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  if (!selectAll) range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

async function prepareEditor(element) {
  element.focus();
  element.click();
  await sleep(120);
  setEditorSelection(element, true);
  try {
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
  } catch (e) {
    // Some pages block execCommand; fallback methods below still run.
  }
  if (!element.isContentEditable) {
    element.value = '';
  }
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
  setEditorSelection(element, false);
}

async function insertByKeyboardEvents(element, text) {
  await prepareEditor(element);
  for (const char of Array.from(text)) {
    const keyEventInit = {
      bubbles: true,
      cancelable: true,
      key: char,
      code: char === '\n' ? 'Enter' : undefined
    };
    element.dispatchEvent(new KeyboardEvent('keydown', keyEventInit));
    element.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: char === '\n' ? 'insertLineBreak' : 'insertText',
      data: char === '\n' ? null : char
    }));
    document.execCommand('insertText', false, char);
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: char === '\n' ? 'insertLineBreak' : 'insertText',
      data: char === '\n' ? null : char
    }));
    element.dispatchEvent(new KeyboardEvent('keyup', keyEventInit));
    await sleep(8);
  }
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function insertByExecCommand(element, text) {
  await prepareEditor(element);
  setEditorSelection(element, false);
  document.execCommand('insertText', false, text);
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function insertByPasteEvent(element, text) {
  await prepareEditor(element);
  setEditorSelection(element, false);
  const data = new DataTransfer();
  data.setData('text/plain', text);
  const pasteEvent = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: data
  });
  element.dispatchEvent(pasteEvent);
  if (getEditorText(element) !== text) {
    document.execCommand('insertText', false, text);
  }
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function insertByDirectInput(element, text) {
  if (element.isContentEditable) {
    throw new Error('跳过 contenteditable 的直接 DOM 写入，避免 X 显示假文本但按钮不可发');
  }
  await prepareEditor(element);
  element.value = text;
  element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: text }));
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function nudgeEditorState(element) {
  if (!element || !element.isContentEditable) return;
  setEditorSelection(element, false);
  const before = getEditorText(element);
  try {
    document.execCommand('insertText', false, ' ');
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
    document.execCommand('delete', false, null);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
  } catch (e) {
    // Best-effort nudge only.
  }
  if (getEditorText(element) !== before) {
    await insertByExecCommand(element, before);
  }
}

function simulateRealClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  
  const eventInit = { 
    bubbles: true, 
    cancelable: true, 
    view: window,
    clientX: x,
    clientY: y
  };
  
  element.dispatchEvent(new PointerEvent('pointerdown', eventInit));
  element.dispatchEvent(new MouseEvent('mousedown', eventInit));
  element.dispatchEvent(new PointerEvent('pointerup', eventInit));
  element.dispatchEvent(new MouseEvent('mouseup', eventInit));
  element.dispatchEvent(new MouseEvent('click', eventInit));
  element.click?.();
}

function findBlockingOverlayAt(x, y, expectedElement) {
  // Generic fallback for X pop-ups we don't explicitly know about yet (phone verification,
  // sensitive-content confirm, new throttle dialogs, etc). If the topmost element at the
  // click point is not the button we intend to click (and not one of its ancestors/descendants),
  // something else is very likely intercepting the click.
  let topEl;
  try {
    topEl = document.elementFromPoint(x, y);
  } catch (e) {
    return null;
  }
  if (!topEl) return null;
  if (topEl === expectedElement) return null;
  if (expectedElement && (expectedElement.contains?.(topEl) || topEl.contains?.(expectedElement))) return null;

  let node = topEl;
  let dialogAncestor = null;
  while (node && node !== document.body) {
    const role = node.getAttribute?.('role');
    if (role === 'dialog' || role === 'alertdialog') {
      dialogAncestor = node;
      break;
    }
    node = node.parentElement;
  }
  const container = dialogAncestor || topEl;
  const text = normalizeText(container.innerText || '').slice(0, 160);
  return {
    tag: topEl.tagName || '',
    testId: topEl.getAttribute?.('data-testid') || container.getAttribute?.('data-testid') || '',
    role: container.getAttribute?.('role') || '',
    text
  };
}

function describeBlockingOverlay(overlay) {
  if (!overlay) return '';
  return `role=${overlay.role || 'n/a'} testid=${overlay.testId || 'n/a'} text="${overlay.text || ''}"`;
}

async function clickElementReliably(element, label = '按钮') {
  if (!element) throw new Error(`${label} 不存在`);
  element.scrollIntoView?.({ block: 'center', inline: 'center' });
  element.focus?.();
  await sleep(150);

  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const blockingOverlay = findBlockingOverlayAt(x, y, element);
  if (blockingOverlay) {
    addLog('warn', `${label} 点击位置疑似被未知弹窗/元素遮挡：${describeBlockingOverlay(blockingOverlay)}`);
  }

  const response = await runtimeMessage({ action: 'trustedClick', x, y }).catch(error => ({
    success: false,
    error: error.message
  }));

  if (response?.success) {
    addLog('info', `已通过 Chrome 真实鼠标事件点击${label}`);
    await sleep(450);
    return { blockedByOverlay: Boolean(blockingOverlay), overlaySnapshot: blockingOverlay };
  }

  addLog('warn', `真实鼠标事件点击失败，回退 DOM 点击${label}: ${response?.error || 'unknown'}`);
  simulateRealClick(element);
  await sleep(450);
  return { blockedByOverlay: Boolean(blockingOverlay), overlaySnapshot: blockingOverlay };
}

async function waitForIntentSendOutcome(expectedText, timeout = 18000) {
  const startedAt = Date.now();
  let sawSendingState = false;

  while (Date.now() - startedAt < timeout) {
    const duplicate = getDuplicateSendSignal();
    if (duplicate) {
      return { status: 'duplicate', reason: duplicate };
    }

    const error = getVisibleSendError();
    if (error) {
      return { status: 'failed', reason: error };
    }

    if (isLoggedOutOrBlocked()) {
      return { status: 'failed', reason: '触发了机器验证 (Captcha) 或被限制拦截，发送失败' };
    }

    if (hasSendSuccessSignal()) {
      return { status: 'success', reason: '检测到 X 发送成功提示' };
    }

    const dialog = findActiveDialog();
    const editor = findTweetEditor(dialog || document);
    const button = dialog ? findSendButton(dialog) : findSendButton(document);
    const editorText = getEditorText(editor);
    const buttonDisabled = button?.disabled || button?.getAttribute('aria-disabled') === 'true';
    if (buttonDisabled) sawSendingState = true;

    if (!editor && !dialog) {
      return { status: 'success', reason: '编辑器已关闭' };
    }
    if (sawSendingState && editor && editorText.length < 5) {
      return { status: 'success', reason: '编辑器内容已清空' };
    }
    if (sawSendingState && !button && (!editor || editorText.length < 5)) {
      return { status: 'success', reason: '发送按钮消失且编辑器已清空' };
    }

    await sleep(500);
  }

  const dialog = findActiveDialog();
  const editor = findTweetEditor(dialog || document);
  const button = dialog ? findSendButton(dialog) : findSendButton(document);
  const editorText = getEditorText(editor);
  return {
    status: 'pending',
    reason: `未检测到成功或失败提示；编辑器${editor ? '仍在' : '不在'}，文本「${editorText.substring(0, 40)}」，按钮状态 ${getButtonDisabledReason(button)}`
  };
}

function dispatchFormEvents(element) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectOptionByCandidates(select, candidates = []) {
  const normalized = candidates.map(value => String(value).toLowerCase());
  const option = Array.from(select.options || []).find((item) => {
    const text = String(item.textContent || '').trim().toLowerCase();
    const value = String(item.value || '').trim().toLowerCase();
    return normalized.some(candidate => text === candidate || value === candidate || text.includes(candidate));
  });
  if (!option) return false;
  select.value = option.value;
  dispatchFormEvents(select);
  return true;
}

function classifyScheduleSelect(select) {
  const label = `${select.getAttribute('aria-label') || ''} ${select.name || ''} ${select.id || ''}`.toLowerCase();
  const optionsText = Array.from(select.options || []).map(option => option.textContent || option.value || '').join(' ').toLowerCase();
  if (/month|月|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/.test(label + optionsText)) return 'month';
  if (/year|年/.test(label) || /\b20\d{2}\b/.test(optionsText)) return 'year';
  if (/day|日|号/.test(label)) return 'day';
  if (/hour|时|点/.test(label)) return 'hour';
  if (/minute|分/.test(label)) return 'minute';
  if (/am|pm|上午|下午/.test(label + optionsText)) return 'ampm';
  return '';
}

function fillNativeSelectSchedule(dialog, scheduledAt) {
  const selects = Array.from(dialog.querySelectorAll('select')).filter(isVisibleElement);
  if (selects.length < 3) return false;

  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const shortMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = scheduledAt.getMonth() + 1;
  const day = scheduledAt.getDate();
  const year = scheduledAt.getFullYear();
  const hour24 = scheduledAt.getHours();
  const hour12 = hour24 % 12 || 12;
  const minute = scheduledAt.getMinutes();
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const used = new Set();

  const setByType = (type, candidates) => {
    const select = selects.find(item => !used.has(item) && classifyScheduleSelect(item) === type);
    if (!select) return false;
    const ok = selectOptionByCandidates(select, candidates);
    if (ok) used.add(select);
    return ok;
  };

  setByType('month', [month, String(month), String(month).padStart(2, '0'), monthNames[month - 1], shortMonthNames[month - 1], `${month}月`]);
  setByType('day', [day, String(day), String(day).padStart(2, '0')]);
  setByType('year', [year, String(year)]);
  setByType('hour', [hour12, hour24, String(hour12), String(hour24).padStart(2, '0')]);
  setByType('minute', [minute, String(minute).padStart(2, '0'), String(minute)]);
  setByType('ampm', [ampm, ampm.toLowerCase(), ampm === 'AM' ? '上午' : '下午']);

  const remaining = selects.filter(item => !used.has(item));
  const fallbackValues = [
    [month, String(month), String(month).padStart(2, '0'), monthNames[month - 1], shortMonthNames[month - 1], `${month}月`],
    [day, String(day), String(day).padStart(2, '0')],
    [year, String(year)],
    [hour12, hour24, String(hour12), String(hour24).padStart(2, '0')],
    [minute, String(minute).padStart(2, '0'), String(minute)],
    [ampm, ampm.toLowerCase(), ampm === 'AM' ? '上午' : '下午']
  ];
  remaining.forEach((select, index) => {
    selectOptionByCandidates(select, fallbackValues[index] || []);
  });

  return true;
}

function fillNativeInputSchedule(dialog, scheduledAt) {
  const inputs = Array.from(dialog.querySelectorAll('input')).filter(isVisibleElement);
  if (inputs.length === 0) return false;
  const dateValue = scheduledAt.toISOString().slice(0, 10);
  const timeValue = `${String(scheduledAt.getHours()).padStart(2, '0')}:${String(scheduledAt.getMinutes()).padStart(2, '0')}`;
  let touched = false;

  inputs.forEach((input) => {
    const label = `${input.type || ''} ${input.getAttribute('aria-label') || ''} ${input.name || ''} ${input.placeholder || ''}`.toLowerCase();
    if (/date|日期/.test(label)) {
      input.value = dateValue;
      dispatchFormEvents(input);
      touched = true;
    } else if (/time|时间|hour|minute|小时|分钟/.test(label)) {
      input.value = timeValue;
      dispatchFormEvents(input);
      touched = true;
    }
  });
  return touched;
}

async function applyNativeSchedule(scheduledAt) {
  const scheduleDate = new Date(Number(scheduledAt));
  if (!Number.isFinite(scheduleDate.getTime())) {
    pauseAutomation('X 定时发布时间无效，已暂停');
    return false;
  }

  const scheduleBtn = await waitForElement(() => findScheduleButton(document), 8000);
  if (!scheduleBtn) {
    pauseAutomation('未找到 X 定时发布按钮，无法写入原生定时发布');
    return false;
  }
  simulateRealClick(scheduleBtn);
  addLog('info', '已打开 X 定时发布面板');
  await sleep(1200);

  const scheduleDialog = await waitForElement(() => {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    return dialogs.find(dialog => /schedule|定时|安排|日程|date|time|日期|时间/i.test(dialog.innerText || ''));
  }, 8000);
  if (!scheduleDialog) {
    pauseAutomation('未找到 X 定时发布弹窗，已暂停');
    return false;
  }

  const selected = fillNativeSelectSchedule(scheduleDialog, scheduleDate) || fillNativeInputSchedule(scheduleDialog, scheduleDate);
  if (!selected) {
    pauseAutomation('无法识别 X 定时发布日期/时间控件，已暂停');
    return false;
  }
  addLog('info', `已填写 X 定时发布时间：${scheduleDate.toLocaleString()}`);
  await sleep(500);

  const confirmBtn = findButtonByText(scheduleDialog, [/confirm/i, /done/i, /schedule/i, /确认|完成|设定|安排|定时/]);
  if (!confirmBtn) {
    pauseAutomation('未找到 X 定时发布时间确认按钮，已暂停');
    return false;
  }
  simulateRealClick(confirmBtn);
  addLog('info', '已确认 X 定时发布时间');
  await sleep(1500);
  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "postNewTweet") {
    addLog('info', '收到后台发推指令');
    handlePendingPost();
    sendResponse({ success: true });

  }
});

// Run once on load in case the tab was newly opened by background
setTimeout(() => {
  chrome.storage.local.get(['pendingReply', 'pendingPost'], (res) => {
    // If both exist, use URL to decide priority to prevent auto-posts from hijacking reply pages
    const hasReplyIntent = window.location.search.includes('in_reply_to') || window.location.search.includes(res.pendingReply?.statusId);
    if (res.pendingReply && (hasReplyIntent || !res.pendingPost)) {
      handlePendingReply();
    } else if (res.pendingPost) {
      handlePendingPost();
    }
  });
}, 3000);

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') return;
  if (changes.pendingPost?.newValue && changes.pendingPost.newValue !== changes.pendingPost.oldValue) {
    schedulePendingPostRetry('检测到新的待发推文，准备执行发帖', 800);
  }
});

async function handlePendingReply() {
  if (isAutomatorBusy) {
    addLog('warn', '上一次回复/发推操作尚未完成，跳过本次 intent 回复触发');
    return;
  }
  if (!chrome.runtime?.id) return;

  chrome.storage.local.get(['pendingReply', 'isRunning'], async (result) => {
    const pending = result.pendingReply;
    if (!pending?.replyText || !pending?.statusId) return;
    if (!result.isRunning) {
      addLog('info', '机器人已停止，跳过 intent 回复');
      return;
    }

    isAutomatorBusy = true;
    applyReplyFlowEvent(ReplyFlowEvents.SENDING_STARTED, { pendingReply: pending });

    try {
      if (isLoggedOutOrBlocked()) {
        pauseReplyAutomation('X 页面可能未登录、报错或出现验证，已暂停回复');
        return;
      }

      const isReplyIntentPage = /\/intent\/(tweet|post)/.test(window.location.pathname)
        && (window.location.search.includes('in_reply_to') || window.location.search.includes(pending.statusId));
      if (!isReplyIntentPage) {
        addLog('info', '打开 X 官方 intent 回复页');
        await safeNavigateTo(getIntentReplyUrl(pending.statusId, pending.replyText), '打开 X 官方 intent 回复页', { openCleanTabOnBlocked: true });
        return;
      }

      const intentText = getIntentParam('text');
      const replyTextForSend = intentText || pending.replyText;
      const expectedText = normalizeText(replyTextForSend);
      if (!expectedText) {
        pauseReplyAutomation('X intent 回复文本为空，已暂停');
        return;
      }
      if (intentText && normalizeText(intentText) !== normalizeText(pending.replyText)) {
        addLog('warn', '检测到本地待回复缓存与 X intent 文本不一致，已以页面 URL 预填文本为准');
      }

      const draftEditor = await waitForElement(findTweetEditor, 10000);
      if (!draftEditor) {
        const diagnostics = getIntentComposerDiagnostics();
        addLog('warn', `X intent 回复编辑器诊断: ${diagnostics}`);
        pauseReplyAutomation(`未找到 X intent 回复编辑器，已暂停。${diagnostics}`);
        return;
      }

      let actualText = getEditorText(draftEditor);
      if (!hasSubstantialTextMatch(actualText, expectedText)) {
        addLog('warn', `intent 回复预填文本暂未匹配，等待 X 渲染。当前: ${actualText.substring(0, 40)}...`);
        await sleep(1200);
        actualText = getEditorText(draftEditor);
      }

      if (!hasSubstantialTextMatch(actualText, expectedText)) {
        addLog('warn', 'X intent 未完成预填，尝试一次真实编辑器输入');
        await simulateTyping(draftEditor, replyTextForSend);
        await sleep(1200);
        actualText = getEditorText(draftEditor);
      }

      // Relaxed validation: X may format URLs, emojis, or spaces differently.
      // We check if actualText has substantial content. If it's mostly empty, it failed.
      const isValidationFailed = actualText.length < Math.min(expectedText.length * 0.5, 5);
      
      if (isValidationFailed) {
        addLog('warn', `X intent 回复文本校验严重不匹配。期望「${expectedText.substring(0, 40)}...」，实际「${actualText.substring(0, 40)}...」`);
        await closeOpenComposerBeforeNavigation('清理残留幽灵草稿');
        throw new Error('预填文本校验严重不匹配，已自动清理残留草稿，等待下一轮重试');
      }

      let sendBtn = await waitForEnabledButton(() => {
        const dialog = findActiveDialog();
        return dialog ? findSendButton(dialog) : findSendButton(document);
      }, 12000);

      if (!sendBtn) {
        const dialog = findActiveDialog();
        const currentButton = dialog ? findSendButton(dialog) : findSendButton(document);
        pauseReplyAutomation(`X intent 回复按钮未启用，已暂停。按钮状态 ${getButtonDisabledReason(currentButton)}`);
        return;
      }

      const clickResult = await clickElementReliably(sendBtn, 'X intent 回复按钮');
      let outcome = await waitForIntentSendOutcome(expectedText, 7000);

      if (outcome.status === 'pending' && clickResult?.blockedByOverlay) {
        // Same defensive logic as the post flow: don't blindly retry into an overlay we can't
        // identify. Surface it in the pause reason so it's actionable from logs.
        outcome.reason = `${outcome.reason}；发送按钮点击疑似被未知弹窗遮挡（${describeBlockingOverlay(clickResult.overlaySnapshot)}），已跳过盲目重试`;
      } else if (outcome.status === 'pending') {
        const dialog = findActiveDialog();
        const editor = findTweetEditor(dialog || document);
        
        if (editor) {
          addLog('warn', '首次点击后未检测到发送结果，尝试模拟 Ctrl+Enter 发送');
          editor.focus();
          editor.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            ctrlKey: true,
            metaKey: true,
            bubbles: true,
            cancelable: true
          }));
          await sleep(1500);
        }

        const retryButton = await waitForEnabledButton(() => {
          const activeDialog = findActiveDialog();
          return activeDialog ? findSendButton(activeDialog) : findSendButton(document);
        }, 2000);

        if (retryButton && hasSubstantialTextMatch(getEditorText(editor), expectedText)) {
          addLog('warn', 'Ctrl+Enter 后仍未发送，最后重试一次真实鼠标点击');
          const retryClickResult = await clickElementReliably(retryButton, 'X intent 回复按钮重试');
          outcome = await waitForIntentSendOutcome(expectedText, 18000);
          if (outcome.status === 'pending' && retryClickResult?.blockedByOverlay) {
            outcome.reason = `${outcome.reason}；重试点击同样被疑似未知弹窗遮挡（${describeBlockingOverlay(retryClickResult.overlaySnapshot)}）`;
          }
        } else {
          outcome = await waitForIntentSendOutcome(expectedText, 18000);
        }
      }

      if (!['success', 'duplicate'].includes(outcome.status)) {
        pauseReplyAutomation(`X intent 回复未确认成功，已暂停。${outcome.reason}`);
        return;
      }

      consecutiveFailures = 0;
      await removeLocalStorage(['pendingReply']);
      if (outcome.status === 'duplicate') {
        await closeOpenComposerBeforeNavigation('清理重复回复编辑器');
      } else {
        await settleComposerAfterSuccessfulSend(expectedText, '回复发送成功后清理编辑器残留');
      }
      addLog('success', outcome.status === 'duplicate'
        ? `X 提示已回复过 @${pending.tweetAuthor || '未知用户'}，已按完成处理：${outcome.reason}`
        : `已通过 X 官方 intent 回复 @${pending.tweetAuthor || '未知用户'}：${outcome.reason}`);
      notifyReplyCompleted(pending.tweetAuthor || '未知用户', pending.tweetContent || '', replyTextForSend);
    } catch (error) {
      consecutiveFailures++;
      const reason = `X intent 自动回复异常: ${error.message} (连续失败 ${consecutiveFailures} 次)`;
      addLog('error', reason);
      notifyReplyFailed(reason);
      checkAndPause(pauseReplyAutomation);
    } finally {
      isAutomatorBusy = false;
      resumePendingPostIfAny();
    }
  });
}

async function handlePendingPost() {
  if (isAutomatorBusy) {
    addLog('warn', '上一次回复/发推操作尚未完成，跳过本次发推触发');
    schedulePendingPostRetry('上一次回复/发推操作尚未完成，稍后重试发帖');
    return;
  }
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(['pendingPost', 'pendingPostSource', 'isRunning', 'isPosting', 'isPostingStartedAt'], async (result) => {
    const isManualTest = result.pendingPostSource === 'manualTest';
    if (!result.isRunning && !isManualTest) {
      addLog('info', '机器人已停止，跳过发推');
      return;
    }
    if (!result.pendingPost) {
      return;
    }
    if (isFreshPostingLock(result)) {
      addLog('info', '已有发帖流程在执行，跳过重复触发');
      return;
    }
    
    isAutomatorBusy = true;
    const postText = String(result.pendingPost || '').trim();
    const expectedText = normalizeText(postText);
    
    addLog('info', isManualTest ? '开始执行测试发文...' : '开始执行定时发文...');
    chrome.storage.local.set({ isPosting: true, isPostingStartedAt: Date.now() });
    try {
      if (!postText) {
        pauseAutomation('待发推文为空，已暂停');
        return;
      }

      if (isLoggedOutOrBlocked()) {
        pauseAutomation('X 页面可能未登录、报错或出现验证，已暂停发推');
        return;
      }

      const openComposer = findMatchingOpenPostComposer(expectedText);
      if (openComposer) {
        addLog('info', '检测到已打开且文本匹配的发帖编辑器，直接接管发送');
        const outcome = await clickPostSendAndWait(expectedText, isManualTest);
        if (!outcome) return;
        if (outcome.status === 'duplicate') {
          await closeOpenComposerBeforeNavigation('清理重复发布编辑器');
        } else {
          await settleComposerAfterSuccessfulSend(expectedText, '发帖成功后清理编辑器残留');
        }
        await notifyPostCompleted(result.pendingPostSource || 'queue', getLatestVisibleStatusMeta());
        await leaveIntentPostPageAfterSuccess();
        return;
      }

      if (!window.location.pathname.includes('/intent/post') || window.location.search.includes('in_reply_to')) {
        addLog('info', '使用 X intent/post 预填推文，避免中文输入法或上下文污染');
        await safeNavigateTo(getIntentPostUrl(postText), '打开 X intent/post 发帖页', { openCleanTabOnBlocked: true });
        return;
      }

      const draftEditor = await waitForElement(findTweetEditor, 10000);
      if (!draftEditor) {
        pauseAutomation('未找到 intent/post 推文编辑器，已暂停');
        return;
      }

      let actualText = getEditorText(draftEditor);
      if (!hasSubstantialTextMatch(actualText, expectedText)) {
        addLog('warn', `预填文本暂未匹配，等待 X 渲染。当前: ${actualText.substring(0, 40)}...`);
        await sleep(1200);
        actualText = getEditorText(draftEditor);
      }

      if (!hasSubstantialTextMatch(actualText, expectedText)) {
        addLog('warn', 'X intent 未完成预填，尝试一次真实编辑器输入');
        await simulateTyping(draftEditor, postText);
        await sleep(1200);
        actualText = getEditorText(draftEditor);
      }

      // Relaxed validation: X may format URLs, emojis, or spaces differently.
      // We check if actualText has substantial content. If it's mostly empty, it failed.
      const isValidationFailed = actualText.length < Math.min(expectedText.length * 0.5, 5);
      
      if (isValidationFailed) {
        addLog('warn', `预填文本校验严重不匹配。期望「${expectedText.substring(0, 40)}...」，实际「${actualText.substring(0, 40)}...」`);
        await closeOpenComposerBeforeNavigation('清理残留幽灵草稿');
        throw new Error('预填文本校验严重不匹配，已自动清理残留草稿，等待下一轮重试');
      }

      addLog('success', `推文文本校验通过 (${postText.length} 字)`);
      const duplicateBeforeClick = getDuplicateSendSignal();
      if (duplicateBeforeClick) {
        consecutiveFailures = 0;
        addLog('success', `X 提示这条内容已发布过，已消费当前待发任务：${duplicateBeforeClick}`);
        await closeOpenComposerBeforeNavigation('清理重复发布编辑器');
        await notifyPostCompleted(result.pendingPostSource || 'queue', getLatestVisibleStatusMeta());
        await leaveIntentPostPageAfterSuccess();
        return;
      }



      const outcome = await clickPostSendAndWait(expectedText, isManualTest);
      if (!outcome) return;
      if (outcome.status === 'duplicate') {
        await closeOpenComposerBeforeNavigation('清理重复发布编辑器');
      } else {
        await settleComposerAfterSuccessfulSend(expectedText, '发帖成功后清理编辑器残留');
      }
      await notifyPostCompleted(result.pendingPostSource || 'queue', getLatestVisibleStatusMeta());
      await leaveIntentPostPageAfterSuccess();
      
    } catch (e) {
      consecutiveFailures++;
      addLog('error', `定时发文异常: ${e.message} (连续失败 ${consecutiveFailures} 次)`);
      checkAndPause();
      if (consecutiveFailures < 2) {
        addLog('info', '等待 5 秒后在当前页面执行本地重试...');
        setTimeout(handlePendingPost, 5000);
      }
    } finally {
      chrome.storage.local.set({ isPosting: false, isPostingStartedAt: 0 });
      isAutomatorBusy = false;
    }
  });
}

async function readXOfficialDraftCount() {
  if (isAutomatorBusy) throw new Error('Agent 正在执行发布/回复，稍后再读取 X 草稿');
  if (isLoggedOutOrBlocked()) throw new Error('X 页面未登录或正在验证，无法读取官方草稿');

  isAutomatorBusy = true;
  chrome.storage.local.set({
    xOfficialDraftStatus: 'reading',
    xOfficialDraftError: ''
  });

  try {
    const existingDraftButton = findDraftsButton(document);
    if (!existingDraftButton) {
      const composeBtn = findComposeButton(document);
      if (composeBtn) {
        simulateRealClick(composeBtn);
      } else {
        const opened = await safeNavigateTo('https://x.com/compose/post', '打开 X compose 读取草稿');
        if (!opened) {
          throw new Error('打开 X compose 读取草稿前无法关闭当前未发送编辑器');
        }
      }
      await sleep(1800);
    }

    const dialog = await waitForElement(findActiveDialog, 8000);
    const draftButton = findDraftsButton(dialog || document);
    if (!draftButton) {
      await closeTopDialogIfSafe();
      chrome.storage.local.set({
        xOfficialDraftCount: 0,
        xOfficialDraftStatus: 'success',
        xOfficialDraftError: '',
        xOfficialDraftReadAt: Date.now()
      });
      addLog('info', '未发现 X Drafts 入口，按 0 个官方草稿处理');
      return 0;
    }

    const buttonCount = parseDraftCountFromText(`${draftButton.innerText || ''} ${draftButton.getAttribute('aria-label') || ''}`);
    simulateRealClick(draftButton);
    await sleep(1500);

    const draftDialog = await waitForElement(() => {
      const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
      return dialogs.find(item => /Drafts?|草稿/i.test(item.innerText || '')) || dialogs[0];
    }, 8000);

    const count = Number.isFinite(buttonCount) ? buttonCount : countDraftRows(draftDialog || document);
    chrome.storage.local.set({
      xOfficialDraftCount: count,
      xOfficialDraftStatus: 'success',
      xOfficialDraftError: '',
      xOfficialDraftReadAt: Date.now()
    });
    addLog('success', `已读取 X 官方草稿数量：${count}`);
    await closeTopDialogIfSafe();
    return count;
  } catch (error) {
    chrome.storage.local.set({
      xOfficialDraftStatus: 'failed',
      xOfficialDraftError: error.message,
      xOfficialDraftReadAt: Date.now()
    });
    addLog('error', `读取 X 官方草稿失败: ${error.message}`);
    throw error;
  } finally {
    isAutomatorBusy = false;
  }
}

})();
