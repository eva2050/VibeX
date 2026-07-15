import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStudioSessionFromResult, selectGenerationCandidate } from './core/generationAttribution.js';
import { orchestrateStudioGeneration } from './core/studioGeneration.js';
import { resolveContentSkill } from './core/contentSkills/registry.js';
import './core/contentSkills/zh/postSkill.js';

function queuedModel(outputs) {
  let index = 0;
  const calls = [];
  return {
    calls,
    callModel: async (prompt) => {
      calls.push(prompt);
      return outputs[index++];
    }
  };
}

const contentSkill = resolveContentSkill({
  language: 'zh',
  format: 'post',
  objective: 'studio_rewrite'
});
const sourceText = '很多 AI 产品第一次使用很惊艳，但第二次打开时上下文又断了。';
const model = queuedModel([
  'AI 产品第一次惊艳不难，难的是第二次打开时上下文还能不能接上。',
  JSON.stringify({
    selectedCandidateId: 'candidate-a',
    scores: [
      { id: 'candidate-a', total: 92, hardFailures: [] }
    ],
    rationale: '这篇初稿忠实、具体，也没有说教感。'
  })
]);
const result = await orchestrateStudioGeneration({
  promptType: 'viral_rewrite',
  sourceText,
  engineLanguage: 'zh',
  generationContext: {},
  contentSkill
}, model);

assert.deepEqual(result.candidates.map(item => item.strategyId), [
  'product_feedback'
]);
assert.equal(result.contentSkill.id, 'zh-x-post');
assert.equal(result.contentSkill.version, '1.2.0');
assert.equal(result.contentFamily, 'product_observation');
assert.match(model.calls[1], /自然中文 X 表达/);
assert.match(model.calls[0], /信号类型/);
assert.match(model.calls[0], /素材强度/);
assert.match(model.calls[0], /停止条件/);
assert.match(model.calls[0], /研究语料不提供当前主题/);
assert.equal(model.calls.length, 2);
assert.equal(result.candidates.length, 1);

const session = buildStudioSessionFromResult({
  generationId: 'gen-zh-skill',
  promptType: 'viral_rewrite',
  sourceText,
  result,
  engineLanguage: 'zh',
  now: 1700000000000
});
assert.equal(session.contentSkillId, 'zh-x-post');
assert.equal(session.contentSkillVersion, '1.2.0');
assert.equal(session.contentFamily, 'product_observation');
assert.deepEqual(session.candidateStrategyIds, [
  'product_feedback'
]);
const switchedSession = selectGenerationCandidate(session, 'candidate-a', 1700000000010);
assert.equal(switchedSession.contentSkillId, 'zh-x-post');
assert.equal(switchedSession.contentSkillVersion, '1.2.0');

const englishModel = queuedModel([
  'A repeated workflow matters more than a demo.',
  JSON.stringify({
    selectedCandidateId: 'candidate-a',
    scores: [{ id: 'candidate-a', total: 90, hardFailures: [] }],
    rationale: 'Faithful.'
  })
]);
const englishResult = await orchestrateStudioGeneration({
  promptType: 'viral_rewrite',
  sourceText: 'A repeated workflow matters more than a demo.',
  engineLanguage: 'en',
  generationContext: {},
  contentSkill: null
}, englishModel);
assert.equal(englishResult.contentSkill, undefined);
assert.equal(englishResult.candidates.some(item => item.strategyId), false);

const replyModel = queuedModel([
  '上下文不断，用户才有继续对话的理由。',
  JSON.stringify({
    selectedCandidateId: 'candidate-a',
    scores: [{ id: 'candidate-a', total: 90, hardFailures: [] }],
    rationale: '具体。'
  })
]);
const replyResult = await orchestrateStudioGeneration({
  promptType: 'draft_reply',
  sourceText,
  engineLanguage: 'zh',
  generationContext: {},
  contentSkill
}, replyModel);
assert.equal(replyResult.contentSkill, undefined);
assert.equal(replyResult.candidates.some(item => item.strategyId), false);

const handlerSource = readFileSync(new URL('./handlers/llmHandler.js', import.meta.url), 'utf8');
assert.match(handlerSource, /config\.contentSkillRollout\?\.zhPostStudio === true/);
assert.match(handlerSource, /objective: 'studio_rewrite'/);
assert.match(handlerSource, /req\.promptType === 'viral_rewrite'/);
const backgroundSource = readFileSync(new URL('./background.js', import.meta.url), 'utf8');
assert.match(backgroundSource, /normalizeContentSkillRollout/);

console.log('Chinese post Studio integration checks passed');
