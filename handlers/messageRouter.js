import { handleLLMMessage } from './llmHandler.js';
import { handleAutomationMessage } from './automationHandler.js';
import { handleQueueMessage } from './queueHandler.js';
import { handleUiMessage } from './uiHandler.js';
import { handleBenchmarkMessage } from './benchmarkHandler.js';

export function setupMessageRouter(context) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    let handled = false;
    let isAsync = false;

    if (['startChinesePostBenchmark', 'runNextChinesePostBenchmarkStep', 'getChinesePostBenchmark', 'submitChinesePostBenchmarkReview', 'resetChinesePostBenchmark'].includes(request.action)) {
      isAsync = handleBenchmarkMessage(request, sender, sendResponse);
      handled = true;
    }
    // LLM Handler
    else if (['testApiConnection', 'generateReply', 'magicPrompt', 'extractAndRewrite', 'rewriteTweet', 'agentChat'].includes(request.action)) {
      isAsync = handleLLMMessage(request, sender, sendResponse, context);
      handled = true;
    }
    // Automation Handler
    else if (['trustedClick', 'openAutomationTab', 'refreshXOfficialDraftCount', 'xLoginDetected', 'startAccountAutoSetup', 'analyzeOnboardingSource', 'maybeStartAgentAfterSetup', 'checkAndSetupAlarm', 'ensureAutomationXTab', 'scanPerformanceBaseline', 'reviewPendingPostPerformance', 'connectXAccount', 'disconnectXAccount', 'syncConnectedXData', 'updateProfileFromSamples'].includes(request.action)) {
      isAsync = handleAutomationMessage(request, sender, sendResponse, context);
      handled = true;
    }
    // Queue / Post Handler
    else if (['queueUpdated', 'testPostNow', 'postCompleted', 'postFailed', 'replyCompleted', 'replyFailed'].includes(request.action)) {
      isAsync = handleQueueMessage(request, sender, sendResponse, context);
      handled = true;
    }
    // UI / Misc Handler
    else if (['extractBio', 'openProfileTab', 'collectTweet', 'deleteCollectedTweet', 'checkSidePanelState', 'openSidePanel', 'autoRewrite', 'autoReply', 'toggleBot'].includes(request.action)) {
      isAsync = handleUiMessage(request, sender, sendResponse, context);
      handled = true;
    }

    if (handled) return isAsync;
    console.warn('[VibeX] Unhandled message action:', request?.action || request);
    return false;
  });
}
