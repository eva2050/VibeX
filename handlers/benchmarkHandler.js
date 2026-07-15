import { callLLM } from '../services/llm.js';
import { buildGenerationContext } from '../core/generationContext.js';
import { orchestrateStudioGeneration } from '../core/studioGeneration.js';
import { buildStudioRewriteInput } from '../core/studioRewriteInput.js';
import { CHINESE_POST_FIXTURES } from '../benchmarks/chinesePostFixtures.js';
import { ZH_POST_SKILL } from '../core/contentSkills/zh/postSkill.js';
import { normalizeContentSkillRollout } from '../core/contentSkillRollout.js';
import {
  assignAnonymousArms, finalizeBlindBenchmark, parseBatchReviewFeedback,
  selectBlindBenchmarkFixtures, selectReviewBatch
} from '../core/contentSkills/zh/postBlindBenchmark.js';

const STORAGE_KEY = 'chinesePostBlindBenchmarkV1';
const CONFIG_KEYS = ['apiKey', 'apiProvider', 'aiModel', 'engineLanguage', 'accountBio', 'aiPersona', 'agentMemory', 'aiMemory', 'styleTrainingData', 'feedbackLoopData', 'feedbackLikes', 'feedbackDislikes', 'accountPerformanceBaseline', 'contentSkillRollout'];

function chromeGet(keys) { return new Promise(resolve => chrome.storage.local.get(keys, resolve)); }
function chromeSet(value) { return new Promise(resolve => chrome.storage.local.set(value, resolve)); }

function createBenchmarkController(deps = {}) {
  const getStorage = deps.getStorage || chromeGet;
  const setStorage = deps.setStorage || chromeSet;
  const callModel = deps.callModel || callLLM;
  const read = async () => (await getStorage([STORAGE_KEY]))[STORAGE_KEY] || null;
  const write = async state => { await setStorage({ [STORAGE_KEY]: state }); return state; };

  async function start() {
    const config = await getStorage(CONFIG_KEYS);
    if (!config.apiKey || String(config.apiKey).startsWith('mock-')) return { success: false, error: 'ERR_MISSING_API_KEY' };
    const selected = selectBlindBenchmarkFixtures(CHINESE_POST_FIXTURES);
    const state = {
      schemaVersion: 1, id: `zh-post-benchmark-${Date.now()}`, status: 'running',
      skillId: ZH_POST_SKILL.id, skillVersion: ZH_POST_SKILL.version,
      configSnapshot: { apiProvider: config.apiProvider, aiModel: config.aiModel, engineLanguage: 'zh' },
      fixtureIds: selected.map(item => item.id), fixtures: {}, reviewFixtureIds: [], reviewFeedback: null,
      createdAt: Date.now(), updatedAt: Date.now()
    };
    await write(state);
    return { success: true, state };
  }

  async function generateArm(fixture, skill) {
    const config = await getStorage(CONFIG_KEYS);
    const generationContext = buildGenerationContext({ ...config, engineLanguage: 'zh' }, { promptType: 'viral_rewrite' });
    return orchestrateStudioGeneration(buildStudioRewriteInput({
      sourceText: fixture.input, config: { ...config, engineLanguage: 'zh' }, generationContext, contentSkill: skill
    }), { callModel: prompt => callModel(prompt, config, false) });
  }

  async function judge(fixture, record, order) {
    const config = await getStorage(CONFIG_KEYS);
    const labels = order === 'first' ? record.anonymous.first : record.anonymous.second;
    const texts = labels.map(arm => record[arm].text);
    const prompt = `你是中文 X 内容盲评员。素材：${fixture.input}\nA：${texts[0]}\nB：${texts[1]}\n只返回 JSON：{"winner":"A|B|tie","gap":0}`;
    const parsed = JSON.parse(String(await callModel(prompt, config, false)).replace(/```json|```/g, '').trim());
    const winner = parsed.winner === 'A' ? labels[0] : parsed.winner === 'B' ? labels[1] : 'tie';
    return { winner, gap: Number(parsed.gap) || 0 };
  }

  async function runNext() {
    const state = await read();
    if (!state || state.status !== 'running') return { success: false, error: 'ERR_BENCHMARK_NOT_RUNNING', state };
    const fixture = CHINESE_POST_FIXTURES.find(item => state.fixtureIds.includes(item.id) && (!state.fixtures[item.id] || (state.fixtures[item.id].judgments || []).length < 2));
    if (!fixture) {
      state.reviewFixtureIds = selectReviewBatch(state);
      state.status = 'review_ready'; state.updatedAt = Date.now();
      await write(state); return { success: true, state };
    }
    const record = state.fixtures[fixture.id] || { fixtureId: fixture.id, family: fixture.family, judgments: [], anonymous: assignAnonymousArms(state.id, fixture.id) };
    if (!record.current) record.current = await generateArm(fixture, null);
    else if (!record.skill) {
      record.skill = await generateArm(fixture, ZH_POST_SKILL);
      const diagnosis = ZH_POST_SKILL.analyze({ text: fixture.input });
      const evaluation = ZH_POST_SKILL.evaluateDeterministically(fixture.input, record.skill.text, diagnosis);
      record.skill.deterministic = {
        claimPreserved: fixture.requiredTerms.every(term => record.skill.text.includes(term)),
        unsupportedFacts: evaluation.issues.filter(issue => ['unsupported_number', 'unsupported_entity'].includes(issue)).length,
        templateHit: evaluation.issues.includes('template_tone')
      };
    }
    else record.judgments.push(await judge(fixture, record, record.judgments.length ? 'second' : 'first'));
    state.fixtures[fixture.id] = record; state.updatedAt = Date.now(); await write(state);
    return { success: true, state };
  }

  async function submitReview(text) {
    const state = await read();
    if (!state || state.status !== 'review_ready') return { success: false, error: 'ERR_REVIEW_NOT_READY' };
    state.reviewFeedback = parseBatchReviewFeedback(text); state.report = finalizeBlindBenchmark(state); state.status = 'completed'; state.updatedAt = Date.now();
    await write(state);
    if (state.report.releaseDecision.rolloutEnabled) {
      const config = await getStorage(['contentSkillRollout']);
      await setStorage({ contentSkillRollout: { ...normalizeContentSkillRollout(config.contentSkillRollout), zhPostStudio: true, zhPostAuto: false } });
    }
    return { success: true, state };
  }

  return { start, runNext, get: read, submitReview, reset: async () => { await setStorage({ [STORAGE_KEY]: null }); return { success: true }; } };
}

function handleBenchmarkMessage(request, sender, sendResponse) {
  const controller = createBenchmarkController();
  const actions = {
    startChinesePostBenchmark: () => controller.start(),
    runNextChinesePostBenchmarkStep: () => controller.runNext(),
    getChinesePostBenchmark: async () => ({ success: true, state: await controller.get() }),
    submitChinesePostBenchmarkReview: () => controller.submitReview(request.feedback || ''),
    resetChinesePostBenchmark: () => controller.reset()
  };
  if (!actions[request.action]) return false;
  actions[request.action]().then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
  return true;
}

export { STORAGE_KEY, createBenchmarkController, handleBenchmarkMessage };
