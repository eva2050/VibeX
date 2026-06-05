import { formatTweetForX } from '../utils/textUtils.js';
import { addLog } from '../core/state.js';
import { REPLY_RETRY_LOCK_MS } from '../core/constants.js';

export function handleQueueMessage(request, sender, sendResponse, context) {
  if (request.action === "queueUpdated") {
    context.checkAndSetupAlarm();
  } else if (request.action === "testPostNow") {
    const text = formatTweetForX(request.text || '');
    if (!text) {
      sendResponse({ success: false, error: '测试发帖内容为空' });
      return false;
    }
    chrome.storage.local.get(['pendingPost'], (existing) => {
      if (existing.pendingPost) {
        sendResponse({ success: false, error: '已有待发送推文，请先处理完成或停止自动化后再测试' });
        return;
      }
      chrome.storage.local.set({
        pendingPost: text,
        pendingPostId: null,
        pendingPostSource: 'manualTest',
        pendingScheduledAt: null,
        isAutoPaused: false,
        pauseReason: ''
      }, () => {
        addLog('info', '收到手动测试发帖请求');
        context.triggerPostInTab();
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "postCompleted") {
    context.handlePostCompleted(request.source || 'queue');
    sendResponse({ success: true });
  } else if (request.action === "postFailed") {
    const reason = request.reason || '发帖失败，请人工检查';
    addLog('error', reason);
    chrome.storage.local.set({ isAutoPaused: true, pauseReason: reason });
    sendResponse({ success: true });
  } else if (request.action === "replyCompleted") {
    const author = request.tweetAuthor || '未知用户';
    const replyText = request.replyText || '';
    
    chrome.storage.local.get(['stats', 'sessionReplyCount', 'repliesToday', 'lastReplyDate', 'onboardingStrategy'], (res) => {
      const stats = res.stats || { tweetsProcessed: 0, repliesSent: 0 };
      stats.repliesSent = (stats.repliesSent || 0) + 1;
      
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
      
      chrome.storage.local.set({
        stats,
        sessionReplyCount: count,
        repliesToday,
        lastReplyDate: nowString,
        twitterCooldownUntil,
        lastReplySent: {
          tweetAuthor: author,
          replyText,
          time: Date.now()
        }
      }, () => {
        const cdMins = Math.round(nextCooldownMs / 60000);
        const burstPrefix = (res.onboardingStrategy?.automationMode === 'autoReply' && count <= 5) ? `[爆发期 第${count}条] ` : '';
        addLog('success', `确认已回复 @${author}，${burstPrefix}进入 ${cdMins} 分钟互动冷却`);
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "replyFailed") {
    const reason = request.reason || '回复未完成，请检查 X 弹窗状态';
    addLog('warn', reason);
    chrome.storage.local.set({
      twitterCooldownUntil: Date.now() + REPLY_RETRY_LOCK_MS,
      lastReplyFailure: {
        reason,
        time: Date.now()
      }
    });
    sendResponse({ success: true });
  }
  return false;
}
