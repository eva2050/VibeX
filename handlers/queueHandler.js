import { formatTweetForX } from '../utils/textUtils.js';
import { addLog } from '../core/state.js';
import { REPLY_RETRY_LOCK_MS } from '../core/constants.js';
import '../core/automationState.js';

const { EVENTS: REPLY_FLOW_EVENTS, buildReplyFlowTransition, hasActiveReplyFlow, REPLY_FLOW_STORAGE_KEYS } = globalThis.VibeXAutomationState;

export function handleQueueMessage(request, sender, sendResponse, context) {
  if (request.action === "queueUpdated") {
    context.checkAndSetupAlarm();
    sendResponse({ success: true });
    return false;
  } else if (request.action === "testPostNow") {
    const text = formatTweetForX(request.text || '');
    if (!text) {
      sendResponse({ success: false, error: '测试发帖内容为空' });
      return false;
    }
    chrome.storage.local.get(['pendingPost', ...REPLY_FLOW_STORAGE_KEYS], (existing) => {
      if (existing.pendingPost) {
        sendResponse({ success: false, error: '已有待发送推文，请先处理完成或停止自动化后再测试' });
        return;
      }
      // Manual "test post" shares the same X tab/DOM as the auto-reply flow.
      // Reuse the same reply-flow-busy guard that background.js#executeNextPost
      // already applies to scheduled posts, so a manual test can't collide
      // with an in-flight auto-reply the way scheduled posts could before.
      if (hasActiveReplyFlow(existing)) {
        sendResponse({ success: false, error: '检测到自动回复正在进行中，请稍后再测试发帖，避免和回复流程冲突' });
        return;
      }
      chrome.storage.local.set({
        pendingPost: text,
        pendingPostId: null,
        pendingPostSource: 'manualTest',
        pendingScheduledAt: null,
        isPosting: false,
        isAutoPaused: false,
        pauseReason: ''
      }, () => {
        addLog('info', 'manual_test_post_request');
        context.triggerPostInTab();
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "postCompleted") {
    Promise.resolve(context.handlePostCompleted(request.source || 'queue', {
      postUrl: request.postUrl || '',
      statusId: request.statusId || ''
    }))
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        addLog('error', 'post_failed', [error.message || String(error)]);
        sendResponse({ success: false, error: error.message || String(error) });
      });
    return true;
  } else if (request.action === "postFailed") {
    const reason = request.reason || '发帖失败，请人工检查';
    addLog('error', 'post_failed', [reason]);
    chrome.storage.local.set({ isAutoPaused: true, pauseReason: reason, isPosting: false }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === "replyCompleted") {
    const author = request.tweetAuthor || '未知用户';
    const replyText = request.replyText || '';
    
    chrome.storage.local.get(['stats', 'sessionReplyCount', 'repliesToday', 'lastReplyDate', 'onboardingStrategy', 'recentRepliedAuthors'], (res) => {
      const stats = res.stats || { tweetsProcessed: 0, repliesSent: 0 };
      stats.repliesSent = (stats.repliesSent || 0) + 1;
      
      const recentAuthors = res.recentRepliedAuthors || {};
      recentAuthors[author.toLowerCase()] = Date.now();
      const nowTs = Date.now();
      for (const k in recentAuthors) {
        if (nowTs - recentAuthors[k] > 24 * 60 * 60 * 1000) delete recentAuthors[k];
      }
      
      const nowString = new Date().toDateString();
      let repliesToday = res.lastReplyDate === nowString ? (res.repliesToday || 0) : 0;
      repliesToday += 1;
      
      let count = (res.sessionReplyCount || 0) + 1;
      const mode = res.onboardingStrategy?.automationMode || 'autoEngage';
      
      let minMins = 12;
      let maxMins = 20;
      if (mode === 'autoEngage') {
        minMins = 20;
        maxMins = 30;
      }
      let nextCooldownMs = (Math.floor(Math.random() * (maxMins - minMins + 1)) + minMins) * 60000;
      
      if (mode === 'autoReply' && count <= 5) {
        if (count === 1) nextCooldownMs = 1 * 60 * 1000;
        else if (count === 2) nextCooldownMs = 3 * 60 * 1000;
        else if (count === 3) nextCooldownMs = 5 * 60 * 1000;
        else if (count === 4) nextCooldownMs = 7 * 60 * 1000;
        else if (count === 5) nextCooldownMs = 9 * 60 * 1000;
      }
      
      const twitterCooldownUntil = Date.now() + nextCooldownMs;
      
      const replyFlowDone = buildReplyFlowTransition(res, REPLY_FLOW_EVENTS.REPLY_COMPLETED).update;

      chrome.storage.local.set({
        stats,
        sessionReplyCount: count,
        repliesToday,
        lastReplyDate: nowString,
        twitterCooldownUntil,
        recentRepliedAuthors: recentAuthors,
        ...replyFlowDone,
        lastReplySent: {
          tweetAuthor: author,
          replyText,
          time: Date.now()
        }
      }, () => {
        const cdMins = Math.round(nextCooldownMs / 60000);
        addLog('success', 'reply_confirmed', [author, cdMins]);
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "replyFailed") {
    const reason = request.reason || '回复未完成，请检查 X 弹窗状态';
    addLog('warn', 'reply_failed', [reason]);
    const replyFlowFailed = buildReplyFlowTransition({}, REPLY_FLOW_EVENTS.REPLY_FAILED, { reason }).update;
    chrome.storage.local.set({
      ...replyFlowFailed,
      twitterCooldownUntil: Date.now() + REPLY_RETRY_LOCK_MS,
      lastReplyFailure: {
        reason,
        time: Date.now()
      }
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  return false;
}
