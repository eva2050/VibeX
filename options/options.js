/**
 * VibeX - Main Controller
 * (The Xiaolongxia Standard)
 */
// GLOBALS
let currentContext = { type: 'idle', data: null };
let originalAIOutput = '';
let lastActionType = '';

// Helper: Toast notification
function showToast(message, type = 'system') {
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
function recordFeedbackLoop(original, modified, context) {
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
      addLog(t('log_feedback'), 'system');
    });
  });
}

document.addEventListener('DOMContentLoaded', initCore);

let sidePanelPort = null;

function initCore() {
  initNavigation();
  loadMemory();
  
  // Listen for context updates from content scripts();
  bindActions();
  setupContextListener();
  setupStorageListener();
  const btnAddStyle = document.getElementById('btn-add-style');
  if (btnAddStyle) btnAddStyle.addEventListener('click', () => addStyleItem());
  
  const btnResetPrompt = document.getElementById('btn-reset-prompt');
  if (btnResetPrompt) btnResetPrompt.addEventListener('click', resetCustomPrompt);

  // Connect to background script to notify side panel state
  sidePanelPort = chrome.runtime.connect({ name: "sidepanel" });
}

// ==========================================
// 1. NAVIGATION & UI
// ==========================================
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view-panel');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
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
    });
  });
}

// ==========================================
// 2. STATE MANAGEMENT (Storage)
// ==========================================
function updatePreflightStatus(apiKey) {
  const banner = document.getElementById('api-warning-banner');
  const actionButtons = document.querySelectorAll('.magic-btn.primary, #btn-manual-rewrite');
  
  const activeTab = document.querySelector('.nav-item.active');
  const isSettingsTab = activeTab && activeTab.dataset.view === 'view-persona';
  
  if (!apiKey || apiKey.trim() === '') {
    if (banner) {
      if (isSettingsTab) {
        banner.classList.add('hidden');
      } else {
        banner.classList.remove('hidden');
      }
      banner.onclick = () => document.querySelector('.nav-item[data-view="view-persona"]').click();
    }
    actionButtons.forEach(btn => {
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = '请先在设置中配置 API Key';
    });
  } else {
    if (banner) banner.classList.add('hidden');
    actionButtons.forEach(btn => {
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.title = '';
    });
  }
}

function loadMemory() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;

  chrome.storage.local.get({
    apiKey: '',
    apiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
    replyStrategy: '',
    customPromptGlobal: '',
    styleTrainingData: '',
    engineLanguage: 'en',
    uiTheme: 'auto',
    draftVault: [],
    onboardingStrategy: {}
  }, (items) => {
    const apiKeyInput = document.getElementById('api-key-input');
    if (apiKeyInput) {
      // If browser autofilled it before we loaded, save it
      if (!items.apiKey && apiKeyInput.value.length > 0) {
        saveMemory();
      } else {
        apiKeyInput.value = items.apiKey || '';
      }
      updateApiStatusIndicator();
    }
    
    const apiProvider = document.getElementById('api-provider');
    if (apiProvider) {
      apiProvider.value = items.apiProvider || 'gemini';
      const opt = document.querySelector(`#api-provider-container .custom-select-option[data-value="${apiProvider.value}"]`);
      if (opt) {
        document.querySelector('#api-provider-trigger span').textContent = opt.textContent;
        document.querySelectorAll('#api-provider-container .custom-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      }
    }
    
    const aiModelInput = document.getElementById('ai-model-input');
    if (aiModelInput) {
      aiModelInput.value = items.aiModel || 'gemini-2.5-flash';
    }

    const automationModeInput = document.getElementById('automation-mode');
    if (automationModeInput) {
      automationModeInput.value = items.onboardingStrategy?.automationMode || 'autoEngage';
      const opt = document.querySelector(`#automation-mode-container .custom-select-option[data-value="${automationModeInput.value}"]`);
      if (opt) {
        document.querySelector('#automation-mode-trigger span').textContent = opt.textContent;
        document.querySelectorAll('#automation-mode-container .custom-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      }
    }
    
    const replyStrategy = document.getElementById('reply-strategy');
    if (replyStrategy) {
      replyStrategy.value = items.replyStrategy || '极简流：精辟吐槽 / 玩梗';
      const opt = document.querySelector(`#reply-strategy-container .custom-select-option[data-value="${replyStrategy.value}"]`);
      if (opt) {
        document.querySelector('#reply-strategy-trigger span').textContent = opt.textContent;
        document.querySelectorAll('#reply-strategy-container .custom-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      }
      // Show or hide prompt editor on load
      const customPromptEditor = document.getElementById('strategy-prompt-editor');
      if (customPromptEditor) {
        if (items.replyStrategy && items.replyStrategy.includes('自定义流')) {
          customPromptEditor.style.display = 'block';
        } else {
          customPromptEditor.style.display = 'none';
        }
      }
      
      // Load custom prompt
      window.customPrompts = {
        custom: items.customPromptGlobal || ''
      };
      
      const promptEditor = document.getElementById('custom-strategy-prompt');
      if (promptEditor) {
        // Sync on input
        promptEditor.addEventListener('input', (e) => {
          window.customPrompts.custom = e.target.value;
        });
        promptEditor.addEventListener('blur', saveMemory);
        
        // Initial setup
        promptEditor.value = window.customPrompts.custom;
      }
    }
    
    
    const styleList = document.getElementById('style-training-list');
    if (styleList) {
      styleList.innerHTML = '';
      let styleData = items.styleTrainingData;
      if (!Array.isArray(styleData)) {
        styleData = styleData ? [styleData] : [];
      }
      if (styleData.length === 0) {
        addStyleItem('', styleList);
      } else {
        styleData.forEach(text => addStyleItem(text, styleList));
      }
    }

    
    const langInput = document.getElementById('engine-language');
    if (langInput) {
      langInput.value = items.engineLanguage || 'en';
      const opt = document.querySelector(`#engine-language-container .custom-select-option[data-value="${langInput.value}"]`);
      if (opt) {
        document.querySelector('#engine-language-trigger span').textContent = opt.textContent;
        document.querySelectorAll('#engine-language-container .custom-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      }
    }

    const themeInput = document.getElementById('ui-theme');
    if (themeInput) {
      themeInput.value = items.uiTheme || 'auto';
      const opt = document.querySelector(`#ui-theme-container .custom-select-option[data-value="${themeInput.value}"]`);
      if (opt) {
        document.querySelector('#ui-theme-trigger span').textContent = opt.textContent;
        document.querySelectorAll('#ui-theme-container .custom-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      }
    }
    
    applyTheme(items.uiTheme || 'auto');
    applyLanguage(items.engineLanguage || 'en');
    
    updatePreflightStatus(items.apiKey);
    renderVault(items.draftVault);
    
    // Update stats
    chrome.storage.local.get(['postsToday', 'lastPostDate', 'repliesToday', 'lastReplyDate'], (res) => {
      const statPosts = document.getElementById('stat-posts-today');
      const statReplies = document.getElementById('stat-replies-today');
      const nowString = new Date().toDateString();
      
      const postsToday = res.lastPostDate === nowString ? (res.postsToday || 0) : 0;
      const repliesToday = res.lastReplyDate === nowString ? (res.repliesToday || 0) : 0;
      
      if (statPosts) statPosts.textContent = postsToday;
      if (statReplies) statReplies.textContent = repliesToday;
    });
  });
}

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

function saveMemory() {
  const toSave = {
    apiKey: document.getElementById('api-key-input').value.trim(),
    apiProvider: document.getElementById('api-provider')?.value || 'gemini',
    aiModel: document.getElementById('ai-model-input')?.value.trim() || 'gemini-2.5-flash',
    replyStrategy: document.getElementById('reply-strategy')?.value || '极简流：精辟吐槽 / 玩梗',
    customPromptGlobal: document.getElementById('custom-strategy-prompt')?.value || '',
    styleTrainingData: Array.from(document.querySelectorAll('#style-training-list textarea')).map(t => t.value.trim()).filter(t => t !== ''),
    engineLanguage: document.getElementById('engine-language')?.value || 'en',
    uiTheme: document.getElementById('ui-theme')?.value || 'auto'
  };

  if (window.customPrompts) {
    toSave.customPromptGlobal = window.customPrompts.custom;
  }

  if (chrome.storage) {
    chrome.storage.local.set(toSave, () => {
      applyTheme(toSave.uiTheme);
      applyLanguage(toSave.engineLanguage);
      
      const automationModeInput = document.getElementById('automation-mode');
      if (automationModeInput) {
        chrome.storage.local.get(['onboardingStrategy'], (res) => {
          let str = res.onboardingStrategy || {};
          str.automationMode = automationModeInput.value;
          chrome.storage.local.set({ onboardingStrategy: str }, () => {
            addLog(t('log_config_updated'), 'system');
            updatePreflightStatus(toSave.apiKey);
          });
        });
      } else {
        addLog(t('log_config_updated'), 'system');
        updatePreflightStatus(apiKey);
      }
      
      // Toast notification instead of button
      let existingToast = document.getElementById('save-toast');
      if (!existingToast) {
        existingToast = document.createElement('div');
        existingToast.id = 'save-toast';
        document.body.appendChild(existingToast);
      }
      // Clear any existing timeout to prevent premature removal
      if (window.saveToastTimeout) clearTimeout(window.saveToastTimeout);
      
      existingToast.textContent = t('toast_saved');
      existingToast.style.cssText = 'position:fixed;top:24px;right:24px;background:var(--primary);color:var(--bg-color);padding:6px 12px;border-radius:16px;font-size:12px;font-weight:600;box-shadow:var(--shadow-float);z-index:10000;transition:opacity 0.2s;opacity:1;';
      
      window.saveToastTimeout = setTimeout(() => {
        existingToast.style.opacity = '0';
        setTimeout(() => existingToast.remove(), 200);
      }, 1000);
    });
  }
}

function setupStorageListener() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;

  chrome.storage.local.get(['pendingAutoRewrite', 'pendingAutoReply', 'logs'], (items) => {
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
      if (changes.draftVault) {
        renderLibrary(changes.draftVault.newValue);
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
    addLog(`${t('log_account_lock')}: ${data.author}`, 'system');
  }
}

// ==========================================
// 4. MAGIC ACTIONS
// ==========================================
function bindActions() {
  document.getElementById('api-key-input').addEventListener('blur', saveMemory);
  document.getElementById('api-key-input').addEventListener('input', (e) => {
    // Auto-detect provider based on key prefix
    const key = e.target.value.trim();
    if (key.length > 5) {
      let detectedProvider = null;
      if (key.startsWith('AIza')) detectedProvider = 'gemini';
      else if (key.startsWith('sk-or-v1-') || key.startsWith('sk-or-')) detectedProvider = 'openrouter';
      else if (key.startsWith('sk-proj-') || key.startsWith('sk-svcacct-')) detectedProvider = 'openai';
      else if (key.startsWith('sk-ant-')) detectedProvider = 'openrouter'; // Anthropic via OpenRouter
      else if (key.startsWith('sk-')) detectedProvider = 'deepseek'; // Default sk- to DeepSeek
      
      if (detectedProvider) {
        const providerInput = document.getElementById('api-provider');
        const modelInput = document.getElementById('ai-model-input');
        const defaults = {
          gemini: 'gemini-2.5-flash',
          deepseek: 'deepseek-chat',
          openai: 'gpt-4o-mini',
          openrouter: 'google/gemini-2.5-flash',
          qwen: 'qwen-plus'
        };
        if (providerInput) providerInput.value = detectedProvider;
        if (modelInput) modelInput.value = defaults[detectedProvider] || 'gemini-2.5-flash';
        saveMemory();
      }
    }
    updateApiStatusIndicator();
  });
  
  // Auto-save listeners
  const apiInput = document.getElementById('api-key-input');
  if (apiInput) apiInput.addEventListener('blur', saveMemory);
  
  const langSelect = document.getElementById('engine-language');
  if (langSelect) langSelect.addEventListener('change', saveMemory);
  
  const stratSelect = document.getElementById('reply-strategy');
  if (stratSelect) stratSelect.addEventListener('change', saveMemory);
  
  const styleList = document.getElementById('style-training-list');
  if (styleList) {
    styleList.addEventListener('blur', (e) => {
      if (e.target.tagName === 'TEXTAREA') {
        saveMemory();
      }
    }, true);
  }
  


  // Manual save to vault button has been removed for seamless UX
  
  const btnRegen = document.getElementById('btn-regenerate');
  if (btnRegen) {
    btnRegen.addEventListener('click', () => {
      if (lastActionType) {
        executeMagicAction(lastActionType, true);
      } else {
        addLog(t('log_no_context'), 'error');
      }
    });
  }

  const resultBoxUI = document.getElementById('generation-result');
  if (resultBoxUI) {
    resultBoxUI.addEventListener('click', () => {
      const text = resultBoxUI.innerText.trim();
      if (!text || text === '✨ 正在生成爆款文案...') return;
      navigator.clipboard.writeText(text).then(() => {
        showToast(t('toast_copied'), 'system');
      }).catch(err => {
        addLog(t('log_copy_fail') + ': ' + err.message, 'error');
      });
    });
  }

  const btnSaveLib = document.getElementById('btn-save-library');
  if (btnSaveLib) {
    btnSaveLib.addEventListener('click', () => {
      const text = document.getElementById('generation-result').innerText.trim();
      if (!text) return;
      chrome.storage.local.get({ draftVault: [] }, (res) => {
        const vault = res.draftVault;
        vault.unshift({
          id: 'manual-' + Date.now(),
          text: text,
          author: 'Manual Rewrite',
          savedAt: Date.now()
        });
        chrome.storage.local.set({ draftVault: vault }, () => {
          renderVault(vault);
          const oldHtml = btnSaveLib.innerHTML;
          btnSaveLib.innerHTML = `<i data-lucide="check" width="16" height="16"></i> ${t('toast_saved').replace('✨ ', '')}`;
          if (window.lucide) window.lucide.createIcons();
          setTimeout(() => { 
            btnSaveLib.innerHTML = oldHtml; 
            if (window.lucide) window.lucide.createIcons();
          }, 2000);
          loadLibrary();
        });
      });
    });
  }

  document.getElementById('btn-manual-rewrite').addEventListener('click', () => {
    const val = document.getElementById('manual-input').value.trim();
    if (!val) {
      addLog(t('log_enter_material'), 'error');
      return;
    }
    // Simulate new context
    currentContext = {
      type: 'tweet',
      data: {
        text: val,
        authorName: '外部素材导入',
        authorHandle: 'manual'
      }
    };
    // Run rewrite
    executeMagicAction('viral_rewrite');
    document.getElementById('manual-input').value = '';
  });



  const engineToggle = document.getElementById('engine-toggle');
  const engineBadge = document.getElementById('engine-status-badge');
  
  if (chrome.storage) {
    chrome.storage.local.get({ isRunning: false }, (items) => {
      engineToggle.checked = items.isRunning;
      updateEngineBadge(items.isRunning);
    });
  }

  engineToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    const updateObj = { isRunning: isEnabled, isAutoPaused: !isEnabled };
    if (isEnabled) {
      updateObj.automationStartTime = Date.now();
      updateObj.sessionReplyCount = 0;
      updateObj.sessionPostCount = 0;
    }
    chrome.storage.local.set(updateObj, () => {
      updateEngineBadge(isEnabled);
      addLog(isEnabled ? t('log_engine_start') : t('log_engine_stop'), isEnabled ? 'system' : 'error');
    });
  });
  
  if (chrome.storage) {
    chrome.storage.local.get(['isRunning'], (res) => {
      const toggle = document.getElementById('engine-toggle');
      if (toggle) toggle.checked = !!res.isRunning;
      const engineBadge = document.getElementById('engine-status-badge');
      if (engineBadge) {
        engineBadge.className = res.isRunning ? 'status-badge running' : 'status-badge stopped';
        engineBadge.textContent = res.isRunning ? '运行中' : '已停止';
      }
    });
  }
}

function updateEngineBadge(isEnabled) {
  const engineBadge = document.getElementById('engine-status-badge');
  if (!engineBadge) return;
  const langInput = document.getElementById('engine-language');
  let lang = langInput ? langInput.value : 'auto';
  if (lang === 'auto') lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
  const dict = i18nDict[lang] || i18nDict.zh;
  
  if (isEnabled) {
    engineBadge.textContent = dict.status_running || '运行中';
    engineBadge.className = 'status-badge running';
  } else {
    engineBadge.textContent = dict.status_stopped || '已停止';
    engineBadge.className = 'status-badge stopped';
  }
}

function executeMagicAction(actionType, isRegenerate = false) {
  lastActionType = actionType;
  if (!currentContext.data) {
    addLog(t('log_no_content'), 'error');
  }
  
  const apiKey = document.getElementById('api-key-input').value.trim();
  const textContent = currentContext.data.text || '';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const isUrl = urlRegex.test(textContent);

  if (!apiKey && !isUrl) {
    addLog(t('log_no_apikey'), 'error');
    return;
  }

  const zone = document.getElementById('generation-zone');
  const loader = document.getElementById('generation-loader');
  const resultBox = document.getElementById('generation-result');
  
  zone.classList.remove('hidden');
  loader.classList.remove('hidden');
  resultBox.classList.remove('hidden');
  resultBox.textContent = '';
  
  const loadingTextEl = loader.querySelector('div:last-child');
  if (isUrl) {
    if (loadingTextEl) loadingTextEl.textContent = '正在提取并解析 URL 内容...';
    addLog(t('log_url_detect'), 'system');
  } else {
    if (loadingTextEl) loadingTextEl.textContent = '✨ 正在生成爆款文案...';
    addLog(`${t('log_executing')}: ${actionType}`, 'system');
  }

  // Send request to background script
  if (chrome.runtime) {
    chrome.runtime.sendMessage({
      action: isUrl ? 'extractAndRewrite' : 'magicPrompt',
      promptType: actionType,
      contextData: currentContext.data,
      isRegenerate: isRegenerate

    }, (response) => {
      loader.classList.add('hidden');
      if (chrome.runtime.lastError || !response || response.error) {
        resultBox.textContent = '生成失败: ' + (chrome.runtime.lastError?.message || response?.error || response?.message);
        addLog(t('log_task_fail'), 'error');
      } else {
        resultBox.textContent = response.result;
        originalAIOutput = response.result;
        addLog(`${t('log_task_done')}: ${response.result.length}`, 'system');
        
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
      resultBox.value = "这是一个模拟生成的回复，充满了智慧和幽默。";
      addLog(t('log_sim_done'), 'system');
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
    vault.unshift({
      text: generatedText,
      originalAIOutput: originalOutput || generatedText,
      source: currentContext?.data?.text || '未知来源',
      savedAt: Date.now()
    });
    chrome.storage.local.set({ draftVault: vault }, () => {
      addLog(`✨ ${t('log_auto_saved')}`, 'system');
      // Toast notification instead of button modification
      const toast = document.createElement('div');
      toast.textContent = '✨ 自动存入储备库';
      toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;box-shadow:var(--shadow-float);z-index:1000;animation:fadeInOut 2s forwards;';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
      
      renderVault(vault);
    });
  });
}

function renderVault(vault) {
  const feed = document.getElementById('library-feed');
  feed.innerHTML = '';
  
  const countEl = document.getElementById('library-count');
  if (countEl) {
    countEl.innerText = vault ? `(${vault.length})` : '(0)';
  }
  
  if (!vault || vault.length === 0) {
    feed.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 120px 20px; color: var(--text-sub); text-align: center;">
        <i data-lucide="package-open" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
        <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px; color: var(--text-main);">${t('vault_empty_title')}</div>
        <div style="font-size: 14px; opacity: 0.8; line-height: 1.6;">${t('vault_empty_desc')}</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  vault.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'vault-card';
    
    // Format date based on language
    const date = new Date(item.savedAt || Date.now());
    const lang = getCurrentLang();
    const dateStr = lang === 'en' 
      ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    
    // Extract title (first line or first 30 chars)
    let title = item.text.split('\n')[0].substring(0, 40);
    if (title.length === 40) title += '...';

    div.innerHTML = `
      <div class="vault-card-main" id="vault-card-main-${index}">
        <div class="vault-card-title">${title}</div>
        <textarea class="vault-card-textarea" id="vault-text-${index}">${item.text}</textarea>
      </div>
      <div class="vault-card-footer">
        <div class="vault-card-date">
          <span style="opacity: 0.7"><i data-lucide="file-text" width="14" height="14"></i></span> ${dateStr}
        </div>
        <div class="vault-card-actions">
          <button class="vault-action-btn delete-btn vault-delete-btn" data-index="${index}" title="${t('vault_delete')}"><i data-lucide="trash-2" width="14" height="14"></i> ${t('vault_delete')}</button>
          <button class="vault-action-btn inject-btn vault-inject-btn" data-index="${index}" title="${t('vault_copy')}"><i data-lucide="copy" width="14" height="14"></i> ${t('vault_copy')}</button>
        </div>
      </div>
    `;
    feed.appendChild(div);
    
    // Expandable Logic
    const mainArea = div.querySelector(`#vault-card-main-${index}`);
    const textarea = div.querySelector(`#vault-text-${index}`);
    
    mainArea.addEventListener('click', (e) => {
      // Don't toggle if clicking the textarea itself when already expanded
      if (e.target === textarea && div.classList.contains('expanded')) return;
      
      div.classList.toggle('expanded');
      
      if (div.classList.contains('expanded')) {
        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      } else {
        textarea.style.height = '60px'; // Reset to collapsed height
      }
    });
    
    // Auto-resize on input when expanded
    textarea.addEventListener('input', () => {
      if (div.classList.contains('expanded')) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      }
    });
    

    
    // Auto-save on blur
    textarea.addEventListener('blur', () => {
      const newText = textarea.value.trim();
      if (newText !== item.text) {
        chrome.storage.local.get({ draftVault: [] }, (items) => {
          const v = items.draftVault;
          if (v[index]) {
            v[index].text = newText;
            chrome.storage.local.set({ draftVault: v }, () => {
               // Show a tiny saved indicator on the date line
               const dateEl = div.querySelector('.vault-card-date');
               const origContent = dateEl.innerHTML;
               dateEl.innerHTML = `<span style="color: #34c759">✓ 已自动保存</span>`;
               setTimeout(() => { dateEl.innerHTML = origContent; }, 2000);
            });
          }
        });
      }
    });
  });
  
  // Bind inject buttons
  document.querySelectorAll('.vault-inject-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = btn.getAttribute('data-index');
      const textToInject = document.getElementById(`vault-text-${idx}`).value;
      
      chrome.storage.local.get({ draftVault: [] }, (items) => {
        const vaultItem = items.draftVault[idx];
        if (vaultItem && vaultItem.originalAIOutput) {
          if (textToInject.trim() !== vaultItem.originalAIOutput.trim()) {
            recordFeedbackLoop(vaultItem.originalAIOutput, textToInject, { data: { text: vaultItem.source }});
            
            // update vault to new value so it doesn't keep triggering if they click inject again without edits
            vaultItem.text = textToInject;
            vaultItem.originalAIOutput = textToInject;
            chrome.storage.local.set({ draftVault: items.draftVault });
          }
        }
      });
      
      if (textToInject) {
        navigator.clipboard.writeText(textToInject).then(() => {
          showToast(t('toast_copied'), 'system');
        }).catch(err => {
          addLog('复制失败: ' + err.message, 'error');
        });
      }
      
      const oldText = btn.innerHTML;
      btn.innerHTML = `<i data-lucide="check" width="14" height="14"></i> ${t('toast_copied')}`;
      if(window.lucide) window.lucide.createIcons();
      setTimeout(() => {
        btn.innerHTML = oldText;
        if(window.lucide) window.lucide.createIcons();
      }, 2000);
    });
  });
  
  // Bind delete buttons
  document.querySelectorAll('.vault-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      chrome.storage.local.get({ draftVault: [] }, (items) => {
        let currentVault = items.draftVault || [];
        currentVault.splice(idx, 1);
        chrome.storage.local.set({ draftVault: currentVault }, () => {
          addLog(t('log_deleted'), 'system');
          renderVault(currentVault);
        });
      });
    });
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ==========================================
// 5. ENGINE LOGS
// ==========================================
function getCurrentLang() {
  const langInput = document.getElementById('engine-language');
  let lang = langInput ? langInput.value : 'zh';
  if (lang === 'auto') lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
  return lang;
}

function t(key, fallback) {
  const lang = getCurrentLang();
  const dict = i18nDict[lang] || i18nDict.zh;
  return dict[key] || fallback || key;
}

const backendLogDict = [
  { p: /机器人已停止，跳过 intent 回复/, en: 'Bot stopped, skipping intent reply' },
  { p: /机器人已停止，跳过发推/, en: 'Bot stopped, skipping tweet post' },
  { p: /扩展程序已安装\/更新/, en: 'Extension installed/updated' },
  { p: /本轮计划滚动 (.*?) 次，然后休息/, en: 'Planning to scroll $1 times this cycle, then rest' },
  { p: /自动操作已暂停，停止自动滚动/, en: 'Automation paused, auto-scroll stopped' },
  { p: /滚动本轮结束，休息 (.*?) 秒.../, en: 'Scroll cycle complete, resting $1s...' },
  { p: /全自动发帖: 按渐进调度计划/, en: 'Auto-Post: Progressive schedule' },
  { p: /全自动发帖\(高频抖动\): 计划/, en: 'Auto-Post (High-Freq Jitter): Schedule' },
  { p: /收到回复生成请求，调用 AI 接口.../, en: 'Reply request received, calling AI API...' },
  { p: /AI 回复生成完成/, en: 'AI reply generated' },
  { p: /成功收录推文 \(作者: (.*?)\) 到灵感库/, en: 'Successfully saved tweet by $1 to Library' },
  { p: /从灵感库中删除了一条推文/, en: 'Deleted a tweet from Library' },
  { p: /确认已回复 (.*?)，.*?进入 (.*?) 分钟互动冷却/, en: 'Confirmed reply to $1, entering $2 min cooldown' },
  { p: /执行发推，当前队列 (.*?) 条，发送成功后剩余 (.*?) 条/, en: 'Posting tweet. Queue: $1 (remaining after send: $2)' },
  { p: /今日已发 (.*?) 条，暂停发推至次日/, en: 'Daily limit reached ($1). Paused until tomorrow.' },
  { p: /今日已达发推上限 (.*?)，跳过本次执行/, en: 'Daily post limit reached ($1). Skipping.' },
  { p: /检测到 X 已登录，自动打开策略中心/, en: 'X login detected, opening Strategy Center' },
  { p: /成功提取链接内容 \((.*?) 字符\)，进入重写流程.../, en: 'Successfully extracted link ($1 chars). Rewriting...' },
  { p: /任务提交成功，正在等待 DataHub 解析完成.../, en: 'Task submitted, waiting for DataHub parsing...' },
  { p: /后台打开 Profile 页面: (.*)/, en: 'Opening Profile page in background: $1' },
  { p: /Profile 页面读取完成，关闭后台标签页/, en: 'Profile parsed successfully, closing background tab' },
  { p: /定时器触发，准备执行发推/, en: 'Timer triggered, preparing to post tweet' },
  { p: /当前为先审后发\/影子模式，跳过自动发推执行/, en: 'Shadow mode active, skipping automated post' },
  { p: /自动操作已暂停，跳过本次发推执行/, en: 'Automation paused, skipping scheduled post' },
  { p: /向标签页 (.*?) 发送发推指令/, en: 'Sending post command to tab $1' },
  { p: /发推: (.*)/, en: 'Tweet: $1' },
  { p: /定时器触发，准备执行发推/, en: 'Timer triggered, preparing to post tweet' },
  { p: /已达到单次最大连续工作时长 \(10小时\)，为保护账号安全，机器人已自动停止/, en: '10-hour safeguard triggered. Agent stopped automatically to protect your account.' },
  { p: /当前为先审后发\/影子模式，跳过自动发推执行/, en: 'Shadow mode active, skipping automated post' },
  { p: /当前为 X 原生定时发布模式，改为写入 X 定时器/, en: 'X Native Schedule mode active, writing to X scheduler' },
  { p: /自动操作已暂停，跳过本次发推执行/, en: 'Automation paused, skipping scheduled post' },
  { p: /今日已达发推上限 (.*?)，跳过本次执行/, en: 'Daily post limit reached ($1). Skipping.' },
  { p: /执行发推，当前队列 (.*?) 条，发送成功后剩余 (.*?) 条/, en: 'Posting tweet. Queue: $1 (remaining after send: $2)' },
  { p: /已有待处理发布任务，等待当前 X 定时发布完成/, en: 'Pending task exists, waiting for current X native schedule to complete' },
  { p: /准备写入 X 原生定时发布：(.*)/, en: 'Preparing to write X native schedule: $1' },
  { p: /收到手动测试发帖请求/, en: 'Received manual test post request' },
  { p: /固定间隔模式：计划 (.*?) 发推/, en: 'Fixed Interval Mode: Scheduled to post at $1' },
  { p: /智能时段配置为空，使用默认时段/, en: 'Smart intervals empty, using default intervals' },
  { p: /智能分布模式：计划 (.*?) 发推（今日 (.*?)\/(.*?)）/, en: 'Smart Distribution Mode: Scheduled at $1 (Today: $2/$3)' },
  { p: /自动操作已暂停，跳过发推调度/, en: 'Automation paused, skipping post scheduling' },
  { p: /机器人已启动/, en: 'Agent started' },
  { p: /机器人已停止/, en: 'Agent stopped' }
];

function translateBackendLog(msg, lang) {
  if (lang !== 'en') return msg;
  let translated = msg;
  for (const item of backendLogDict) {
    if (item.p instanceof RegExp && item.p.test(translated)) {
      translated = translated.replace(item.p, item.en);
    }
  }
  return translated;
}

function renderLogs(logsArray) {
  const container = document.getElementById('engine-logs');
  if (!container || !Array.isArray(logsArray)) return;
  container.innerHTML = '';
  const lang = getCurrentLang();
  
  // Render newest first
  for (let i = logsArray.length - 1; i >= 0; i--) {
    const entry = logsArray[i];
    const timeStr = new Date(entry.time || Date.now()).toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false });
    const message = translateBackendLog(entry.message || '', lang);
    
    const div = document.createElement('div');
    div.className = `log-entry ${entry.level || entry.type || 'system'}`;
    div.textContent = `[${timeStr}] ${message}`;
    container.appendChild(div);
  }
}

function addLog(message, type = 'system') {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  const entry = {
    time: Date.now(),
    level: type,
    message: message,
    source: 'options'
  };
  chrome.storage.local.get(['logs'], (result) => {
    let logs = result.logs || [];
    logs.push(entry);
    if (logs.length > 100) logs = logs.slice(-100);
    chrome.storage.local.set({ logs });
  });
}

// Request immediate sync on load
if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'requestSync'}).catch(() => {});
    }
  });
}

// Custom Dropdown logic
function setupCustomSelects() {
  document.querySelectorAll('.custom-select-container').forEach(container => {
    const trigger = container.querySelector('.custom-select-trigger');
    const options = container.querySelectorAll('.custom-select-option');
    const hiddenInput = container.querySelector('input[type="hidden"]');
    const label = trigger.querySelector('span');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close all others
      document.querySelectorAll('.custom-select-container').forEach(c => {
        if (c !== container) c.classList.remove('open');
      });
      container.classList.toggle('open');
    });

    options.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        options.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        
        hiddenInput.value = opt.getAttribute('data-value');
        label.textContent = opt.textContent;
        container.classList.remove('open');
        
        // Handle custom prompt switching
        if (hiddenInput.id === 'reply-strategy') {
          const customPromptEditor = document.getElementById('strategy-prompt-editor');
          if (customPromptEditor) {
            const val = hiddenInput.value;
            if (val.includes('自定义流')) {
              customPromptEditor.style.display = 'block';
              if (window.customPrompts) {
                const promptTextArea = document.getElementById('custom-strategy-prompt');
                if (promptTextArea) promptTextArea.value = window.customPrompts.custom;
              }
            } else {
              customPromptEditor.style.display = 'none';
            }
          }
        }
        
        saveMemory(); // Auto-save on dropdown change
        
        // Dispatch change event to save
        hiddenInput.dispatchEvent(new Event('change'));
      });
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-container').forEach(c => {
      c.classList.remove('open');
    });
  });
}
document.addEventListener('DOMContentLoaded', setupCustomSelects);

// Auto-resize manual input
const manualInput = document.getElementById('manual-input');
if (manualInput) {
  manualInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });
}


function addStyleItem(text = '', container = null) {
  if (!container) container = document.getElementById('style-training-list');
  if (!container) return;
  
  const div = document.createElement('div');
  div.style.position = 'relative';
  
  const textarea = document.createElement('textarea');
  textarea.className = 'modern-input style-item-textarea';
  textarea.style.resize = 'none';
  textarea.rows = 1;
  textarea.style.height = '36px';
  textarea.style.minHeight = '36px';
  
  // Perfect vertical centering and spacing
  textarea.style.paddingTop = '8px';
  textarea.style.paddingBottom = '8px';
  textarea.style.paddingRight = '44px'; // Extra large padding to avoid X button
  textarea.style.lineHeight = '18px';
  
  textarea.style.transition = 'height 0.2s ease, border-color 0.2s ease, color 0.2s ease, font-size 0.2s ease, padding 0.2s ease';
  textarea.style.overflow = 'hidden';
  textarea.style.whiteSpace = 'nowrap';
  textarea.style.textOverflow = 'ellipsis';
  textarea.style.color = '#86868b'; // Gray text when collapsed
  textarea.style.fontSize = '13px'; // Smaller text when collapsed
  
  textarea.addEventListener('focus', () => {
    mask.style.display = 'none';
    gradient.style.display = 'none';
    textarea.style.height = '100px';
    textarea.style.resize = 'vertical';
    textarea.style.overflow = 'auto';
    textarea.style.whiteSpace = 'normal';
    textarea.style.color = 'var(--text-main)'; // Restore color
    textarea.style.fontSize = ''; // Restore font size
    textarea.style.paddingTop = '14px';
    textarea.style.paddingBottom = '14px';
  });
  
  textarea.addEventListener('blur', () => {
    mask.style.display = 'block';
    gradient.style.display = 'block';
    textarea.style.height = '36px';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.whiteSpace = 'nowrap';
    textarea.style.color = '#86868b'; // Gray text
    textarea.style.fontSize = '13px'; // Smaller text
    textarea.style.paddingTop = '8px';
    textarea.style.paddingBottom = '8px';
    textarea.scrollTop = 0;
  });
  textarea.placeholder = '粘贴一条过往的高赞推文...';
  textarea.value = text;
  
  textarea.addEventListener('input', () => {
    saveMemory();
  });
  
  const mask = document.createElement('div');
  mask.className = 'style-item-mask';
  mask.style.position = 'absolute';
  mask.style.right = '2px';
  mask.style.top = '2px';
  mask.style.width = '40px';
  mask.style.height = '32px';
  mask.style.background = 'var(--bg-secondary, #F5F5F7)';
  mask.style.borderTopRightRadius = '10px';
  mask.style.borderBottomRightRadius = '10px';
  mask.style.pointerEvents = 'none';
  mask.style.zIndex = '5';
  
  // Create gradient fade for nicer effect
  const gradient = document.createElement('div');
  gradient.className = 'style-item-gradient';
  gradient.style.position = 'absolute';
  gradient.style.right = '42px';
  gradient.style.top = '2px';
  gradient.style.width = '24px';
  gradient.style.height = '32px';
  gradient.style.background = 'linear-gradient(to right, rgba(var(--bg-secondary-rgb), 0), var(--bg-secondary))';
  gradient.style.pointerEvents = 'none';
  gradient.style.zIndex = '5';

  const delBtn = document.createElement('button');
  delBtn.innerHTML = '<i data-lucide="x" width="14" height="14"></i>';
  delBtn.style.position = 'absolute';
  delBtn.style.zIndex = '10';
  delBtn.style.right = '8px';
  delBtn.style.top = '8px';
  delBtn.style.background = 'rgba(0,0,0,0.05)';
  delBtn.style.border = 'none';
  delBtn.style.borderRadius = '50%';
  delBtn.style.width = '24px';
  delBtn.style.height = '24px';
  delBtn.style.display = 'flex';
  delBtn.style.alignItems = 'center';
  delBtn.style.justifyContent = 'center';
  delBtn.style.cursor = 'pointer';
  delBtn.style.color = '#86868b';
  delBtn.style.zIndex = '10'; // Make sure it sits on top
  
  delBtn.addEventListener('click', () => {
    div.remove();
    saveMemory();
  });
  
  delBtn.addEventListener('mouseover', () => delBtn.style.background = 'rgba(255,59,48,0.1)');
  delBtn.addEventListener('mouseout', () => delBtn.style.background = 'rgba(0,0,0,0.05)');
  
  div.appendChild(textarea);
  div.appendChild(gradient);
  div.appendChild(mask);
  div.appendChild(delBtn);
  container.appendChild(div);
  
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: div });
}
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'magicPromptStreamChunk') {
    const resultBox = document.getElementById('generation-result');
    if (resultBox) {
      resultBox.textContent += request.chunk;
      resultBox.scrollTop = resultBox.scrollHeight;
    }
  }
});

// Theme and Language handling
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else if (theme === 'light') {
    document.body.classList.remove('dark-theme');
  } else {
    // auto
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }
}

// Watch for system theme changes if set to auto
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    const themeInput = document.getElementById('ui-theme');
    if (themeInput && themeInput.value === 'auto') {
      applyTheme('auto');
    }
  });
}

const i18nDict = {
  zh: {
    api_warning: '缺少核心组件：请配置 API Key',
    api_goto: '前往设置 &rarr;',
    header_workspace: '工作区',
    desc_workspace: '在此输入灵感、长文、或公众号/小红书/YouTube链接，体验一键爆款仿写。',
    btn_regenerate: '重新生成',
    btn_save: '保存',
    header_library: '素材库',
    desc_library: '您可以在这里直接编辑修改文案，系统会自动将您的修改作为二次反馈喂给 AI，让 AI 不断进化，越来越懂你的风格。',
    header_settings: '设置',
    desc_settings: '系统配置与模型参数。',
    label_apikey: 'API Key (必填)',
    label_strategy: '默认回复策略',
    label_automation_mode: '自动化运行模式',
    mode_auto_post: '全自动发帖 (原创输出)',
    mode_auto_reply: '全自动回复 (活跃互动)',
    mode_browse_only: '仅浏览存素材 (静默收集)',
    label_custom_prompt: '自定义 Prompt 设定',
    btn_reset_prompt: '恢复默认',
    placeholder_custom_prompt: '可以在这里完全重写当前回复流派的底层 Prompt...',
    label_style: '风格训练语料',
    btn_add_style: '添加新语料',
    btn_test_api: '测试连接',
    btn_save_config: '保存配置',
    header_engine: '高阶实验',
    status_stopped: '待机中',
    status_running: '测试中',
    desc_engine: '开启后将按动态频率智能执行互动与发文。为保护账号，系统强制启用最长 10 小时挂机的防沉迷安全锁。',
    stat_posts_today: '今日发推',
    stat_replies_today: '今日回复',
    engine_logs: '运行日志',
    log_ready: '代理已就绪。等待心跳信号...',
    nav_workspace: '工作区',
    nav_library: '素材库',
    nav_settings: '设置',
    nav_engine: '沙盒',
    label_theme: '界面主题',
    theme_auto: '自动检测',
    theme_light: '白天模式',
    theme_dark: '黑夜模式',
    label_language: '语言',
    label_api_provider: 'AI 服务商',
    label_ai_model: '模型名称',
    strategy_contrarian: '杠精流：犀利观点 / 争议',
    strategy_expert: '专业流：专业知识 / 数据',
    strategy_minimal: '极简流：精辟吐槽 / 玩梗',
    strategy_custom: '自定义流：完全自定义',
    placeholder_input: '输入文本/链接...',
    placeholder_style: '粘贴一条过往的高赞推文...',
    vault_empty_title: '储备库空空如也',
    vault_empty_desc: '快去收集和洗稿吧！',
    vault_delete: '删除',
    vault_copy: '复制',
    log_config_updated: '系统配置已更新。',
    log_auto_capture: '游标已对齐，当前选定目标 (待命)',
    log_account_lock: '锁定账号分析',
    log_no_context: '无上下文可重新生成',
    log_copy_fail: '复制失败',
    log_enter_material: '请输入外部素材',
    log_engine_start: '高频测试沙盒已启动，请留意运行日志。',
    log_engine_stop: '测试沙盒已关闭。',
    log_no_content: '请先捕获内容后再执行操作',
    log_no_apikey: '缺少 API Key，任务终止',
    log_url_detect: '[执行中] 探测到 URL，启动深度抓取任务...',
    log_executing: '[执行中] 正在执行任务',
    log_task_fail: '任务失败。',
    log_task_done: '任务完成。生成长度',
    log_sim_done: '模拟任务完成。',
    log_auto_saved: '已自动无感存入储备库',
    log_deleted: '已从素材库中删除。',
    log_feedback: 'AI 进化反馈已记录，模型将在下次生成时进行纠偏。',
    toast_saved: '✨ 已入库',
    toast_copied: '已复制',
    hint_click_copy: '复制'
  },
  en: {
    api_warning: 'API Key Required: Please configure',
    api_goto: 'Go to Settings &rarr;',
    header_workspace: 'Workspace',
    desc_workspace: 'Enter inspiration, articles, or links here for one-click viral rewriting.',
    btn_regenerate: 'Regenerate',
    btn_save: 'Save',
    header_library: 'Library',
    desc_library: 'Edit your drafts directly here. The system feeds your edits back to the AI, letting it learn your style.',
    header_settings: 'Settings',
    desc_settings: 'System configuration and model parameters.',
    label_apikey: 'API Key (Required)',
    label_strategy: 'Default Reply Strategy',
    label_automation_mode: 'Automation Mode',
    mode_auto_post: 'Auto-Post',
    mode_auto_reply: 'Auto-Reply',
    mode_auto_engage: 'Auto-Engage (Full Activity)',
    mode_browse_only: 'Browse & Collect',
    label_custom_prompt: 'Custom Prompt',
    strategy_contrarian: 'Contrarian & Sharp',
    strategy_expert: 'Expert & Data-driven',
    strategy_minimal: 'Minimal & Witty',
    strategy_custom: 'Custom Strategy',
    btn_reset_prompt: 'Reset',
    placeholder_custom_prompt: 'You can completely rewrite the underlying prompt for the current strategy here...',
    label_style: 'Style Training Data',
    btn_add_style: 'Add Reference',
    btn_test_api: 'Test Connection',
    btn_save_config: 'Save Settings',
    header_engine: 'Sandbox',
    status_stopped: 'Standby',
    status_running: 'Active',
    desc_engine: 'When enabled, the system runs with dynamic pacing. A 10-hour automatic shutdown safeguard is enforced to protect your account.',
    stat_posts_today: 'Posts',
    stat_replies_today: 'Replies',
    engine_logs: 'Run Logs',
    log_ready: 'Agent ready. Waiting for heartbeat...',
    nav_workspace: 'Workspace',
    nav_library: 'Library',
    nav_settings: 'Settings',
    nav_engine: 'Sandbox',
    label_theme: 'UI Theme',
    theme_auto: 'Auto',
    theme_light: 'Light',
    theme_dark: 'Dark',
    label_language: 'Language',
    label_api_provider: 'AI Provider',
    label_ai_model: 'Model Name',
    placeholder_input: 'Enter text/link...',
    placeholder_style: 'Paste a high-engagement tweet...',
    vault_empty_title: 'Your library is empty',
    vault_empty_desc: 'Start collecting and rewriting!',
    vault_delete: 'Delete',
    vault_copy: 'Copy',
    log_config_updated: 'Settings saved.',
    log_auto_capture: 'UI Cursor aligned (standby)',
    log_account_lock: 'Targeting account',
    log_no_context: 'No context to regenerate',
    log_copy_fail: 'Copy failed',
    log_enter_material: 'Please provide input content.',
    log_engine_start: 'Automation started. Listening 24/7.',
    log_engine_stop: 'Automation paused.',
    log_no_content: 'No content selected.',
    log_no_apikey: 'Missing API Key',
    log_url_detect: 'URL detected. Extracting...',
    log_executing: 'Executing task...',
    log_task_fail: 'Task failed.',
    log_task_done: 'Task completed. Length:',
    log_sim_done: 'Simulation complete.',
    log_auto_saved: 'Auto-saved to library',
    log_deleted: 'Removed from library.',
    log_feedback: 'Style feedback recorded.',
    toast_saved: '✨ Saved',
    toast_copied: 'Copied!',
    hint_click_copy: 'Copy'
  }
};

function applyLanguage(lang) {
  if (lang === 'auto') {
    lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
  }
  const dict = i18nDict[lang] || i18nDict.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.innerHTML = dict[key];
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) {
      el.placeholder = dict[key];
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (dict[key]) {
      el.title = dict[key];
    }
  });
  document.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const rules = el.getAttribute('data-i18n-attr').split(',');
    rules.forEach(rule => {
      const parts = rule.split(':');
      if (parts.length === 2 && dict[parts[1]]) {
        el.setAttribute(parts[0], dict[parts[1]]);
      }
    });
  });
  
  // Custom dropdown translation updates
  document.querySelectorAll('.custom-select-option').forEach(el => {
     const i18nKey = el.getAttribute('data-i18n');
     if (i18nKey && dict[i18nKey]) el.textContent = dict[i18nKey];
  });
  // Update trigger texts if needed based on selected option
  document.querySelectorAll('.custom-select-container').forEach(container => {
     const selected = container.querySelector('.custom-select-option.selected');
     const triggerSpan = container.querySelector('.custom-select-trigger span');
     if (selected && triggerSpan) {
        triggerSpan.textContent = selected.textContent;
     }
  });
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  // Re-render vault with translated buttons/dates
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ draftVault: [] }, (items) => {
      renderVault(items.draftVault);
    });
  }
  
  // Update style training textarea placeholders
  document.querySelectorAll('#style-training-list textarea').forEach(ta => {
    ta.placeholder = dict.placeholder_style || '粘贴一条过往的高赞推文...';
  });
}

let apiVerificationTimer = null;
function updateApiStatusIndicator() {
  const dot = document.getElementById('api-status-dot');
  const textSpan = document.getElementById('api-status-text');
  if (!dot || !textSpan) return;
  
  const apiKey = document.getElementById('api-key-input').value.trim();
  const lang = document.getElementById('engine-language')?.value || 'en';
  
  // Clear any pending verification
  if (apiVerificationTimer) clearTimeout(apiVerificationTimer);
  
  if (apiKey.length > 10) {
    // Show Verifying state
    dot.style.background = '#F59E0B'; // Yellow
    dot.classList.add('pulse');
    textSpan.textContent = lang === 'zh' || lang === 'auto' && navigator.language.startsWith('zh') ? '正在验证...' : 'Verifying...';
    textSpan.style.color = '#F59E0B';
    
    // Ping background script after 800ms debounce
    apiVerificationTimer = setTimeout(() => {
      if (chrome && chrome.runtime) {
        chrome.runtime.sendMessage({ action: "testApiConnection", apiKey: apiKey, apiProvider: document.getElementById('api-provider')?.value || 'gemini' }, (response) => {
          if (response && response.success) {
            dot.style.background = '#10B981'; // Green
            dot.classList.add('pulse');
            textSpan.textContent = lang === 'zh' || lang === 'auto' && navigator.language.startsWith('zh') ? '已连接' : 'Connected';
            textSpan.style.color = '#10B981';
          } else {
            dot.style.background = '#EF4444'; // Red
            dot.classList.remove('pulse');
            textSpan.textContent = lang === 'zh' || lang === 'auto' && navigator.language.startsWith('zh') ? '验证失败' : 'Invalid Key';
            textSpan.style.color = '#EF4444';
            console.error("API Verification failed:", response?.error);
          }
        });
      }
    }, 800);
  } else {
    dot.style.background = '#EF4444'; // Red
    dot.classList.remove('pulse');
    textSpan.textContent = lang === 'zh' || lang === 'auto' && navigator.language.startsWith('zh') ? '未连接' : 'Not Connected';
    textSpan.style.color = 'var(--text-sub)';
  }
}

function resetCustomPrompt() {
  const promptInput = document.getElementById('custom-strategy-prompt');
  if (promptInput) {
    promptInput.value = '';
    saveMemory();
    
    const btn = document.getElementById('btn-reset-prompt');
    const originalText = btn.innerHTML;
    const lang = document.getElementById('engine-language')?.value || 'en';
    const isZh = lang === 'zh' || lang === 'auto' && navigator.language.startsWith('zh');
    btn.innerHTML = `<i data-lucide="check" width="12" height="12"></i> <span style="color: #10B981;">${isZh ? '已重置' : 'Reset'}</span>`;
    if (window.lucide) window.lucide.createIcons();
    
    setTimeout(() => {
      btn.innerHTML = originalText;
      if (window.lucide) window.lucide.createIcons();
    }, 1500);
  }
}
