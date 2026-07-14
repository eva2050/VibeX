import { performTrustedClick } from '../services/twitter.js';
import { addLog } from '../core/state.js';

export function handleAutomationMessage(request, sender, sendResponse, context) {
  if (request.action === "trustedClick") {
    performTrustedClick(sender.tab?.id, request.x, request.y)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        addLog('warn', 'trusted_click_failed', [error.message]);
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
      addLog('info', 'automation_tab_opened', [tab.id]);
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
        addLog('warn', 'onboarding_analysis_failed', [error.message]);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "maybeStartAgentAfterSetup") {
    context.maybeStartAgentAfterSetup(sendResponse);
    return true;
  } else if (request.action === "checkAndSetupAlarm") {
    if (context.checkAndSetupAlarm) context.checkAndSetupAlarm();
    sendResponse({ success: true });
  } else if (request.action === "ensureAutomationXTab") {
    context.ensureAutomationXTab?.({ active: Boolean(request.active), reason: request.reason || 'manual' });
    sendResponse({ success: true });
  } else if (request.action === "scanPerformanceBaseline") {
    if (context.runInitialBaselineScan) context.runInitialBaselineScan();
    sendResponse({ success: true });
  } else if (request.action === "reviewPendingPostPerformance") {
    if (!context.reviewNextPendingPost) {
      sendResponse({ success: false, error: 'performance review unavailable' });
      return false;
    }
    context.reviewNextPendingPost({ postId: request.postId || '' })
      .then(result => sendResponse(result || { success: true }))
      .catch(error => sendResponse({ success: false, error: error.message || String(error) }));
    return true;
  } else if (request.action === "connectXAccount") {
    context.connectXAccount?.(request.clientId || '')
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "disconnectXAccount") {
    context.disconnectXAccount?.()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "syncConnectedXData") {
    context.syncConnectedXData?.({
      enrichProfile: Boolean(request.enrichProfile),
      updateProfileFromSamples: Boolean(request.updateProfileFromSamples),
      skipAutoPersonaAnalysis: Boolean(request.skipAutoPersonaAnalysis),
      openVisible: Boolean(request.openVisible),
      openCreatorCenter: request.openCreatorCenter !== false
    })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === "updateProfileFromSamples") {
    context.updateProfileFromSamples?.()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  return false;
}
