const fs = require('fs');
const path = require('path');

const optionsPath = path.join(__dirname, 'options.js');
let code = fs.readFileSync(optionsPath, 'utf8');

// We will construct options.js, i18n.js, logs.js, settings.js

function extractRegex(name, regex) {
    const match = code.match(regex);
    if (!match) throw new Error("Could not find " + name);
    code = code.replace(match[0], '');
    return match[0];
}

// Extract i18n logic
const fragDictRegex = /\/\/ Fragment dictionary[\s\S]*?const _fragKeys = Object\.keys\(_fragDict\)\.sort\(\(a, b\) => b\.length - a\.length\);/;
const fragDictStr = extractRegex('_fragDict', fragDictRegex);

const getCurrentLangStr = extractRegex('getCurrentLang', /function getCurrentLang\(\) \{[\s\S]*?return lang;\n\}/);
const tStr = extractRegex('t', /function t\(key, fallback\) \{[\s\S]*?return dict\[key\] \|\| fallback \|\| key;\n\}/);
const translateBackendLogStr = extractRegex('translateBackendLog', /function translateBackendLog\(msg, lang, depth = 0\) \{[\s\S]*?return translated;\n\}/);
const applyLanguageStr = extractRegex('applyLanguage', /function applyLanguage\(lang\) \{[\s\S]*?\}\);\n\}/);

const i18nCode = `import { renderVault } from './logs.js';\n\n${fragDictStr}\n\nexport ${getCurrentLangStr}\n\nexport ${tStr}\n\nexport ${translateBackendLogStr}\n\nexport ${applyLanguageStr}\n`;

// Extract logs logic
const renderLogsStr = extractRegex('renderLogs', /function renderLogs\(logsArray\) \{[\s\S]*?container\.appendChild\(div\);\n  \}\n\}/);
const addLogStr = extractRegex('addLog', /function addLog\(message, type = 'system'\) \{[\s\S]*?chrome\.storage\.local\.set\(\{ logs \}\);\n  \}\);\n\}/);
const renderVaultStr = extractRegex('renderVault', /function renderVault\(vault\) \{[\s\S]*?\}\n\}/);

const logsCode = `import { getCurrentLang, translateBackendLog, t } from './i18n.js';\nimport { showToast, recordFeedbackLoop } from '../options.js';\n\nexport ${renderLogsStr}\n\nexport ${addLogStr}\n\nexport ${renderVaultStr}\n`;

// Extract settings logic
const loadMemoryStr = extractRegex('loadMemory', /function loadMemory\(\) \{[\s\S]*?\}\);\n\}/);
const saveMemoryStr = extractRegex('saveMemory', /function saveMemory\(\) \{[\s\S]*?\}\n\}/);
const bindActionsStr = extractRegex('bindActions', /function bindActions\(\) \{[\s\S]*?\}\);\n  \}\n\}/);
const updatePreflightStatusStr = extractRegex('updatePreflightStatus', /function updatePreflightStatus\(apiKey\) \{[\s\S]*?\}\);\n  \}\n\}/);
const updateEngineBadgeStr = extractRegex('updateEngineBadge', /function updateEngineBadge\(isEnabled\) \{[\s\S]*?\}\n\}/);
const addStyleItemStr = extractRegex('addStyleItem', /function addStyleItem\(text = '', container = null\) \{[\s\S]*?\}\n\}/);
const setupCustomSelectsStr = extractRegex('setupCustomSelects', /function setupCustomSelects\(\) \{[\s\S]*?\}\);\n\}/);
const applyThemeStr = extractRegex('applyTheme', /function applyTheme\(theme\) \{[\s\S]*?\}\n\}/);
const resetCustomPromptStr = extractRegex('resetCustomPrompt', /function resetCustomPrompt\(\) \{[\s\S]*?\}\n\}/);
const updateApiStatusIndicatorStr = extractRegex('updateApiStatusIndicator', /let apiVerificationTimer = null;\nfunction updateApiStatusIndicator\(\) \{[\s\S]*?\}\n\}/);

const settingsCode = `import { applyLanguage, t, getCurrentLang } from './i18n.js';\nimport { renderVault, addLog, renderLogs } from './logs.js';\nimport { executeMagicAction, currentContext, lastActionType } from '../options.js';\n\nexport ${updatePreflightStatusStr}\n\nexport ${loadMemoryStr}\n\nexport ${saveMemoryStr}\n\nexport ${updateEngineBadgeStr}\n\nexport ${bindActionsStr}\n\nexport ${setupCustomSelectsStr}\n\nexport ${addStyleItemStr}\n\nexport ${applyThemeStr}\n\nexport ${updateApiStatusIndicatorStr}\n\nexport ${resetCustomPromptStr}\n`;

// Prepare updated options.js
const optionsPrefix = `import { getCurrentLang, t, translateBackendLog, applyLanguage } from './ui/i18n.js';\nimport { renderLogs, addLog, renderVault } from './ui/logs.js';\nimport { loadMemory, saveMemory, bindActions, updatePreflightStatus, updateEngineBadge, addStyleItem, setupCustomSelects, applyTheme, updateApiStatusIndicator, resetCustomPrompt } from './ui/settings.js';\n\n// Export state for other modules\nexport { currentContext, lastActionType, showToast, recordFeedbackLoop, executeMagicAction };\n\n`;

// Make some variables block scoped exportable by modifying the original code
code = code.replace(/let currentContext =/, 'let currentContext ='); 
// Actually we need to make them exported
code = code.replace(/let currentContext =/, 'export let currentContext =');
code = code.replace(/let originalAIOutput =/, 'export let originalAIOutput =');
code = code.replace(/let lastActionType =/, 'export let lastActionType =');

code = code.replace(/function showToast/, 'export function showToast');
code = code.replace(/function recordFeedbackLoop/, 'export function recordFeedbackLoop');
code = code.replace(/function executeMagicAction/, 'export function executeMagicAction');

const finalOptionsCode = optionsPrefix + code;

fs.writeFileSync(path.join(__dirname, 'ui/i18n.js'), i18nCode);
fs.writeFileSync(path.join(__dirname, 'ui/logs.js'), logsCode);
fs.writeFileSync(path.join(__dirname, 'ui/settings.js'), settingsCode);
fs.writeFileSync(path.join(__dirname, 'options.js'), finalOptionsCode);

console.log("Extraction complete!");
