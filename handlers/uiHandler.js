import { addLog } from '../core/state.js';

const MAX_INSPIRATION_LIBRARY_ITEMS = 500;

export function handleUiMessage(request, sender, sendResponse, context) {
  if (request.action === "extractBio" || request.action === "openProfileTab") {
    const rawUrl = request.url || request.profileUrl || request.profilePath || '';
    const profileUrl = rawUrl.startsWith('http') ? rawUrl : `https://x.com${rawUrl}`;
    addLog('info', 'profile_tab_opened', [profileUrl]);
    chrome.tabs.create({ url: profileUrl, active: false }, (tab) => {
      const createError = chrome.runtime.lastError;
      if (createError || !tab?.id) {
        sendResponse({ success: false, error: createError?.message || 'Profile tab open failed' });
        return;
      }

      let settled = false;
      let timeoutId = 0;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.remove(tab.id, () => {
          void chrome.runtime.lastError;
        });
      };
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        cleanup();
        sendResponse(payload);
      };
      const readSnapshot = () => {
        chrome.tabs.sendMessage(tab.id, { action: 'readProfileSnapshot' }, (response) => {
          if (chrome.runtime.lastError || !response?.success) return;
          const bio = String(response.bio || '').trim();
          if (!bio) return;
          addLog('success', 'profile_read_complete');
          finish({ success: true, bio });
        });
      };
      const onUpdated = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') readSnapshot();
      };

      timeoutId = setTimeout(() => {
        addLog('warn', 'profile_read_timeout');
        finish({ success: false, error: 'Bio 提取超时' });
      }, 30000);
      chrome.tabs.onUpdated.addListener(onUpdated);
      if (tab.status === 'complete') readSnapshot();
    });
    return true;
  } else if (request.action === "collectTweet") {
    chrome.storage.local.get(['inspirationLibrary'], (res) => {
      const list = res.inspirationLibrary || [];
      if (list.some(t => t.url === request.tweet.url)) {
        if (chrome.sidePanel && chrome.sidePanel.open && sender && sender.tab && sender.tab.windowId) {
          chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
        }
        sendResponse({ success: true, alreadyExists: true, message: '该推文已被收录' });
        return;
      }
      
      const newItem = {
        id: request.tweet.id || Date.now().toString(),
        author: request.tweet.author || '未知用户',
        authorName: request.tweet.author || '未知用户',
        text: request.tweet.text || '',
        url: request.tweet.url || '',
        time: request.tweet.time || Date.now(),
        savedAt: Date.now()
      };
      
      list.unshift(newItem);
      if (list.length > MAX_INSPIRATION_LIBRARY_ITEMS) list.length = MAX_INSPIRATION_LIBRARY_ITEMS;
      
      chrome.storage.local.set({ inspirationLibrary: list }, () => {
        addLog('success', 'tweet_collected', [request.tweet.author]);
        
        if (chrome.sidePanel && chrome.sidePanel.open && sender && sender.tab && sender.tab.windowId) {
          chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
        }
        
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "deleteCollectedTweet") {
    chrome.storage.local.get(['inspirationLibrary'], (res) => {
      const list = res.inspirationLibrary || [];
      const updated = list.filter(t => t.id !== request.id);
      chrome.storage.local.set({ inspirationLibrary: updated }, () => {
        addLog('info', 'collected_tweet_deleted');
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === 'checkSidePanelState') {
    sendResponse({ isOpen: context.getIsSidePanelOpen() });
    return true;
  } else if (request.action === 'openSidePanel') {
    if (chrome.sidePanel && chrome.sidePanel.open && sender && sender.tab) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
      sendResponse({ success: true });
    }
    return true;
  } else if (request.action === 'autoRewrite') {
    if (chrome.sidePanel && chrome.sidePanel.open && sender && sender.tab) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
    }
    chrome.storage.local.set({ pendingAutoRewrite: request.tweetData });
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'autoReply') {
    if (chrome.sidePanel && chrome.sidePanel.open && sender && sender.tab) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
    }
    chrome.storage.local.set({ pendingAutoReply: request.tweetData });
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'toggleBot') {
    const isRunning = Boolean(request.state);
    chrome.storage.local.set({
      isRunning,
      isAutoPaused: !isRunning,
      pauseReason: ''
    }, () => {
      sendResponse({ success: true, isRunning });
    });
    return true;
  }
  return false;
}
