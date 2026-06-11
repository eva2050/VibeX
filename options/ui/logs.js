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

export function renderAiMemory(memory = {}, vault = []) {
  const list = document.getElementById('ai-memory-list');
  if (!list) return;

  const rules = Array.isArray(memory.learnedRules) ? memory.learnedRules : [];
  const reviewedPosts = Array.isArray(vault) ? vault.filter(item => Number(item?.actualViews) > 0) : [];
  const accuratePosts = reviewedPosts.filter(item => {
    const prediction = inferPrediction(item);
    return getDeviation(prediction, Number(item.actualViews)).status === 'hit';
  });
  const accuracy = reviewedPosts.length > 0 ? Math.round((accuratePosts.length / reviewedPosts.length) * 100) : null;

  const reviewedEl = document.getElementById('learning-reviewed-count');
  const accuracyEl = document.getElementById('learning-accuracy');
  const rulesEl = document.getElementById('learning-rules-count');
  if (reviewedEl) reviewedEl.textContent = String(reviewedPosts.length);
  if (accuracyEl) accuracyEl.textContent = accuracy === null ? '-' : `${accuracy}%`;
  if (rulesEl) rulesEl.textContent = String(rules.length);

  list.textContent = '';

  if (rules.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ai-memory-empty';
    empty.textContent = t('ai_memory_empty', 'No post feedback yet.');
    list.appendChild(empty);
    return;
  }

  rules.slice(0, 4).forEach((rule) => {
    const item = document.createElement('div');
    item.className = 'ai-memory-item';
    item.textContent = rule.text || String(rule);
    list.appendChild(item);
  });
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function roundToNiceNumber(num) {
  if (num >= 10000) return Math.round(num / 1000) * 1000;
  if (num >= 1000) return Math.round(num / 100) * 100;
  return Math.round(num / 50) * 50;
}

function formatViews(num) {
  const value = Number(num) || 0;
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `${Math.round(value)}`;
}

function parseViewsInput(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/,/g, '');
  if (!value) return null;
  const match = value.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const unit = match[2];
  if (unit === 'm') return Math.round(base * 1000000);
  if (unit === 'k') return Math.round(base * 1000);
  return Math.round(base);
}

function inferPrediction(item = {}) {
  if (item.prediction?.minViews && item.prediction?.maxViews) return item.prediction;

  const text = item.text || '';
  const length = text.length;
  const lineCount = text.split('\n').filter(Boolean).length;
  const hasNumbers = /\d/.test(text);
  const hasQuestion = /[?？]/.test(text);
  const hasExternalLink = /https?:\/\//i.test(text);
  const hasStrongHook = /(stop|never|why|truth|mistake|secret|unpopular|hot take|别|不要|为什么|真相|错了|反常识|爆款|踩坑)/i.test(text);

  let score = 2600;
  if (length >= 80 && length <= 240) score += 1400;
  if (lineCount >= 3) score += 1200;
  if (hasNumbers) score += 900;
  if (hasQuestion) score += 700;
  if (hasStrongHook) score += 1800;
  if (hasExternalLink) score -= 1200;

  const midpoint = clamp(score, 500, 60000);
  const minViews = roundToNiceNumber(midpoint * 0.55);
  const maxViews = roundToNiceNumber(midpoint * 1.65);
  const confidence = clamp(48 + (hasStrongHook ? 8 : 0) + (lineCount >= 3 ? 6 : 0) - (hasExternalLink ? 10 : 0), 35, 72);

  let reason = 'Clear post structure with moderate reach potential.';
  if (hasStrongHook) reason = 'Strong hook signal, but actual reach still depends on timing and account distribution.';
  else if (hasExternalLink) reason = 'External links usually suppress reach, so prediction is conservative.';
  else if (lineCount >= 3) reason = 'Readable spacing may improve dwell time.';

  return {
    minViews,
    maxViews,
    confidence,
    reason,
    source: 'heuristic_v1',
    createdAt: Date.now()
  };
}

function getPredictionMidpoint(prediction) {
  return Math.max(1, Math.round(((Number(prediction.minViews) || 0) + (Number(prediction.maxViews) || 0)) / 2));
}

function getDeviation(prediction, actualViews) {
  const midpoint = getPredictionMidpoint(prediction);
  const ratio = (actualViews - midpoint) / midpoint;
  const abs = Math.abs(ratio);
  let status = 'hit';
  if (ratio > 0.35) status = 'underestimated';
  if (ratio < -0.35) status = 'overestimated';
  return {
    ratio,
    status,
    label: status === 'hit' ? 'Hit' : status === 'underestimated' ? 'Underestimated' : 'Overestimated',
    detail: status === 'hit' ? 'within range' : `${Math.round(abs * 100)}% ${ratio > 0 ? 'above' : 'below'} prediction`
  };
}

function buildLearning(item, deviation) {
  const text = item.text || '';
  const hasLink = /https?:\/\//i.test(text);
  const hasQuestion = /[?？]/.test(text);
  const hasStrongHook = /(stop|never|why|truth|mistake|secret|unpopular|hot take|别|不要|为什么|真相|错了|反常识|爆款|踩坑)/i.test(text);

  if (deviation.status === 'hit') {
    return 'This prediction pattern is usable for similar posts.';
  }
  if (deviation.status === 'overestimated') {
    if (!hasStrongHook) return 'Lower future predictions when the post lacks a sharp first-line hook.';
    if (hasLink) return 'External links can suppress reach; discount future predictions for linked posts.';
    return 'The idea looked strong, but the hook may need more conflict before predicting high reach.';
  }
  if (hasQuestion) return 'Question-style hooks may deserve a higher reach estimate when they invite clear disagreement.';
  return 'Raise future estimates for concise posts that outperform without heavy structure.';
}

function updateAiMemoryWithLearning(post, callback) {
  chrome.storage.local.get({ aiMemory: { learnedRules: [] } }, (items) => {
    const memory = items.aiMemory || {};
    const learnedRules = Array.isArray(memory.learnedRules) ? memory.learnedRules.slice() : [];
    const text = post.aiLearning;
    if (text && !learnedRules.some(rule => rule.text === text)) {
      learnedRules.unshift({
        text,
        sourcePostId: post.id || String(post.savedAt || Date.now()),
        deviationRatio: post.deviationRatio,
        createdAt: Date.now()
      });
    }
    const nextMemory = {
      ...memory,
      learnedRules: learnedRules.slice(0, 6),
      updatedAt: Date.now()
    };
    chrome.storage.local.set({ aiMemory: nextMemory }, () => {
      chrome.storage.local.get({ draftVault: [] }, (res) => {
        renderAiMemory(nextMemory, res.draftVault);
        callback?.(nextMemory);
      });
    });
  });
}

export function renderVault(vault) {
  const feed = document.getElementById('library-feed');
  feed.textContent = '';
  const displayVault = Array.isArray(vault) ? vault.slice(0, 100) : [];
  
  const countEl = document.getElementById('library-count');
  if (countEl) {
    countEl.innerText = `(${displayVault.length})`;
  }
  
  if (Array.isArray(vault) && vault.length > 100 && typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ draftVault: displayVault });
  }

  if (displayVault.length === 0) {
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
  displayVault.forEach((item, index) => {
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

    const prediction = inferPrediction(item);
    const actualViews = Number(item.actualViews) || 0;
    const isReviewed = actualViews > 0;
    const deviation = actualViews > 0 ? getDeviation(prediction, actualViews) : null;

    const performanceDiv = document.createElement('div');
    performanceDiv.className = 'vault-performance';

    const performanceTop = document.createElement('div');
    performanceTop.className = 'vault-performance-top';

    const predictionDiv = document.createElement('div');
    predictionDiv.className = 'vault-performance-metric';
    predictionDiv.innerHTML = `<span>Prediction</span><strong>${formatViews(prediction.minViews)}-${formatViews(prediction.maxViews)}</strong>`;
    performanceTop.appendChild(predictionDiv);

    const actualDiv = document.createElement('div');
    actualDiv.className = 'vault-performance-metric vault-performance-actual';
    const actualLabel = document.createElement('span');
    actualLabel.textContent = 'Actual';
    actualDiv.appendChild(actualLabel);
    const actualValueRow = document.createElement('div');
    actualValueRow.className = 'vault-performance-value-row';
    const actualValue = document.createElement('strong');
    actualValue.textContent = isReviewed ? formatViews(actualViews) : '-';
    actualValueRow.appendChild(actualValue);
    if (isReviewed) {
      const editActualBtn = document.createElement('button');
      editActualBtn.className = 'vault-performance-edit-btn';
      editActualBtn.dataset.index = index;
      editActualBtn.title = 'Edit actual views';
      const editIcon = document.createElement('i');
      editIcon.dataset.lucide = 'pencil';
      editIcon.setAttribute('width', '13');
      editIcon.setAttribute('height', '13');
      editActualBtn.appendChild(editIcon);
      actualValueRow.appendChild(editActualBtn);
    }
    actualDiv.appendChild(actualValueRow);
    performanceTop.appendChild(actualDiv);

    const badge = document.createElement('div');
    badge.className = `vault-performance-badge ${deviation ? deviation.status : 'pending'}`;
    badge.textContent = deviation ? deviation.label : 'Pending';
    performanceTop.appendChild(badge);
    performanceDiv.appendChild(performanceTop);

    const reason = document.createElement('div');
    reason.className = 'vault-performance-reason';
    reason.textContent = prediction.reason;
    performanceDiv.appendChild(reason);

    const controls = document.createElement('div');
    controls.className = 'vault-performance-controls';
    if (isReviewed) controls.classList.add('is-hidden');

    const viewsInput = document.createElement('input');
    viewsInput.className = 'vault-performance-input vault-performance-views';
    viewsInput.placeholder = 'Actual views';
    viewsInput.value = actualViews > 0 ? String(actualViews) : '';
    viewsInput.dataset.index = index;
    controls.appendChild(viewsInput);

    const savePerfBtn = document.createElement('button');
    savePerfBtn.className = 'vault-performance-save-btn';
    savePerfBtn.dataset.index = index;
    savePerfBtn.textContent = 'Save';
    controls.appendChild(savePerfBtn);
    performanceDiv.appendChild(controls);

    if (deviation) {
      const result = document.createElement('div');
      result.className = 'vault-performance-result';
      result.textContent = `Result: ${deviation.detail}`;
      performanceDiv.appendChild(result);
    }

    if (item.aiLearning) {
      const learning = document.createElement('div');
      learning.className = 'vault-performance-learning';
      learning.textContent = `AI learned: ${item.aiLearning}`;
      performanceDiv.appendChild(learning);
    }

    div.appendChild(performanceDiv);
    
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

  document.querySelectorAll('.vault-performance-save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      const viewsInput = document.querySelector(`.vault-performance-views[data-index="${idx}"]`);
      const actualViews = parseViewsInput(viewsInput?.value);
      if (!actualViews || actualViews <= 0) {
        showToast('Enter actual views first', 'system');
        return;
      }

      chrome.storage.local.get({ draftVault: [] }, (items) => {
        const currentVault = items.draftVault || [];
        const post = currentVault[idx];
        if (!post) return;

        const prediction = inferPrediction(post);
        const deviation = getDeviation(prediction, actualViews);
        const updatedPost = {
          ...post,
          prediction,
          actualViews,
          deviationRatio: deviation.ratio,
          performanceStatus: deviation.status,
          aiLearning: buildLearning({ ...post, prediction }, deviation),
          reviewedAt: Date.now()
        };
        currentVault[idx] = updatedPost;

        chrome.storage.local.set({ draftVault: currentVault }, () => {
          updateAiMemoryWithLearning(updatedPost, () => {
            addLog('Performance feedback saved. AI memory updated.', 'system');
            showToast('Performance saved', 'system');
            renderVault(currentVault);
          });
        });
      });
    });
  });

  document.querySelectorAll('.vault-performance-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = btn.getAttribute('data-index');
      const controls = btn.closest('.vault-performance')?.querySelector('.vault-performance-controls');
      const viewsInput = document.querySelector(`.vault-performance-views[data-index="${idx}"]`);
      if (controls) controls.classList.remove('is-hidden');
      if (viewsInput) {
        viewsInput.focus();
        viewsInput.select();
      }
    });
  });

  document.querySelectorAll('.vault-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      chrome.storage.local.get({ draftVault: [] }, (items) => {
        const currentVault = (items.draftVault || []).slice(0, 100);
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
