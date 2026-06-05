import { addLog } from '../core/state.js';

export function handleUiMessage(request, sender, sendResponse, context) {
  if (request.action === "extractBio" || request.action === "openProfileTab") {
    const rawUrl = request.url || request.profileUrl || request.profilePath || '';
    const profileUrl = rawUrl.startsWith('http') ? rawUrl : `https://x.com${rawUrl}`;
    addLog('info', `后台打开 Profile 页面: ${profileUrl}`);
    chrome.tabs.create({ url: profileUrl, active: false }, (tab) => {
      chrome.storage.onChanged.addListener(function listener(changes, namespace) {
        if (namespace === 'local' && changes.accountBio) {
          addLog('success', 'Profile 页面读取完成，关闭后台标签页');
          chrome.tabs.remove(tab.id);
          chrome.storage.onChanged.removeListener(listener);
        }
      });
    });
    return true; // async but not keeping channel open for response to sender
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
      
      chrome.storage.local.set({ inspirationLibrary: list }, () => {
        addLog('success', `成功收录推文 (作者: @${request.tweet.author}) 到灵感库`);
        
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
        addLog('info', '从灵感库中删除了一条推文');
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
  }
  return false;
}
