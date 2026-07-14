
import { createLogEntry } from './logCatalog.js';

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (res) => resolve(res));
  });
}

function setStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

const MAX_LOGS = 50;

function addLog(level, messageOrKey, args = [], extra = {}) {
  const entry = createLogEntry(level, messageOrKey, args, {
    source: 'background',
    ...extra
  });
  chrome.storage.local.get(['logs'], (result) => {
    let logs = result.logs || [];
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    chrome.storage.local.set({ logs });
  });
}

function getConfigErrors(config) {
  const errors = [];
  if (!config.apiKey) errors.push('缺少 API Key');

  if ((config.apiProvider || 'gemini') !== 'gemini' && !config.aiModel) errors.push('缺少模型名称');
  return errors;
}

function getAIConnectionErrors(config) {
  const errors = [];
  if (!config.apiKey) errors.push('缺少 API Key');
  if ((config.apiProvider || 'gemini') !== 'gemini' && !config.aiModel) errors.push('缺少模型名称');
  return errors;
}

function isConfigValid(config) {
  return getConfigErrors(config).length === 0;
}

function getAutomationMode(config) {
  return config.onboardingStrategy?.automationMode || 'autoEngage';
}

function canAutoPublish(config = {}) {
  const mode = getAutomationMode(config);
  return mode === 'autoPost' || mode === 'autoEngage';
}


export { MAX_LOGS, getStorage, setStorage, addLog, getConfigErrors, getAIConnectionErrors, isConfigValid, getAutomationMode, canAutoPublish };
