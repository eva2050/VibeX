/**
 * Vibe-X - Main Controller
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
    });
  });
}

// ==========================================
// 2. STATE MANAGEMENT (Storage)
// ==========================================
function updatePreflightStatus(apiKey) {
  const banner = document.getElementById('api-warning-banner');
  const actionButtons = document.querySelectorAll('.magic-btn.primary, #btn-manual-rewrite');
  
  if (!apiKey || apiKey.trim() === '') {
    if (banner) {
      banner.classList.remove('hidden');
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
    replyStrategy: '',
    styleTrainingData: '',
    engineLanguage: 'zh',
    uiTheme: 'auto',
    draftVault: []
  }, (items) => {
    const apiKeyInput = document.getElementById('api-key-input');
    if (apiKeyInput) {
      apiKeyInput.value = items.apiKey || '';
    }
    
    const replyStrategy = document.getElementById('reply-strategy');
    if (replyStrategy) {
      replyStrategy.value = items.replyStrategy || '专业流：专业知识 / 数据';
      const opt = document.querySelector(`#reply-strategy-container .custom-select-option[data-value="${replyStrategy.value}"]`);
      if (opt) {
        document.querySelector('#reply-strategy-trigger span').textContent = opt.textContent;
        document.querySelectorAll('#reply-strategy-container .custom-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
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
      langInput.value = items.engineLanguage || 'zh';
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
    applyLanguage(items.engineLanguage || 'zh');
    
    updatePreflightStatus(items.apiKey);
    renderVault(items.draftVault);
  });
}

function saveMemory() {
  const apiKey = document.getElementById('api-key-input').value.trim();
  const target = document.getElementById('reply-strategy').value.trim();
  const styleTrainingData = Array.from(document.querySelectorAll('#style-training-list textarea')).map(t => t.value.trim()).filter(t => t !== '');
  const langInput = document.getElementById('engine-language');
  const engineLanguage = langInput ? langInput.value : 'zh';
  
  const themeInput = document.getElementById('ui-theme');
  const uiTheme = themeInput ? themeInput.value : 'auto';

  if (chrome.storage) {
    chrome.storage.local.set({
      apiKey: apiKey,
      replyStrategy: target,
      styleTrainingData: styleTrainingData,
      engineLanguage: engineLanguage,
      uiTheme: uiTheme
    }, () => {
      applyTheme(uiTheme);
      applyLanguage(engineLanguage);
      addLog(t('log_config_updated'), 'system');
      updatePreflightStatus(apiKey);
      
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

  // Check for pending actions on load (in case side panel was just opened by the button)
  chrome.storage.local.get(['pendingAutoRewrite', 'pendingAutoReply'], (items) => {
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
  
  if (type === 'tweet') {
    addLog(t('log_auto_capture'), 'system');
  } else if (type === 'profile') {
    addLog(`${t('log_account_lock')}: ${data.author}`, 'system');
  }
}

// ==========================================
// 4. MAGIC ACTIONS
// ==========================================
function bindActions() {
  document.getElementById('api-key-input').addEventListener('blur', saveMemory);
  
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
          btnSaveLib.innerHTML = `<i data-lucide="check" width="16" height="16"></i> 已入库`;
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
    updateEngineBadge(isEnabled);
    if (chrome.storage) {
      chrome.storage.local.set({ isRunning: isEnabled, isAutoPaused: !isEnabled });
    }
    addLog(isEnabled ? t('log_engine_start') : t('log_engine_stop'), isEnabled ? 'system' : 'error');
  });
  
  if (chrome.storage) {
    chrome.storage.local.get(['isRunning'], (res) => {
      document.getElementById('engine-toggle').checked = !!res.isRunning;
      document.getElementById('engine-status-badge').className = res.isRunning ? 'status-badge running' : 'status-badge stopped';
      document.getElementById('engine-status-badge').textContent = res.isRunning ? '运行中' : '已停止';
    });
  }
}

function updateEngineBadge(isEnabled) {
  const engineBadge = document.getElementById('engine-status-badge');
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
    feed.innerHTML = `<div style="color:#86868b;text-align:center;padding:40px 0;font-size:13px;">${t('vault_empty')}</div>`;
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
      btn.innerHTML = `<i data-lucide="check" width="14" height="14"></i> 已复制`;
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

function addLog(message, type = 'system') {
  const container = document.getElementById('engine-logs');
  const lang = getCurrentLang();
  const time = new Date().toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-CN', { hour12: false });
  
  const div = document.createElement('div');
  div.className = `log-entry ${type}`;
  div.textContent = `[${time}] ${message}`;
  
  container.prepend(div); // Add to top
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
    btn_regenerate: '<i data-lucide="refresh-cw" width="16" height="16"></i> 重新生成',
    btn_save: '<i data-lucide="bookmark" width="16" height="16"></i> 保存',
    header_library: '素材库',
    desc_library: '您可以在这里直接编辑修改文案，系统会自动将您的修改作为二次反馈喂给 AI，让 AI 不断进化，越来越懂你的风格。',
    header_settings: '设置',
    desc_settings: '系统配置与模型参数。',
    label_apikey: '<i data-lucide="key" width="16" height="16" style="color: var(--text-sub);"></i> 模型 API Key (必填)',
    label_strategy: '<i data-lucide="message-square" width="16" height="16" style="color: var(--text-sub);"></i> 默认回复策略',
    label_style: '<i data-lucide="book-open" width="16" height="16" style="color: var(--text-sub);"></i> 风格训练语料 (建议 3-10 条)',
    desc_style: '输入您收集/过往的高赞推文，AI 将深度模仿行文风格与断句习惯。',
    btn_add_style: '添加新语料',
    btn_save_config: '保存配置',
    header_engine: '自动化',
    status_stopped: '已停止',
    status_running: '运行中',
    desc_engine: '开启后，代理将在后台模拟人类交互模式（滚动、延迟、随机点击）自动运行，以避免触发风控限制。',
    stat_replies: '互动次数',
    stat_saved: '捕获素材',
    engine_logs: '运行日志',
    log_ready: '代理已就绪。等待心跳信号...',
    nav_workspace: '工作区',
    nav_library: '素材库',
    nav_settings: '设置',
    nav_engine: '自动化',
    label_theme: '<i data-lucide="moon" width="16" height="16" style="color: var(--text-sub);"></i> 界面主题',
    theme_auto: '自动检测',
    theme_light: '白天模式',
    theme_dark: '黑夜模式',
    label_language: '<i data-lucide="globe" width="16" height="16" style="color: var(--text-sub);"></i> 语言',
    placeholder_input: '输入文本/链接...',
    placeholder_style: '粘贴一条过往的高赞推文...',
    strategy_contrarian: '杠精流：犀利观点 / 争议',
    strategy_expert: '专业流：专业知识 / 数据',
    strategy_minimal: '极简流：精辟吐槽 / 玩梗',
    vault_empty: '储备库空空如也，快去收集和洗稿吧！',
    vault_delete: '删除',
    vault_copy: '复制',
    log_config_updated: '系统配置已更新。',
    log_auto_capture: '自动捕获当前推文 (后台待命)',
    log_account_lock: '锁定账号分析',
    log_no_context: '无上下文可重新生成',
    log_copy_fail: '复制失败',
    log_enter_material: '请输入外部素材',
    log_engine_start: '自动任务已启动，开始全天候监听。',
    log_engine_stop: '自动任务已暂停。',
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
    toast_saved: '✨ 已保存'
  },
  en: {
    api_warning: 'Missing Core: Please configure API Key',
    api_goto: 'Go to Settings &rarr;',
    header_workspace: 'Workspace',
    desc_workspace: 'Enter inspiration, articles, or links here for one-click viral rewriting.',
    btn_regenerate: '<i data-lucide="refresh-cw" width="16" height="16"></i> Regenerate',
    btn_save: '<i data-lucide="bookmark" width="16" height="16"></i> Save',
    header_library: 'Library',
    desc_library: 'Edit your copy directly here. The system feeds your edits back to the AI, letting it learn your style.',
    header_settings: 'Settings',
    desc_settings: 'System configuration and model parameters.',
    label_apikey: '<i data-lucide="key" width="16" height="16" style="color: var(--text-sub);"></i> Model API Key (Required)',
    label_strategy: '<i data-lucide="message-square" width="16" height="16" style="color: var(--text-sub);"></i> Default Reply Strategy',
    label_style: '<i data-lucide="book-open" width="16" height="16" style="color: var(--text-sub);"></i> Style Training Corpus (3-10 recommended)',
    desc_style: 'Input your collected high-engagement tweets. The AI will deeply mimic the writing style and pacing.',
    btn_add_style: 'Add Corpus',
    btn_save_config: 'Save Config',
    header_engine: 'Automation',
    status_stopped: 'Stopped',
    status_running: 'Running',
    desc_engine: 'When enabled, the agent runs in the background simulating human interaction (scrolling, delays) to avoid rate limits.',
    stat_replies: 'Interactions',
    stat_saved: 'Saved Items',
    engine_logs: 'Run Logs',
    log_ready: 'Agent ready. Waiting for heartbeat...',
    nav_workspace: 'Workspace',
    nav_library: 'Library',
    nav_settings: 'Settings',
    nav_engine: 'Engine',
    label_theme: '<i data-lucide="moon" width="16" height="16" style="color: var(--text-sub);"></i> UI Theme',
    theme_auto: 'Auto',
    theme_light: 'Light',
    theme_dark: 'Dark',
    label_language: '<i data-lucide="globe" width="16" height="16" style="color: var(--text-sub);"></i> Language',
    placeholder_input: 'Enter text/link...',
    placeholder_style: 'Paste a high-engagement tweet...',
    strategy_contrarian: 'Contrarian: Sharp Takes / Debates',
    strategy_expert: 'Expert: Professional / Data-driven',
    strategy_minimal: 'Minimal: Witty / Meme-style',
    vault_empty: 'Your library is empty. Start collecting and rewriting!',
    vault_delete: 'Delete',
    vault_copy: 'Copy',
    log_config_updated: 'Config updated.',
    log_auto_capture: 'Auto-captured tweet (standby)',
    log_account_lock: 'Locked account analysis',
    log_no_context: 'No context to regenerate',
    log_copy_fail: 'Copy failed',
    log_enter_material: 'Please enter content',
    log_engine_start: 'Automation started. Listening 24/7.',
    log_engine_stop: 'Automation paused.',
    log_no_content: 'Capture content before proceeding',
    log_no_apikey: 'Missing API Key',
    log_url_detect: '[Running] URL detected, starting deep extraction...',
    log_executing: '[Running] Executing task',
    log_task_fail: 'Task failed.',
    log_task_done: 'Task complete. Output length',
    log_sim_done: 'Simulation complete.',
    log_auto_saved: 'Auto-saved to library',
    log_deleted: 'Removed from library.',
    log_feedback: 'AI evolution feedback recorded.',
    toast_saved: '✨ Saved'
  }
};

function applyLanguage(lang) {
  if (lang === 'auto') {
    lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
  }
  const dict = i18nDict[lang] || i18nDict.zh;
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

