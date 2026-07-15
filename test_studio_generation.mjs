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
  'The demo is not the product. The workflow people repeat is.',
  JSON.stringify({
    selectedCandidateId: 'candidate-a',
    scores: [
      { id: 'candidate-a', total: 90, hardFailures: [] }
    ],
    rationale: 'The draft preserves the source claim and adds a concrete contrast.'
  })
]);
const normalPhases = [];
const normal = await orchestrateStudioGeneration({
  promptType: 'viral_rewrite',
  sourceText: 'Demos do not matter if nobody repeats the workflow.',
  engineLanguage: 'en',
  generationContext: {}
}, { ...normalModel, onPhase: phase => normalPhases.push(phase) });
assert.equal(normalModel.calls.length, 2);
assert.equal(normal.selectedCandidateId, 'candidate-a');
assert.equal(normal.text, 'The demo is not the product. The workflow people repeat is.');
assert.equal(normal.candidates.length, 1);
assert.equal(normal.quality.approved, true);
assert.equal(normal.repaired, false);
assert.deepEqual(normalPhases, ['generating_draft', 'reviewing_draft']);

const repairModel = queuedModel([
  'I agree with the original post.',
  JSON.stringify({
    selectedCandidateId: 'candidate-a',
    scores: [{ id: 'candidate-a', total: 70, hardFailures: [] }],
    rationale: 'Too generic and adds no observation.'
  }),
  'The workflow test is simple: does the same user come back next week without a reminder?'
]);
const repairPhases = [];
const repaired = await orchestrateStudioGeneration({
  promptType: 'draft_reply',
  sourceText: 'A product is a workflow users repeat.',
  engineLanguage: 'en',
  generationContext: {}
}, { ...repairModel, onPhase: phase => repairPhases.push(phase) });
assert.equal(repairModel.calls.length, 3);
assert.equal(repaired.repaired, true);
assert.match(repaired.text, /come back next week/);
assert.equal(repaired.quality.approved, true);
assert.deepEqual(repairPhases, ['generating_draft', 'reviewing_draft', 'repairing_draft']);

const failedModel = queuedModel([
  new Error('draft failed')
]);
await assert.rejects(
  () => orchestrateStudioGeneration({
    promptType: 'viral_rewrite',
    sourceText: 'source',
    engineLanguage: 'en',
    generationContext: {}
  }, failedModel),
  /Studio draft call failed/
);

const invalidJudgeModel = queuedModel([
  'A concrete workflow observation.',
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
