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
  '决定 AI 产品能不能重复使用的，也许不是第一次有多惊艳，而是上下文会不会断。',
  '第二次打开 AI 产品，上下文又断了：第一次的惊艳很难变成重复使用。',
  JSON.stringify({
    selectedCandidateId: 'candidate-a',
    scores: [
      { id: 'candidate-a', total: 92, hardFailures: [] },
      { id: 'candidate-b', total: 88, hardFailures: [] },
      { id: 'candidate-c', total: 86, hardFailures: [] }
    ],
    rationale: '候选 A 最忠实，也最自然。'
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
  'faithful_sharpening',
  'cognitive_reframe',
  'concrete_scene'
]);
assert.equal(result.contentSkill.id, 'zh-x-post');
assert.equal(result.contentSkill.version, '1.0.0');
assert.equal(result.contentFamily, 'product_observation');
assert.match(model.calls[3], /自然中文 X 表达/);
assert.equal(model.calls.length, 4);

const session = buildStudioSessionFromResult({
  generationId: 'gen-zh-skill',
  promptType: 'viral_rewrite',
  sourceText,
  result,
  engineLanguage: 'zh',
  now: 1700000000000
});
assert.equal(session.contentSkillId, 'zh-x-post');
assert.equal(session.contentSkillVersion, '1.0.0');
assert.equal(session.contentFamily, 'product_observation');
assert.deepEqual(session.candidateStrategyIds, [
  'faithful_sharpening',
  'cognitive_reframe',
  'concrete_scene'
]);
const switchedSession = selectGenerationCandidate(session, 'candidate-b', 1700000000010);
assert.equal(switchedSession.contentSkillId, 'zh-x-post');
assert.equal(switchedSession.contentSkillVersion, '1.0.0');

const englishModel = queuedModel([
  'A repeated workflow matters more than a demo.',
  'The demo matters less than repeated use.',
  'Repeat use is stronger evidence than a polished demo.',
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
  '这也说明重复使用比第一次惊艳更重要。',
  '上下文不断，用户才有继续对话的理由。',
  JSON.stringify({
    selectedCandidateId: 'candidate-b',
    scores: [{ id: 'candidate-b', total: 90, hardFailures: [] }],
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
assert.match(handlerSource, /config\.contentSkillRollout\?\.zhPost === true/);
assert.match(handlerSource, /objective: 'studio_rewrite'/);
assert.match(handlerSource, /req\.promptType === 'viral_rewrite'/);
const backgroundSource = readFileSync(new URL('./background.js', import.meta.url), 'utf8');
assert.match(backgroundSource, /contentSkillRollout = \{ zhPost: false \}/);

console.log('Chinese post Studio integration checks passed');
