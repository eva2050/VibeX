import { getCurrentLang, t, translateBackendLog, applyLanguage } from './ui/i18n.js';
import { renderLogs, addLog, renderVault, renderAiMemory } from './ui/logs.js';
import { loadMemory, saveMemory, bindActions, updatePreflightStatus, updateEngineBadge, addStyleItem, setupCustomSelects, applyTheme, updateApiStatusIndicator, resetCustomPrompt, renderProfileFields, renderStyleTrainingList, updateXAuthStatusUI } from './ui/settings.js';
import { POST_CONTENT_MODE, POST_ORIGIN, POST_STATUS, normalizePostRecord } from '../core/storageSchema.js';

/**
 * VibeX - Main Controller
 * (The Xiaolongxia Standard)
 */
// GLOBALS
export let currentContext = { type: 'idle', data: null };
export function setCurrentContext(ctx) { currentContext = ctx; }
export let originalAIOutput = '';
export function setOriginalAIOutput(val) { originalAIOutput = val; }
export let lastActionType = '';

// Helper: Toast notification
export function showToast(message, type = 'system') {
  let toast = document.getElementById('options-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'options-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);opacity:0;background:var(--primary, #0F0F0F);color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.15);transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.transform = 'translateX(-50%) translateY(0)';
  toast.style.opacity = '1';

  if (toast.timeout) clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    toast.style.opacity = '0';
  }, 2500);
}

// RLHF Helper
export function recordFeedbackLoop(original, modified, context) {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  chrome.storage.local.get({ feedbackLoopData: [] }, (items) => {
    const feedback = items.feedbackLoopData;
    feedback.push({
      original: original.trim(),
      modified: modified.trim(),
      context: context?.data?.text || '未知上下文',
      timestamp: Date.now()
    });
    // Keep only the last 10 feedback items
    if (feedback.length > 10) feedback.shift();

    chrome.storage.local.set({ feedbackLoopData: feedback }, () => {
      addLog('feedback_saved', 'system');
    });
  });
}

// Preference Feedback Helper (Like/Dislike)
export function recordPreferenceFeedback(text, type, context) {
  if (typeof chrome === 'undefined' || !chrome.storage || !text) return;
  const storageKey = type === 'like' ? 'feedbackLikes' : 'feedbackDislikes';

  chrome.storage.local.get({ [storageKey]: [] }, (items) => {
    const feedbackList = items[storageKey];
    feedbackList.push({
      text: text.trim(),
      context: context?.data?.text || '未知上下文',
      timestamp: Date.now()
    });

    // Keep only the last 10 items
    if (feedbackList.length > 10) feedbackList.shift();

    chrome.storage.local.set({ [storageKey]: feedbackList }, () => {
      addLog(type === 'like' ? 'preference_like_saved' : 'preference_dislike_saved', 'system');
      showToast(type === 'like' ? '感谢反馈，AI 将多生成此类风格！' : '感谢反馈，AI 将避免生成此类风格！');
    });
  });
}

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}
let sidePanelPort = null;
onReady(initCore);

function initCore() {
  initNavigation();
  loadMemory();

  // Listen for context updates from content scripts();
  bindActions();
  setupContextListener();
  setupStorageListener();
  setupCustomSelects();

  const btnAddStyle = document.getElementById('btn-add-style');
  if (btnAddStyle) btnAddStyle.addEventListener('click', () => addStyleItem());
  const btnSyncXProfile = document.getElementById('btn-sync-x-profile');
  if (btnSyncXProfile) {
    btnSyncXProfile.addEventListener('click', () => {
      const styleSamples = collectStyleSamplesFromDom();
      btnSyncXProfile.disabled = true;
      showToast(t('toast_x_profile_syncing', '正在同步 X 基础资料...'), 'system');
      chrome.storage.local.set({ styleTrainingData: styleSamples }, () => {
        chrome.runtime.sendMessage({
          action: 'syncConnectedXData',
          enrichProfile: false,
          updateProfileFromSamples: styleSamples.length >= 3,
          skipAutoPersonaAnalysis: styleSamples.length < 3,
          openVisible: true
        }, (response) => {
          btnSyncXProfile.disabled = false;
          if (chrome.runtime.lastError || !response?.success) {
            showToast(response?.error || chrome.runtime.lastError?.message || t('toast_x_profile_sync_failed', '同步失败'), 'error');
            return;
          }
          const toastKey = styleSamples.length >= 3 ? 'toast_x_profile_sync_started' : 'toast_x_profile_basic_started';
          const fallback = styleSamples.length >= 3
            ? '已开始同步基础资料，并会根据样本更新定位和策略'
            : '已开始同步基础资料；添加至少 3 条优质样本后可更新策略';
          showToast(t(toastKey, fallback), 'system');
        });
      });
    });
  }
  const btnUpdateProfileFromSamples = document.getElementById('btn-update-profile-from-samples');
  if (btnUpdateProfileFromSamples) {
    btnUpdateProfileFromSamples.addEventListener('click', () => {
      const styleSamples = collectStyleSamplesFromDom();
      if (styleSamples.length < 3) {
        showToast(t('toast_style_samples_need_3', '请先添加至少 3 条优质推文样本'), 'error');
        return;
      }
      btnUpdateProfileFromSamples.disabled = true;
      showToast(t('toast_profile_samples_updating', '正在根据样本更新 Profile...'), 'system');
      chrome.storage.local.set({ styleTrainingData: styleSamples }, () => {
        chrome.runtime.sendMessage({ action: 'updateProfileFromSamples' }, (response) => {
          btnUpdateProfileFromSamples.disabled = false;
          if (chrome.runtime.lastError || !response?.success) {
            showToast(response?.error || chrome.runtime.lastError?.message || t('toast_profile_samples_failed', '更新失败'), 'error');
            return;
          }
          showToast(t('toast_profile_samples_started', '已开始根据样本更新账号定位和发推策略'), 'system');
        });
      });
    });
  }
  const btnSyncXWorks = document.getElementById('btn-sync-x-works');
  if (btnSyncXWorks) {
    btnSyncXWorks.addEventListener('click', () => {
      btnSyncXWorks.disabled = true;
      showToast(t('toast_x_works_syncing', '正在同步 X 作品...'), 'system');
      chrome.runtime.sendMessage({ action: 'syncConnectedXData', enrichProfile: false, openVisible: true }, (response) => {
        btnSyncXWorks.disabled = false;
        if (chrome.runtime.lastError || !response?.success) {
          showToast(response?.error || chrome.runtime.lastError?.message || t('toast_x_works_sync_failed', '同步失败'), 'error');
          return;
        }
        showToast(t('toast_x_works_sync_started', '已开始同步作品，完成后会自动更新复盘'), 'system');
      });
    });
  }

  const btnResetPrompt = document.getElementById('btn-reset-prompt');
  if (btnResetPrompt) btnResetPrompt.addEventListener('click', resetCustomPrompt);

  // Connect to background script to notify side panel state
  try {
    sidePanelPort = chrome.runtime.connect({ name: "sidepanel" });
  } catch (e) {
    console.warn("Could not connect to background sidepanel port:", e);
  }
}

function collectStyleSamplesFromDom() {
  return Array.from(document.querySelectorAll('#style-training-list textarea'))
    .map(textarea => textarea.value.trim())
    .filter(Boolean);
}

// ==========================================
// 1. NAVIGATION & UI
// ==========================================
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view-panel');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      // Clear active states
      navItems.forEach(nav => nav.classList.remove('active'));
      views.forEach(view => {
        view.classList.remove('is-active');
        view.classList.add('hidden');
      });

      // Set active
      item.classList.add('active');
      const targetView = document.getElementById(item.dataset.view);
      targetView.classList.remove('hidden');
      targetView.classList.add('is-active');

      // Update preflight status to check if banner should be hidden
      const currentApiKey = document.getElementById('api-key-input')?.value || '';
      updatePreflightStatus(currentApiKey);

      // Save globally if it was a real user click
      if (e.isTrusted) {
        chrome.storage.local.set({ activeSidePanelTab: item.dataset.view });
      }
    });
  });
}


// ==========================================
// 2. STATE MANAGEMENT (Storage)
// ==========================================




// Listen for stats updates from background
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    const nowString = new Date().toDateString();
    if (changes.postsToday || changes.lastPostDate) {
      const statPosts = document.getElementById('stat-posts-today');
      if (statPosts) {
        chrome.storage.local.get(['postsToday', 'lastPostDate'], res => {
          statPosts.textContent = res.lastPostDate === nowString ? (res.postsToday || 0) : 0;
        });
      }
    }
    if (changes.repliesToday || changes.lastReplyDate) {
      const statReplies = document.getElementById('stat-replies-today');
      if (statReplies) {
        chrome.storage.local.get(['repliesToday', 'lastReplyDate'], res => {
          statReplies.textContent = res.lastReplyDate === nowString ? (res.repliesToday || 0) : 0;
        });
      }
    }
  }
});



function setupStorageListener() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;

  chrome.storage.local.get(['pendingAutoRewrite', 'pendingAutoReply', 'logs', 'activeSidePanelTab'], (items) => {
    if (items.activeSidePanelTab) {
      const targetNav = document.querySelector(`.nav-item[data-view="${items.activeSidePanelTab}"]`);
      if (targetNav && !targetNav.classList.contains('active')) {
        targetNav.click();
      }
    }
    if (items.logs) {
      renderLogs(items.logs);
    }
    if (items.pendingAutoRewrite) {
      const tweetData = items.pendingAutoRewrite;
      currentContext = { type: 'tweet', data: tweetData };
      handleNewContext('tweet', tweetData);
      document.querySelector('.nav-item[data-view="view-insight"]').click();
      setTimeout(() => executeMagicAction('viral_rewrite'), 300);
      chrome.storage.local.remove('pendingAutoRewrite');
    } else if (items.pendingAutoReply) {
      const tweetData = items.pendingAutoReply;
      currentContext = { type: 'tweet', data: tweetData };
      handleNewContext('tweet', tweetData);
      document.querySelector('.nav-item[data-view="view-insight"]').click();
      setTimeout(() => executeMagicAction('draft_reply'), 300);
      chrome.storage.local.remove('pendingAutoReply');
    }
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.logs) {
        renderLogs(changes.logs.newValue);
      }
      if (changes.activeSidePanelTab && changes.activeSidePanelTab.newValue) {
        const targetNav = document.querySelector(`.nav-item[data-view="${changes.activeSidePanelTab.newValue}"]`);
        if (targetNav && !targetNav.classList.contains('active')) {
          targetNav.click();
        }
      }
      if (changes.draftVault) {
        renderVault(changes.draftVault.newValue);
        chrome.storage.local.get({ aiMemory: { learnedRules: [] } }, (res) => {
          renderAiMemory(res.aiMemory, changes.draftVault.newValue);
        });
      }
      if (changes.aiMemory) {
        chrome.storage.local.get({ draftVault: [] }, (res) => {
          renderAiMemory(changes.aiMemory.newValue, res.draftVault);
        });
      }
      if (changes.aiPersona) {
        renderProfileFields({ aiPersona: changes.aiPersona.newValue || {} });
      }
      if (changes.styleTrainingData) {
        renderStyleTrainingList(changes.styleTrainingData.newValue || []);
      }
      if (changes.accountPerformanceBaseline) {
        chrome.storage.local.get({ aiMemory: { learnedRules: [] }, draftVault: [] }, (res) => {
          renderAiMemory(res.aiMemory, res.draftVault);
        });
      }
      if (changes.xAuth || changes.xDataSyncStatus) {
        chrome.storage.local.get(['xAuth', 'xDataSyncStatus', 'accountPerformanceBaseline', 'styleTrainingData'], (res) => {
          updateXAuthStatusUI(res.xAuth || {}, res.xDataSyncStatus || {}, res);
        });
      }
      if (changes.pendingAutoRewrite && changes.pendingAutoRewrite.newValue) {
        const tweetData = changes.pendingAutoRewrite.newValue;
        currentContext = { type: 'tweet', data: tweetData };
        handleNewContext('tweet', tweetData);
        document.querySelector('.nav-item[data-view="view-insight"]').click();
        setTimeout(() => executeMagicAction('viral_rewrite'), 300);

        // Clear pending so it doesn't run again on next load
        chrome.storage.local.remove('pendingAutoRewrite');
      }
      if (changes.pendingAutoReply && changes.pendingAutoReply.newValue) {
        const tweetData = changes.pendingAutoReply.newValue;
        currentContext = { type: 'tweet', data: tweetData };
        handleNewContext('tweet', tweetData);
        document.querySelector('.nav-item[data-view="view-insight"]').click();
        setTimeout(() => executeMagicAction('draft_reply'), 300);

        // Clear pending so it doesn't run again on next load
        chrome.storage.local.remove('pendingAutoReply');
      }
    }
  });
}
// ==========================================
// 3. CONTEXT AWARENESS (Insight View)
// ==========================================
function setupContextListener() {
  if (typeof chrome === 'undefined' || !chrome.runtime) return;

  // Listen for messages from background or content scripts
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateContext') {
      handleNewContext(request.contextType, request.data);
    }
  });
}

function handleNewContext(type, data) {
  currentContext = { type, data };

  if (type === 'profile') {
    addLog('context_account_locked', 'system', [data.author]);
  }
}

// ==========================================
// 4. MAGIC ACTIONS
// ==========================================




export function executeMagicAction(actionType, isRegenerate = false) {
  lastActionType = actionType;
  if (!currentContext.data) {
    addLog('no_content', 'error');
  }

  const apiKey = document.getElementById('api-key-input').value.trim();
  const textContent = currentContext.data.text || '';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const isUrl = urlRegex.test(textContent);

  if (!apiKey || apiKey.startsWith('mock-')) {
    addLog('no_api_key', 'error');
    showToast('缺少真实的 API Key，无法生成', 'error');
    return;
  }

  const zone = document.getElementById('generation-zone');
  const loader = document.getElementById('generation-loader');
  const resultBox = document.getElementById('generation-result');

  // Clear like/dislike feedback button states on new generation
  document.getElementById('btn-feedback-like')?.classList.remove('active', 'primary');
  document.getElementById('btn-feedback-dislike')?.classList.remove('active', 'primary');
  const saveLibraryBtn = document.getElementById('btn-save-library');
  if (saveLibraryBtn) {
    saveLibraryBtn.textContent = '';
    const saveIcon = document.createElement('i');
    saveIcon.dataset.lucide = 'bookmark';
    saveIcon.setAttribute('width', '18');
    saveIcon.setAttribute('height', '18');
    saveLibraryBtn.appendChild(saveIcon);
    saveLibraryBtn.setAttribute('aria-label', t('btn_save', 'Save'));
    saveLibraryBtn.title = t('btn_save', 'Save');
    if (window.lucide) window.lucide.createIcons({ root: saveLibraryBtn });
  }

  zone.classList.remove('hidden');
  loader.classList.remove('hidden');
  resultBox.classList.remove('hidden');
  resultBox.textContent = '';

  const badgesContainer = document.getElementById('generation-quality-badges');
  if (badgesContainer) {
    badgesContainer.innerHTML = '';
    badgesContainer.classList.add('hidden');
  }

  const loadingTextEl = loader.querySelector('div:last-child');
  if (isUrl) {
    if (loadingTextEl) loadingTextEl.textContent = '正在提取并解析 URL 内容...';
    addLog('url_detected', 'system');
  } else {
    if (loadingTextEl) loadingTextEl.textContent = '✨ 正在生成爆款文案...';
    addLog('executing_action', 'system', [actionType]);
  }

  // Send request to background script
  if (chrome.runtime) {
    window.currentStreamId = 'options_' + Date.now() + '_' + Math.random();
    chrome.runtime.sendMessage({
      action: isUrl ? 'extractAndRewrite' : 'magicPrompt',
      promptType: actionType,
      contextData: currentContext.data,
      isRegenerate: isRegenerate,
      streamId: window.currentStreamId
    }, (response) => {
      loader.classList.add('hidden');
      if (chrome.runtime.lastError || !response || response.error) {
        const errorMsg = chrome.runtime.lastError?.message || response?.error || response?.message;
        // Chrome MV3 5-minute timeout protection: ignore if we already got streaming chunks
        if (errorMsg && errorMsg.includes("closed before a response was received") && resultBox.textContent.length > 20) {
           addLog('api_timeout_kept_chars', 'warn', [resultBox.textContent.length]);
           originalAIOutput = resultBox.textContent;
           return;
        }
        const failPrefix = t('generate_fail_prefix', '生成失败: ');
        resultBox.textContent = failPrefix + errorMsg;
        addLog('task_failed', 'error');
        const badgesContainer = document.getElementById('generation-quality-badges');
        if (badgesContainer) badgesContainer.classList.add('hidden');
      } else {
        resultBox.textContent = response.result;
        originalAIOutput = response.result;
        addLog('task_completed_length', 'system', [response.result.length]);

        // Render quality badges if any
        const badgesContainer = document.getElementById('generation-quality-badges');
        if (badgesContainer) {
          badgesContainer.innerHTML = '';
          if (response.quality && !response.quality.approved && Array.isArray(response.quality.issues) && response.quality.issues.length > 0) {
            const issueLabels = {
              'template_tone': t('quality_template_tone', '可能 AI 味偏重'),
              'unsupported_hard_facts': t('quality_unsupported_facts', '疑似新增未给出的数据/事实'),
              'over_segmented': t('quality_over_segmented', '分行过碎'),
              'over_expanded': t('quality_over_expanded', '可能过度扩写'),
              'no_concrete_signal': t('quality_no_signal', '信息增量不足'),
              'markdown_artifacts': t('quality_markdown', '含 Markdown 痕迹'),
              'hashtag': t('quality_hashtag', '含 hashtag'),
              'too_many_lines': t('quality_too_many_lines', '行数过多')
            };
            response.quality.issues.forEach(issue => {
              const badge = document.createElement('span');
              badge.className = 'quality-badge';
              badge.textContent = issueLabels[issue] || issue;
              badgesContainer.appendChild(badge);
            });
            badgesContainer.classList.remove('hidden');
          }
        } else {
          badgesContainer.classList.add('hidden');
        }

        // Auto-Persist removed per user request
      }
      setTimeout(() => {
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    });
  } else {
    // Mock for local testing
    setTimeout(() => {
      loader.classList.add('hidden');
      resultBox.textContent = "这是一个模拟生成的回复，充满了智慧和幽默。";
      addLog('sim_done', 'system');
    }, 2000);
  }
}

function formatResult(text) {
  return text.replace(/\n/g, '<br>');
}

function saveToVault(generatedText, originalOutput = '') {
  if (typeof chrome === 'undefined' || !chrome.storage) return;

  chrome.storage.local.get({ draftVault: [] }, (items) => {
    const vault = items.draftVault;
    vault.unshift(normalizePostRecord({
      id: 'manual-' + Date.now(),
      text: generatedText,
      originalAIOutput: originalOutput || generatedText,
      source: currentContext?.data?.text || '未知来源',
      origin: POST_ORIGIN.MANUAL_REWRITE,
      contentMode: POST_CONTENT_MODE.REWRITE,
      status: POST_STATUS.DRAFT,
      savedAt: Date.now()
    }));
    const trimmedVault = vault.slice(0, 100);
    chrome.storage.local.set({ draftVault: trimmedVault }, () => {
      addLog('auto_saved', 'system');
      // Toast notification instead of button modification
      const toast = document.createElement('div');
      toast.textContent = '✨ 自动存入储备库';
      toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;box-shadow:var(--shadow-float);z-index:1000;animation:fadeInOut 2s forwards;';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);

      renderVault(trimmedVault);
    });
  });
}



// ==========================================
// 5. ENGINE LOGS
// ==========================================




// ============================
// Translation Engine v3: 3-Pass Architecture
// Pass 1: Regex dictionary (structured sentences)
// Pass 2: Fragment dictionary (short Chinese tags as global replacements)
// Pass 3: Chinese character audit (final safety net)
// ============================









// Request immediate sync on load
if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'requestSync'}).catch(() => {});
    }
  });
}


// Auto-resize manual input
const manualInput = document.getElementById('manual-input');
if (manualInput) {
  const resizeManualInput = () => {
    manualInput.style.height = 'auto';
    const maxHeight = 160;
    const nextHeight = Math.min(manualInput.scrollHeight, maxHeight);
    manualInput.style.height = `${Math.max(nextHeight, 40)}px`;
    manualInput.style.overflowY = manualInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };
  document.getElementById('manual-input-shell')?.addEventListener('click', (event) => {
    if (event.target?.closest?.('button')) return;
    manualInput.focus();
  });
  manualInput.addEventListener('input', resizeManualInput);
  manualInput.addEventListener('paste', () => requestAnimationFrame(resizeManualInput));
  manualInput.addEventListener('focus', resizeManualInput);
  resizeManualInput();
}


// Theme and Language handling


// Watch for system theme changes if set to auto
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    const themeInput = document.getElementById('ui-theme');
    if (themeInput && themeInput.value === 'auto') {
      applyTheme('auto');
    }
  });
}
