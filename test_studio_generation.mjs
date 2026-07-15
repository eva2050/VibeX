import assert from 'node:assert/strict';
import { orchestrateStudioGeneration } from './core/studioGeneration.js';

function queuedModel(outputs) {
  let index = 0;
  const calls = [];
  return {
    calls,
    callModel: async (prompt) => {
      calls.push(prompt);
      const value = outputs[index++];
      if (value instanceof Error) throw value;
      return value;
    }
  };
}

const normalModel = queuedModel([
  'Weak generic output.',
  'The demo is not the product. The workflow people repeat is.',
  'A product becomes real when people repeat the boring workflow.',
  JSON.stringify({
    selectedCandidateId: 'candidate-b',
    scores: [
      { id: 'candidate-a', total: 55, hardFailures: ['no_concrete_signal'] },
      { id: 'candidate-b', total: 90, hardFailures: [] },
      { id: 'candidate-c', total: 84, hardFailures: [] }
    ],
    rationale: 'Candidate B preserves the source claim and adds a concrete contrast.'
  })
]);
const normal = await orchestrateStudioGeneration({
  promptType: 'viral_rewrite',
  sourceText: 'Demos do not matter if nobody repeats the workflow.',
  engineLanguage: 'en',
  generationContext: {}
}, normalModel);
assert.equal(normalModel.calls.length, 4);
assert.equal(normal.selectedCandidateId, 'candidate-b');
assert.equal(normal.text, 'The demo is not the product. The workflow people repeat is.');
assert.equal(normal.quality.approved, true);
assert.equal(normal.repaired, false);

const partialModel = queuedModel([
  new Error('provider timeout'),
  'The workflow matters when a user repeats it next week.',
  'A repeatable workflow is stronger evidence than a polished demo.',
  JSON.stringify({
    selectedCandidateId: 'candidate-b',
    scores: [{ id: 'candidate-b', total: 88, hardFailures: [] }],
    rationale: 'Specific and faithful.'
  })
]);
const partial = await orchestrateStudioGeneration({
  promptType: 'viral_rewrite',
  sourceText: 'A repeated workflow matters more than a demo.',
  engineLanguage: 'en',
  generationContext: {}
}, partialModel);
assert.equal(partialModel.calls.length, 4);
assert.equal(partial.selectedCandidateId, 'candidate-b');
assert.match(partial.text, /next week/);

const repairModel = queuedModel([
  'I agree with the original post.',
  'Interesting point about the workflow.',
  JSON.stringify({
    selectedCandidateId: 'candidate-a',
    scores: [{ id: 'candidate-a', total: 70, hardFailures: [] }],
    rationale: 'Too generic and adds no observation.'
  }),
  'The workflow test is simple: does the same user come back next week without a reminder?'
]);
const repaired = await orchestrateStudioGeneration({
  promptType: 'draft_reply',
  sourceText: 'A product is a workflow users repeat.',
  engineLanguage: 'en',
  generationContext: {}
}, repairModel);
assert.equal(repairModel.calls.length, 4);
assert.equal(repaired.repaired, true);
assert.match(repaired.text, /come back next week/);
assert.equal(repaired.quality.approved, true);

const failedModel = queuedModel([
  new Error('candidate A failed'),
  new Error('candidate B failed'),
  new Error('candidate C failed')
]);
await assert.rejects(
  () => orchestrateStudioGeneration({
    promptType: 'viral_rewrite',
    sourceText: 'source',
    engineLanguage: 'en',
    generationContext: {}
  }, failedModel),
  /All Studio candidate calls failed/
);

const invalidJudgeModel = queuedModel([
  'A concrete workflow observation.',
  'Another concrete workflow observation.',
  'The workflow is useful when repeated.',
  'not-json'
]);
await assert.rejects(
  () => orchestrateStudioGeneration({
    promptType: 'viral_rewrite',
    sourceText: 'A workflow is useful when repeated.',
    engineLanguage: 'en',
    generationContext: {}
  }, invalidJudgeModel),
  /Invalid Studio judge response/
);

console.log('studio generation orchestration checks passed');
