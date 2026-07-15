import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildStudioSessionFromResult,
  buildVaultRecordFromSession,
  selectGenerationCandidate
} from './core/generationAttribution.js';

const NOW = 1700000000000;
const session = buildStudioSessionFromResult({
  generationId: 'gen-flow',
  promptType: 'viral_rewrite',
  sourceText: 'source',
  result: {
    text: 'selected B',
    selectedCandidateId: 'candidate-b',
    candidates: [
      { id: 'candidate-a', text: 'candidate A' },
      { id: 'candidate-b', text: 'selected B' }
    ],
    judge: {
      scores: [
        { id: 'candidate-a', total: 84 },
        { id: 'candidate-b', total: 90 }
      ]
    }
  },
  engineLanguage: 'en',
  now: NOW
});
const alternative = selectGenerationCandidate(session, 'candidate-a', NOW + 10);
assert.equal(alternative.selectedCandidateId, 'candidate-a');
assert.equal(alternative.selectedText, 'candidate A');
assert.equal(alternative.finalText, 'candidate A');
assert.equal(session.selectedCandidateId, 'candidate-b');

const record = buildVaultRecordFromSession({
  ...alternative,
  finalText: 'human edited',
  savedAt: NOW + 20
});
assert.equal(record.generationId, 'gen-flow');
assert.equal(record.originalAIOutput, 'candidate A');
assert.equal(record.text, 'human edited');
assert.equal(record.source, 'source');

const handlerSource = readFileSync(new URL('./handlers/llmHandler.js', import.meta.url), 'utf8');
assert.match(handlerSource, /orchestrateStudioGeneration/);
assert.match(handlerSource, /buildStudioSessionFromResult/);
assert.match(handlerSource, /generationSessions/);

const html = readFileSync(new URL('./options/options.html', import.meta.url), 'utf8');
assert.match(html, /id="generation-result"[^>]+contenteditable="true"/);
assert.match(html, /id="generation-candidates"/);

const optionsSource = readFileSync(new URL('./options/options.js', import.meta.url), 'utf8');
assert.match(optionsSource, /currentGenerationSession/);
assert.match(optionsSource, /persistCurrentGenerationText/);
assert.match(optionsSource, /renderGenerationCandidates/);

console.log('studio session flow checks passed');
