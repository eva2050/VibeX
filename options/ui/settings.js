import { applyLanguage, t, getCurrentLang } from './i18n.js';
import { renderVault, addLog, renderLogs, renderAiMemory } from './logs.js';
import { executeMagicAction, currentContext, setCurrentContext, lastActionType, showToast, setOriginalAIOutput } from '../options.js';
import { POST_CONTENT_MODE, POST_ORIGIN, POST_STATUS, normalizePostRecord } from '../../core/storageSchema.js';
import { normalizeEngineLanguage, toPreferredLanguage } from '../../core/i18n.js';
import { localizeAutoPersona } from '../../core/autoPersona.js';
import { normalizeXClientId } from '../../core/constants.js';

function normalizeReplyStrategyValue(value = '') {
  const text = String(value || '').trim();
  if (text === '专业流：专业知识 / 数据') return '专业流：认知洞见 / 启发式';
  return text;
}

export function renderProfileFields(items = {}) {
  const persona = items.aiPersona || {};
  const customPersonaInput = document.getElementById('custom-persona');
  if (customPersonaInput && document.activeElement !== customPersonaInput) {
    customPersonaInput.value = persona.characteristics || '';
  }

  const customTweetingStrategyInput = document.getElementById('custom-tweeting-strategy');
  if (customTweetingStrategyInput && document.activeElement !== customTweetingStrategyInput) {
    customTweetingStrategyInput.value = persona.goals || '';
  }
}

export function renderStyleTrainingList(styleTrainingData = []) {
  const styleList = document.getElementById('style-training-list');
  if (!styleList) return;
  styleList.textContent = '';
  let styleData = styleTrainingData;
  if (!Array.isArray(styleData)) {
    styleData = styleData ? [styleData] : [];
  }
  if (styleData.length === 0) {
    addStyleItem('', styleList);
    return;
  }
  styleData.forEach(text => addStyleItem(text, styleList));
}

export function updatePreflightStatus(apiKey) {
  const banner = document.getElementById('api-warning-banner');
  const actionButtons = document.querySelectorAll('.magic-btn.primary, #btn-manual-rewrite');
  
  if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('mock-')) {
    if (banner) {
      banner.classList.remove('hidden');
      banner.onclick = () => document.querySelector('.nav-item[data-view="view-settings"]')?.click();
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

export function loadMemory() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;

  chrome.storage.local.get({
    apiKey: '',
    apiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
    replyStrategy: '',
    customPromptGlobal: '',
    styleTrainingData: '',
    engineLanguage: 'auto',
    uiTheme: 'auto',
    draftVault: [],
    aiMemory: { learnedRules: [] },
    onboardingStrategy: {},
    aiPersona: {},
    accountPerformanceBaseline: {},
    accountLanguage: '',
    xAuth: {},
    xDataSyncStatus: {}
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
      updatePreflightStatus(apiKeyInput.value.trim());
    }
    
    const xClientInput = document.getElementById('x-client-id');
    if (xClientInput) {
      const xClientId = normalizeXClientId(items.xAuth?.clientId);
      xClientInput.value = xClientId;
      if (items.xAuth?.clientId && items.xAuth.clientId !== xClientId && !items.xAuth?.accessToken) {
        chrome.storage.local.set({ xAuth: { ...(items.xAuth || {}), clientId: xClientId } });
      }
      updateXAuthStatusUI(items.xAuth || {}, items.xDataSyncStatus || {}, items);
    }
    
    const localizedPersona = localizeAutoPersona(
      items.aiPersona || {},
      items.xAuth?.user || {},
      items.engineLanguage || 'auto',
      navigator.language,
      items.accountLanguage || items.xDataSyncStatus?.detectedLanguage || ''
    );
    if (localizedPersona.changed) {
      items.aiPersona = localizedPersona.persona;
      chrome.storage.local.set({ aiPersona: localizedPersona.persona });
    }

    renderProfileFields(items);
    
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
      replyStrategy.value = normalizeReplyStrategyValue(items.replyStrategy || '极简流：精辟吐槽 / 玩梗');
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
        let promptSaveTimeout;
        promptEditor.addEventListener('input', (e) => {
          window.customPrompts.custom = e.target.value;
          clearTimeout(promptSaveTimeout);
          promptSaveTimeout = setTimeout(saveMemory, 1000);
        });
        promptEditor.addEventListener('blur', () => {
          clearTimeout(promptSaveTimeout);
          saveMemory();
        });
        
        // Initial setup
        promptEditor.value = window.customPrompts.custom;
      }
    }
    
    
    renderStyleTrainingList(items.styleTrainingData);

    
    const langInput = document.getElementById('engine-language');
    if (langInput) {
      langInput.value = items.engineLanguage || 'auto';
      const opt = document.querySelector(`#engine-language-container .custom-select-option[data-value="${langInput.value}"]`);
      if (opt) {
        document.querySelector('#engine-language-trigger span').textContent = opt.textContent;
        document.querySelectorAll('#engine-language-container .custom-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      }
      
      const themeTrigger = document.getElementById('ui-theme-trigger');
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
    applyLanguage(items.engineLanguage || 'auto');
    
    updatePreflightStatus(items.apiKey);
    renderVault(items.draftVault);
    renderAiMemory(items.aiMemory, items.draftVault);
    
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

export function saveMemory() {
  const rawEngineLanguage = document.getElementById('engine-language')?.value || 'auto';
  const toSave = {
    apiKey: document.getElementById('api-key-input').value.trim(),
    apiProvider: document.getElementById('api-provider')?.value || 'gemini',
    aiModel: document.getElementById('ai-model-input')?.value.trim() || 'gemini-2.5-flash',
    replyStrategy: normalizeReplyStrategyValue(document.getElementById('reply-strategy')?.value || '极简流：精辟吐槽 / 玩梗'),
    customPromptGlobal: document.getElementById('custom-strategy-prompt')?.value || '',
    styleTrainingData: Array.from(document.querySelectorAll('#style-training-list textarea')).map(t => t.value.trim()).filter(t => t !== ''),
    engineLanguage: rawEngineLanguage,
    uiTheme: document.getElementById('ui-theme')?.value || 'auto'
  };

  if (window.customPrompts) {
    toSave.customPromptGlobal = window.customPrompts.custom;
  }

  if (chrome.storage) {
    chrome.storage.local.get(['aiPersona', 'onboardingStrategy', 'xAuth', 'accountLanguage', 'xDataSyncStatus'], (res) => {
      let aiPersona = res.aiPersona || {};
      const personaVal = document.getElementById('custom-persona')?.value.trim();
      const strategyVal = document.getElementById('custom-tweeting-strategy')?.value.trim();
      if (personaVal !== undefined) aiPersona.characteristics = personaVal;
      if (strategyVal !== undefined) aiPersona.goals = strategyVal;
      const detectedAccountLanguage = res.accountLanguage || res.xDataSyncStatus?.detectedLanguage || '';
      aiPersona = localizeAutoPersona(
        aiPersona,
        res.xAuth?.user || {},
        rawEngineLanguage,
        navigator.language,
        detectedAccountLanguage
      ).persona;
      toSave.aiPersona = aiPersona;
      const preferredLanguageSource = rawEngineLanguage === 'auto' && detectedAccountLanguage
        ? detectedAccountLanguage
        : rawEngineLanguage;
      toSave.onboardingStrategy = {
        ...(res.onboardingStrategy || {}),
        preferredLanguage: toPreferredLanguage(preferredLanguageSource, navigator.language)
      };
      
      const xClientId = normalizeXClientId(document.getElementById('x-client-id')?.value);
      toSave.xAuth = {
        ...(res.xAuth || {}),
        clientId: xClientId
      };

      chrome.storage.local.set(toSave, () => {
      applyTheme(toSave.uiTheme);
      applyLanguage(toSave.engineLanguage);
      chrome.storage.local.get(['xAuth', 'xDataSyncStatus', 'accountPerformanceBaseline', 'styleTrainingData'], (latest) => {
        updateXAuthStatusUI(latest.xAuth || {}, latest.xDataSyncStatus || {}, latest);
      });
      
      const automationModeInput = document.getElementById('automation-mode');
      if (automationModeInput) {
        chrome.storage.local.get(['onboardingStrategy'], (res) => {
          let str = {
            ...(toSave.onboardingStrategy || {}),
            ...(res.onboardingStrategy || {})
          };
          str.automationMode = automationModeInput.value;
          str.preferredLanguage = toSave.onboardingStrategy.preferredLanguage;
          chrome.storage.local.set({ onboardingStrategy: str }, () => {
            addLog('config_updated', 'system');
            updatePreflightStatus(toSave.apiKey);
          });
        });
      } else {
        addLog('config_updated', 'system');
        updatePreflightStatus(toSave.apiKey);
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
    });
  }
}

export function updateEngineBadge(isEnabled) {
  const engineBadge = document.getElementById('engine-status-badge');
  if (!engineBadge) return;
  const langInput = document.getElementById('engine-language');
  const lang = normalizeEngineLanguage(langInput ? langInput.value : 'auto', navigator.language);
  const dict = window.i18nDict[lang] || window.i18nDict.zh;
  
  if (isEnabled) {
    engineBadge.textContent = dict.status_running || '运行中';
    engineBadge.className = 'status-badge running';
  } else {
    engineBadge.textContent = dict.status_stopped || '已停止';
    engineBadge.className = 'status-badge stopped';
  }
}

export function bindActions() {
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
      }
    }
    saveMemory(); // Unconditionally save on input to prevent sync issues from side panels
    updateApiStatusIndicator();
  });
  
  // Auto-save listeners
  const apiInput = document.getElementById('api-key-input');
  if (apiInput) apiInput.addEventListener('blur', saveMemory);

  document.getElementById('btn-connect-x')?.addEventListener('click', () => {
    const clientId = normalizeXClientId(document.getElementById('x-client-id')?.value);
    if (!clientId) {
      showToast('X OAuth client is not configured', 'error');
      return;
    }
    showToast(t('toast_x_connecting', 'Connecting X...'), 'system');
    chrome.runtime.sendMessage({ action: 'connectXAccount', clientId }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        showToast(response?.error || chrome.runtime.lastError?.message || 'Connect X failed', 'error');
        return;
      }
      chrome.storage.local.get(['xAuth', 'xDataSyncStatus', 'accountPerformanceBaseline', 'styleTrainingData'], (res) => updateXAuthStatusUI(res.xAuth || {}, res.xDataSyncStatus || {}, res));
      showToast(t('toast_x_connected', 'X connected'), 'system');
    });
  });

  document.getElementById('btn-disconnect-x')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'disconnectXAccount' }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        showToast(response?.error || chrome.runtime.lastError?.message || 'Disconnect X failed', 'error');
        return;
      }
      updateXAuthStatusUI({}, {});
      showToast(t('toast_x_disconnected', 'X disconnected'), 'system');
    });
  });

  
  const customPersonaInput = document.getElementById('custom-persona');
  if (customPersonaInput) customPersonaInput.addEventListener('blur', saveMemory);

  const customTweetingStrategyInput = document.getElementById('custom-tweeting-strategy');
  if (customTweetingStrategyInput) customTweetingStrategyInput.addEventListener('blur', saveMemory);
  
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
      // Clear active states on regenerate
      document.getElementById('btn-feedback-like')?.classList.remove('active', 'primary');
      document.getElementById('btn-feedback-dislike')?.classList.remove('active', 'primary');
      
      if (lastActionType) {
        executeMagicAction(lastActionType, true);
      } else {
        addLog('no_context', 'error');
      }
    });
  }

  const btnLike = document.getElementById('btn-feedback-like');
  if (btnLike) {
    btnLike.addEventListener('click', () => {
      btnLike.classList.add('active', 'primary');
      document.getElementById('btn-feedback-dislike')?.classList.remove('active', 'primary');
      import('../options.js').then(module => {
        module.recordPreferenceFeedback(module.originalAIOutput, 'like', currentContext);
      });
    });
  }

  const btnDislike = document.getElementById('btn-feedback-dislike');
  if (btnDislike) {
    btnDislike.addEventListener('click', () => {
      btnDislike.classList.add('active', 'primary');
      document.getElementById('btn-feedback-like')?.classList.remove('active', 'primary');
      import('../options.js').then(module => {
        module.recordPreferenceFeedback(module.originalAIOutput, 'dislike', currentContext);
      });
    });
  }

  const resultBoxUI = document.getElementById('generation-result');
  if (resultBoxUI) {
    resultBoxUI.addEventListener('click', () => {
      const text = resultBoxUI.textContent.trim();
      if (!text || text === '✨ 正在生成爆款文案...') return;
      navigator.clipboard.writeText(text).then(() => {
        showToast(t('toast_copied'), 'system');
      }).catch(err => {
        addLog('copy_failed', 'error', [err.message]);
      });
    });
  }

  const btnSaveLib = document.getElementById('btn-save-library');
  if (btnSaveLib) {
    btnSaveLib.addEventListener('click', () => {
      const text = document.getElementById('generation-result').textContent.trim();
      if (!text) return;
      chrome.storage.local.get({ draftVault: [] }, (res) => {
        const vault = res.draftVault;
        vault.unshift(normalizePostRecord({
          id: 'manual-' + Date.now(),
          text: text,
          author: 'Manual Rewrite',
          authorName: 'Manual Rewrite',
          source: 'Manual Rewrite',
          origin: POST_ORIGIN.MANUAL_REWRITE,
          contentMode: POST_CONTENT_MODE.REWRITE,
          status: POST_STATUS.DRAFT,
          savedAt: Date.now()
        }));
        const trimmedVault = vault.slice(0, 100);
        chrome.storage.local.set({ draftVault: trimmedVault }, () => {
          renderVault(trimmedVault);
          btnSaveLib.textContent = '';
          const i = document.createElement('i');
          i.dataset.lucide = 'check';
          i.setAttribute('width', '18');
          i.setAttribute('height', '18');
          btnSaveLib.appendChild(i);
          btnSaveLib.setAttribute('aria-label', t('toast_saved').replace('✨ ', ''));
          btnSaveLib.title = t('toast_saved').replace('✨ ', '');
          if (window.lucide) window.lucide.createIcons();
        });
      });
    });
  }

  document.getElementById('btn-manual-rewrite').addEventListener('click', () => {
    const val = document.getElementById('manual-input').value.trim();
    if (!val) {
      addLog('enter_material', 'error');
      return;
    }
    // Simulate new context
    setCurrentContext({
      type: 'tweet',
      data: {
        text: val,
        authorName: '外部素材导入',
        authorHandle: 'manual',
        sourceType: 'manual_input'
      }
    });
    // Run rewrite
    executeMagicAction('viral_rewrite');
    const manualInput = document.getElementById('manual-input');
    manualInput.value = '';
    manualInput.dispatchEvent(new Event('input', { bubbles: true }));
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
      addLog(isEnabled ? 'automation_started' : 'automation_stopped', isEnabled ? 'system' : 'error');
      if (isEnabled) {
        chrome.runtime.sendMessage({ action: 'ensureAutomationXTab', reason: 'options_toggle', active: false }, () => {
          void chrome.runtime.lastError;
        });
      }
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

export function setupCustomSelects() {
  document.querySelectorAll('.custom-select-container').forEach(container => {
    if (container.dataset.initialized) return;
    container.dataset.initialized = 'true';
    
    const trigger = container.querySelector('.custom-select-trigger');
    const options = container.querySelectorAll('.custom-select-option');
    const hiddenInput = container.querySelector('input[type="hidden"]');
    const label = trigger.querySelector('span');

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const isOpen = container.classList.contains('open');
      
      // Close all others
      document.querySelectorAll('.custom-select-container').forEach(c => {
        c.classList.remove('open');
      });
      
      if (!isOpen) {
        container.classList.add('open');
      }
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

export function addStyleItem(text = '', container = null) {
  if (!container) container = document.getElementById('style-training-list');
  if (!container) return;
  
  const div = document.createElement('div');
  div.style.position = 'relative';
  
  const textarea = document.createElement('textarea');
  textarea.className = 'modern-input user-config-input style-item-textarea';
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
  textarea.style.color = 'var(--text-sub)';
  textarea.style.fontSize = '12px';
  
  textarea.addEventListener('focus', () => {
    mask.style.display = 'none';
    gradient.style.display = 'none';
    textarea.style.height = '100px';
    textarea.style.resize = 'vertical';
    textarea.style.overflow = 'auto';
    textarea.style.whiteSpace = 'normal';
    textarea.style.color = 'var(--text-sub)';
    textarea.style.fontSize = '12px';
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
    textarea.style.color = 'var(--text-sub)';
    textarea.style.fontSize = '12px';
    textarea.style.paddingTop = '8px';
    textarea.style.paddingBottom = '8px';
    textarea.scrollTop = 0;
  });
  textarea.placeholder = t('placeholder_style', '粘贴一条过往的高赞推文...');
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
  const delIcon = document.createElement('i');
  delIcon.dataset.lucide = 'x';
  delIcon.setAttribute('width', '14');
  delIcon.setAttribute('height', '14');
  delBtn.appendChild(delIcon);
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
    if (request.streamId && request.streamId !== window.currentStreamId) return;
    const resultBox = document.getElementById('generation-result');
    if (resultBox) {
      // Store latest output
      setOriginalAIOutput(resultBox.textContent += request.chunk);
      resultBox.scrollTop = resultBox.scrollHeight;
    }
  }
});

export function applyTheme(theme) {
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

function formatXDataSyncStatus(syncStatus = {}, connected = false) {
  if (!connected) {
    return {
      text: t('x_data_status_idle', 'Connect X to read Profile, language, and baseline performance context.'),
      tone: ''
    };
  }
  if (!syncStatus?.updatedAt) {
    return {
      text: t('x_data_status_syncing', 'Scanning X Profile for account and performance context...'),
      tone: 'warning'
    };
  }
  if (syncStatus.status === 'syncing') {
    return {
      text: t('x_data_status_syncing', 'Scanning X Profile for account and performance context...'),
      tone: 'warning'
    };
  }
  if (syncStatus.status === 'profile_only') {
    return {
      text: t('x_data_status_profile_only', 'X Profile is connected. Add writing samples manually.'),
      tone: 'learning'
    };
  }
  if (syncStatus.status === 'page_scan') {
    return {
      text: t('x_data_status_learning', 'X Profile context synced. Add writing samples manually.'),
      tone: 'learning'
    };
  }
  if (syncStatus.status === 'unavailable') {
    return {
      text: t('x_data_status_unavailable', 'Performance context is not available yet. Add writing samples manually.'),
      tone: 'warning'
    };
  }
  return {
    text: t('x_data_status_syncing', 'Scanning X Profile for account and performance context...'),
    tone: 'warning'
  };
}

function getProfileSyncDisplayStatus(syncStatus = {}, fallback = {}, auth = {}) {
  const hasSyncTime = Number(syncStatus?.profileEnrichedAt || syncStatus?.updatedAt || 0) > 0;
  if (hasSyncTime) return syncStatus || {};
  const fallbackTime = Number(
    auth?.profileScannedAt
    || fallback?.accountPerformanceBaseline?.scannedAt
    || 0
  ) || 0;
  if (!fallbackTime) return syncStatus || {};
  return {
    ...(syncStatus || {}),
    profileEnrichedAt: fallbackTime,
    updatedAt: fallbackTime
  };
}

export function updateXAuthStatusUI(auth = {}, syncStatus = null, fallback = {}) {
  const text = document.getElementById('x-auth-status-text');
  const card = document.getElementById('x-connect-card');
  const status = document.getElementById('x-auth-status');
  const dataStatus = document.getElementById('x-data-sync-status');
  const connectBtn = document.getElementById('btn-connect-x');
  const disconnectBtn = document.getElementById('btn-disconnect-x');
  const syncBtn = document.getElementById('btn-sync-x-profile');
  if (!text) return;
  const displaySyncStatus = getProfileSyncDisplayStatus(syncStatus || {}, fallback || {}, auth || {});

  const username = auth.user?.username || '';
  const connected = Boolean(auth.accessToken);
  if (auth.accessToken) {
    text.removeAttribute('data-i18n');
    dataStatus?.removeAttribute('data-i18n');
    card?.classList.add('is-connected');
    status?.classList.add('is-connected');
    text.textContent = username ? `@${username}` : (getCurrentLang() === 'zh' ? '已连接' : 'Connected');
    if (connectBtn) connectBtn.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
    if (syncBtn) syncBtn.style.display = 'inline-flex';
  } else {
    text.setAttribute('data-i18n', 'x_status_not_connected');
    dataStatus?.setAttribute('data-i18n', 'x_data_status_idle');
    card?.classList.remove('is-connected');
    status?.classList.remove('is-connected');
    text.textContent = t('x_status_not_connected', 'Not connected');
    if (connectBtn) connectBtn.style.display = 'inline-flex';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (syncBtn) syncBtn.style.display = 'none';
  }
  if (dataStatus) {
    const nextStatus = formatXDataSyncStatus(displaySyncStatus || {}, connected);
    dataStatus.textContent = nextStatus.text;
    dataStatus.classList.toggle('is-learning', nextStatus.tone === 'learning');
    dataStatus.classList.toggle('is-warning', nextStatus.tone === 'warning');
  }
}

export let apiVerificationTimer = null;

// Clear any pending verification
export function updateApiStatusIndicator() {
  const dot = document.getElementById('api-status-dot');
  const textSpan = document.getElementById('api-status-text');
  if (!dot || !textSpan) return;
  
  const apiKey = document.getElementById('api-key-input').value.trim();
  const lang = normalizeEngineLanguage(document.getElementById('engine-language')?.value || 'auto', navigator.language);
  
  if (apiVerificationTimer) clearTimeout(apiVerificationTimer);
  
  if (apiKey.length > 10) {
    // Show Verifying state
    dot.style.background = '#F59E0B'; // Yellow
    dot.classList.add('pulse');
    textSpan.textContent = t('api_verifying', lang === 'zh' ? '正在验证...' : 'Verifying...');
    textSpan.style.color = '#F59E0B';
    
    // Ping background script after 800ms debounce
    apiVerificationTimer = setTimeout(() => {
      if (chrome && chrome.runtime) {
        try {
          chrome.runtime.sendMessage({ action: "testApiConnection", apiKey: apiKey, apiProvider: document.getElementById('api-provider')?.value || 'gemini' }, (response) => {
            if (chrome.runtime.lastError) {
              dot.style.background = '#EF4444'; // Red
              dot.classList.remove('pulse');
              textSpan.textContent = t('api_refresh_panel', lang === 'zh' ? '请刷新面板 (系统已更新)' : 'Please refresh panel');
              textSpan.style.color = '#EF4444';
              return;
            }
            if (response && response.success) {
              dot.style.background = '#10B981'; // Green
              dot.classList.add('pulse');
              textSpan.textContent = t('api_connected', lang === 'zh' ? '已连接' : 'Connected');
              textSpan.style.color = '#10B981';
            } else {
              dot.style.background = '#EF4444'; // Red
              dot.classList.remove('pulse');
              textSpan.textContent = t('api_invalid', lang === 'zh' ? '验证失败' : 'Invalid Key');
              textSpan.style.color = '#EF4444';
              console.error("API Verification failed:", response?.error);
            }
          });
        } catch (e) {
          dot.style.background = '#EF4444'; // Red
          dot.classList.remove('pulse');
          textSpan.textContent = t('api_refresh_panel', lang === 'zh' ? '请刷新面板 (系统已更新)' : 'Please refresh panel');
          textSpan.style.color = '#EF4444';
        }
      }
    }, 800);
  } else {
    dot.style.background = '#EF4444'; // Red
    dot.classList.remove('pulse');
    textSpan.textContent = t('api_not_connected', lang === 'zh' ? '未连接' : 'Not Connected');
    textSpan.style.color = 'var(--text-sub)';
  }
}

export function resetCustomPrompt() {
  const promptInput = document.getElementById('custom-strategy-prompt');
  if (promptInput) {
    promptInput.value = '';
    saveMemory();
    
    const btn = document.getElementById('btn-reset-prompt');
    const oldText = btn.textContent;
    const lang = normalizeEngineLanguage(document.getElementById('engine-language')?.value || 'auto', navigator.language);
    
    btn.textContent = '';
    const i = document.createElement('i');
    i.dataset.lucide = 'check';
    i.setAttribute('width', '12');
    i.setAttribute('height', '12');
    btn.appendChild(i);
    const span = document.createElement('span');
    span.style.color = '#10B981';
    span.textContent = ' ' + t('btn_reset_done', lang === 'zh' ? '已重置' : 'Reset');
    btn.appendChild(span);
    if (window.lucide) window.lucide.createIcons();
    
    setTimeout(() => {
      btn.textContent = oldText;
      const originalIcon = document.createElement('i');
      originalIcon.dataset.lucide = 'refresh-cw';
      originalIcon.setAttribute('width', '12');
      originalIcon.setAttribute('height', '12');
      btn.insertBefore(originalIcon, btn.firstChild);
      if (window.lucide) window.lucide.createIcons();
    }, 1500);
  }
}
