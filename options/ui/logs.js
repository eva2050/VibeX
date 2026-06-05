import { getCurrentLang, translateBackendLog, t } from './i18n.js';
import { showToast, recordFeedbackLoop } from '../options.js';

export function renderLogs(logsArray) {
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

export function addLog(message, type = 'system') {
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

export function renderVault(vault) {
  const feed = document.getElementById('library-feed');
  feed.textContent = '';
  
  const countEl = document.getElementById('library-count');
  if (countEl) {
    countEl.innerText = vault ? `(${vault.length})` : '(0)';
  }
  
  if (!vault || vault.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 120px 20px; color: var(--text-sub); text-align: center;';
    
    const icon = document.createElement('i');
    icon.dataset.lucide = 'package-open';
    icon.style.cssText = 'width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5;';
    emptyState.appendChild(icon);
    
    const title = document.createElement('div');
    title.style.cssText = 'font-size: 16px; font-weight: 500; margin-bottom: 8px; color: var(--text-main);';
    title.textContent = t('vault_empty_title');
    emptyState.appendChild(title);
    
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size: 14px; opacity: 0.8; line-height: 1.6;';
    desc.textContent = t('vault_empty_desc');
    emptyState.appendChild(desc);
    
    feed.appendChild(emptyState);
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const frag = document.createDocumentFragment();
  vault.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'vault-card';
    
    const date = new Date(item.savedAt || Date.now());
    const lang = getCurrentLang();
    const dateStr = lang === 'en' 
      ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    
    let titleText = item.text.split('\n')[0].substring(0, 40);
    if (titleText.length === 40) titleText += '...';

    // Main Card
    const mainDiv = document.createElement('div');
    mainDiv.className = 'vault-card-main';
    mainDiv.id = `vault-card-main-${index}`;
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'vault-card-title';
    titleDiv.textContent = titleText;
    mainDiv.appendChild(titleDiv);
    
    const textarea = document.createElement('textarea');
    textarea.className = 'vault-card-textarea';
    textarea.id = `vault-text-${index}`;
    textarea.value = item.text;
    mainDiv.appendChild(textarea);
    
    div.appendChild(mainDiv);
    
    // Footer
    const footerDiv = document.createElement('div');
    footerDiv.className = 'vault-card-footer';
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'vault-card-date';
    const dateIconSpan = document.createElement('span');
    dateIconSpan.style.opacity = '0.7';
    const dateIcon = document.createElement('i');
    dateIcon.dataset.lucide = 'file-text';
    dateIcon.setAttribute('width', '14');
    dateIcon.setAttribute('height', '14');
    dateIconSpan.appendChild(dateIcon);
    dateDiv.appendChild(dateIconSpan);
    dateDiv.appendChild(document.createTextNode(' ' + dateStr));
    footerDiv.appendChild(dateDiv);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'vault-card-actions';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'vault-action-btn delete-btn vault-delete-btn';
    deleteBtn.dataset.index = index;
    deleteBtn.title = t('vault_delete');
    const deleteIcon = document.createElement('i');
    deleteIcon.dataset.lucide = 'trash-2';
    deleteIcon.setAttribute('width', '14');
    deleteIcon.setAttribute('height', '14');
    deleteBtn.appendChild(deleteIcon);
    deleteBtn.appendChild(document.createTextNode(' ' + t('vault_delete')));
    actionsDiv.appendChild(deleteBtn);
    
    const injectBtn = document.createElement('button');
    injectBtn.className = 'vault-action-btn inject-btn vault-inject-btn';
    injectBtn.dataset.index = index;
    injectBtn.title = t('vault_copy');
    const injectIcon = document.createElement('i');
    injectIcon.dataset.lucide = 'copy';
    injectIcon.setAttribute('width', '14');
    injectIcon.setAttribute('height', '14');
    injectBtn.appendChild(injectIcon);
    injectBtn.appendChild(document.createTextNode(' ' + t('vault_copy')));
    actionsDiv.appendChild(injectBtn);
    
    footerDiv.appendChild(actionsDiv);
    div.appendChild(footerDiv);
    frag.appendChild(div);
    
    // Expandable Logic
    mainDiv.addEventListener('click', (e) => {
      if (e.target === textarea && div.classList.contains('expanded')) return;
      div.classList.toggle('expanded');
      if (div.classList.contains('expanded')) {
        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      } else {
        textarea.style.height = '60px'; 
      }
    });
    
    // Auto-resize
    textarea.addEventListener('input', () => {
      if (div.classList.contains('expanded')) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      }
    });
    
    // Auto-save
    textarea.addEventListener('blur', () => {
      const newText = textarea.value.trim();
      if (newText !== item.text) {
        chrome.storage.local.get({ draftVault: [] }, (items) => {
          const v = items.draftVault;
          if (v[index]) {
            v[index].text = newText;
            chrome.storage.local.set({ draftVault: v }, () => {
               dateDiv.textContent = '';
               const saveSpan = document.createElement('span');
               saveSpan.style.color = '#34c759';
               saveSpan.textContent = '✓ 已自动保存';
               dateDiv.appendChild(saveSpan);
               setTimeout(() => {
                 dateDiv.textContent = '';
                 dateDiv.appendChild(dateIconSpan);
                 dateDiv.appendChild(document.createTextNode(' ' + dateStr));
               }, 2000);
            });
          }
        });
      }
    });
  });
  
  feed.appendChild(frag);
  
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
      
      const oldText = btn.textContent;
      btn.textContent = '';
      const checkIcon = document.createElement('i');
      checkIcon.dataset.lucide = 'check';
      checkIcon.setAttribute('width', '14');
      checkIcon.setAttribute('height', '14');
      btn.appendChild(checkIcon);
      btn.appendChild(document.createTextNode(' ' + t('toast_copied')));
      if(window.lucide) window.lucide.createIcons();
      setTimeout(() => {
        btn.textContent = '';
        const oldIcon = document.createElement('i');
        oldIcon.dataset.lucide = 'copy';
        oldIcon.setAttribute('width', '14');
        oldIcon.setAttribute('height', '14');
        btn.appendChild(oldIcon);
        btn.appendChild(document.createTextNode(' ' + t('vault_copy')));
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
