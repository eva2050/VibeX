import { fetchGist, updateGist, createGist, findExistingVibeXGist } from '../utils/gistSync.js';
import { addLog } from './state.js';

const SYNC_KEYS = [
  'apiKey', 'apiProvider', 'aiModel', 'customPromptGlobal', 'petEnabled',
  'accountBio', 'leadTarget', 'aiPersona', 'styleTrainingData',
  'engineLanguage', 'replyStrategy', 'feedbackLoopData', 'collectedTweets',
  'onboardingStrategy', 'targetUsers', 'competitorReport', 'agentMemory', 'smartTimeSlots', 'postsPerDay', 'postInterval'
];

export async function pullFromGist(token, gistId) {
  if (!token) return;
  try {
    let id = gistId;
    if (!id) {
      id = await findExistingVibeXGist(token);
      if (id) chrome.storage.local.set({ gistId: id });
    }
    if (!id) return;

    const { content, updatedAt } = await fetchGist(token, id);
    
    // Check local timestamp
    const local = await chrome.storage.local.get(['gistLastSyncAt']);
    if (local.gistLastSyncAt && local.gistLastSyncAt >= updatedAt) {
      return; // Local is up to date or newer
    }

    const updates = { gistLastSyncAt: updatedAt, gistStatus: 'synced', gistLastError: '' };
    for (const key of SYNC_KEYS) {
      if (content[key] !== undefined) updates[key] = content[key];
    }
    
    await chrome.storage.local.set(updates);
    addLog('success', '已成功从云端 (Github Gist) 拉取最新配置。');
  } catch (e) {
    chrome.storage.local.set({ gistStatus: 'error', gistLastError: e.message });
    addLog('error', `从云端拉取配置失败: ${e.message}`);
  }
}

export async function pushToGist(token, gistId) {
  if (!token) return;
  try {
    const data = await chrome.storage.local.get(SYNC_KEYS);
    let id = gistId;
    let updatedAt;
    
    if (!id) {
      const existingId = await findExistingVibeXGist(token);
      if (existingId) {
        id = existingId;
      } else {
        const result = await createGist(token, data);
        id = result.id;
        updatedAt = result.updatedAt;
      }
      if (id) chrome.storage.local.set({ gistId: id });
    }
    
    if (!updatedAt) {
      const result = await updateGist(token, id, data);
      updatedAt = result.updatedAt;
    }
    
    await chrome.storage.local.set({ gistLastSyncAt: updatedAt, gistStatus: 'synced', gistLastError: '' });
  } catch (e) {
    chrome.storage.local.set({ gistStatus: 'error', gistLastError: e.message });
    addLog('error', `同步到云端失败: ${e.message}`);
  }
}
