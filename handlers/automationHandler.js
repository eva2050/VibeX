import { performTrustedClick } from '../services/twitter.js';
import { addLog } from '../core/state.js';

export function handleAutomationMessage(request, sender, sendResponse, context) {
  if (request.action === "trustedClick") {
    performTrustedClick(sender.tab?.id, request.x, request.y)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        addLog('warn', `真实点击失败，回退 DOM 点击: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "openAutomationTab") {
    const url = request.url || '';
    if (!/^https:\/\/(x|twitter)\.com\//.test(url)) {
      sendResponse({ success: false, error: '只能打开 X/Twitter 自动化页面' });
      return false;
    }
    chrome.tabs.create({ url, active: true }, (tab) => {
      addLog('info', `当前 X 页面无法安全跳转，已新开干净自动化标签页 ${tab.id}`);
      sendResponse({ success: true, tabId: tab.id });
    });
    return true;
  } else if (request.action === "refreshXOfficialDraftCount") {
    context.refreshXOfficialDraftCount(sendResponse);
    return true;
  } else if (request.action === "xLoginDetected") {
    context.handleXLoginDetected();
    sendResponse({ success: true });
  } else if (request.action === "startAccountAutoSetup") {
    context.startAccountAutoSetup(sendResponse);
    return true;
  } else if (request.action === "analyzeOnboardingSource") {
    context.analyzeOnboardingSource(request.sourceInput || '')
      .then((analysis) => sendResponse({ success: true, analysis }))
      .catch((error) => {
        addLog('warn', `启动向导分析失败: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "maybeStartAgentAfterSetup") {
    context.maybeStartAgentAfterSetup(sendResponse);
    return true;
  } else if (request.action === "checkAndSetupAlarm") {
    if (context.checkAndSetupAlarm) context.checkAndSetupAlarm();
    sendResponse({ success: true });
  }
  return false;
}
