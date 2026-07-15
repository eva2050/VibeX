import assert from 'node:assert/strict';
import {
  attributeSyncedPostToVault,
  buildStudioSessionFromResult,
  buildVaultRecordFromSession,
  createGenerationSession,
  findGenerationMatch,
  mergeAttributedPost,
  recordGenerationAction,
  updateGenerationSessionText
} from './core/generationAttribution.js';

const NOW = 1700000000000;
const original = createGenerationSession({
  id: 'gen-1',
  promptType: 'viral_rewrite',
  accountId: 'account-1',
  inputText: 'Demos do not matter if nobody repeats the workflow.',
  selectedText: 'The workflow is the product.',
  engineLanguage: 'en',
  createdAt: NOW
});

const edited = updateGenerationSessionText(
  original,
  'The repeated workflow is the real product.',
  NOW + 10
);
assert.equal(original.finalText, 'The workflow is the product.');
assert.equal(edited.finalText, 'The repeated workflow is the real product.');
assert.equal(edited.updatedAt, NOW + 10);

const copied = recordGenerationAction(edited, 'copy', NOW + 20);
assert.equal(copied.copiedAt, NOW + 20);
assert.equal(edited.copiedAt, undefined);

const exact = findGenerationMatch({
  text: 'The repeated workflow is the real product.',
  language: 'en',
  accountId: 'account-1'
}, [copied], { now: NOW + 30 });
assert.equal(exact.session.id, 'gen-1');
assert.equal(exact.method, 'exact_final');
assert.equal(exact.score, 1);

const selectedMatch = findGenerationMatch({
  text: 'The workflow is the product.',
  language: 'en',
  accountId: 'account-1'
}, [copied], { now: NOW + 30 });
assert.equal(selectedMatch.method, 'exact_selected');

const fuzzy = findGenerationMatch({
  text: 'The repeated workflow is usually the real product.',
  language: 'en',
  accountId: 'account-1'
}, [copied], {
  now: NOW + 30,
  fuzzyThreshold: 0.8
});
assert.equal(fuzzy.method, 'fuzzy_final');

const ambiguous = findGenerationMatch({
  text: 'Ship a useful workflow',
  language: 'en',
  accountId: 'account-1'
}, [
  { ...copied, id: 'gen-a', finalText: 'Ship one useful workflow' },
  { ...copied, id: 'gen-b', finalText: 'Ship a truly useful workflow' }
], {
  now: NOW + 30,
  fuzzyThreshold: 0.65,
  ambiguityGap: 0.2
});
assert.equal(ambiguous, null);

assert.equal(findGenerationMatch({
  text: copied.finalText,
  language: 'en',
  accountId: 'another-account'
}, [copied], { now: NOW + 30 }), null);

assert.equal(findGenerationMatch({
  text: copied.finalText,
  language: 'ja',
  accountId: 'account-1'
}, [copied], { now: NOW + 30 }), null);

assert.equal(findGenerationMatch({
  text: copied.finalText,
  language: 'en',
  accountId: 'account-1'
}, [copied], { now: NOW + 8 * 24 * 60 * 60 * 1000 }), null);

assert.equal(findGenerationMatch({
  text: copied.finalText,
  language: 'en',
  accountId: 'account-1'
}, [{ ...copied, publication: { statusId: 'already' } }], { now: NOW + 30 }), null);

const sessionFromResult = buildStudioSessionFromResult({
  generationId: 'gen-flow',
  promptType: 'viral_rewrite',
  accountId: 'account-1',
  sourceText: 'source',
  inputContext: { url: 'https://example.com' },
  result: {
    text: 'selected',
    selectedCandidateId: 'candidate-b',
    candidates: [{ id: 'candidate-b', text: 'selected' }],
    judge: { scores: [{ id: 'candidate-b', total: 90 }] }
  },
  engineLanguage: 'en',
  now: NOW
});
assert.equal(sessionFromResult.id, 'gen-flow');
assert.equal(sessionFromResult.finalText, 'selected');
assert.equal(sessionFromResult.objective, 'studio_rewrite');

const vaultRecord = buildVaultRecordFromSession({
  ...sessionFromResult,
  finalText: 'human edited',
  savedAt: NOW + 50
});
assert.equal(vaultRecord.generationId, 'gen-flow');
assert.equal(vaultRecord.originalAIOutput, 'selected');
assert.equal(vaultRecord.text, 'human edited');
assert.equal(vaultRecord.source, 'source');
assert.equal(vaultRecord.status, 'draft');

const merged = mergeAttributedPost(vaultRecord, {
  statusId: '123',
  postUrl: 'https://x.com/user/status/123',
  text: 'human edited',
  createdAt: NOW + 100,
  performanceMetrics: { views: 0 }
}, { now: NOW + 110, method: 'exact_final', score: 1 });
assert.equal(merged.statusId, '123');
assert.equal(merged.status, 'published');
assert.equal(merged.generationId, 'gen-flow');
assert.equal(merged.attribution.method, 'exact_final');

const attributed = attributeSyncedPostToVault({
  post: {
    statusId: '456',
    postUrl: 'https://x.com/user/status/456',
    text: 'human edited',
    language: 'en',
    accountId: 'account-1',
    createdAt: NOW + 200
  },
  sessions: [{
    ...sessionFromResult,
    finalText: 'human edited',
    copiedAt: NOW + 150
  }],
  vault: [vaultRecord, { id: 'other', text: 'keep me' }],
  now: NOW + 210
});
assert.equal(attributed.post.generationId, 'gen-flow');
assert.equal(attributed.vault.length, 2);
assert.equal(attributed.vault[0].statusId, '456');
assert.equal(attributed.sessions[0].publication.statusId, '456');
assert.equal(attributed.vault[1].id, 'other');

console.log('generation attribution checks passed');
