import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessStudioOutputQuality } from './core/studioQuality.js';

const cases = JSON.parse(readFileSync(new URL('./fixtures/studio_golden_cases.json', import.meta.url), 'utf8'));

assert.ok(Array.isArray(cases));
assert.ok(cases.length >= 6);

for (const item of cases) {
  const result = assessStudioOutputQuality(item.input, item.output, item.rules || {});
  assert.equal(
    result.approved,
    item.expectApproved,
    `${item.id} expected approved=${item.expectApproved}, got issues=${result.issues.join(',')}`
  );

  for (const issue of item.expectedIssues || []) {
    assert.ok(result.issues.includes(issue), `${item.id} should include issue ${issue}; got ${result.issues.join(',')}`);
  }
}

const languageMismatch = assessStudioOutputQuality(
  'A repeated workflow matters more than a demo.',
  '繰り返されるワークフローこそが、本当のプロダクトです。',
  { engineLanguage: 'en', requireTopicOverlap: true }
);
assert.ok(languageMismatch.issues.includes('language_mismatch'));

const topicDrift = assessStudioOutputQuality(
  'A repeated workflow matters more than a polished demo.',
  'The best restaurant recipes start with seasonal vegetables.',
  { engineLanguage: 'en', requireTopicOverlap: true }
);
assert.ok(topicDrift.issues.includes('topic_drift'));

const faithful = assessStudioOutputQuality(
  'A repeated workflow matters more than a polished demo.',
  'A polished demo is not the product. The workflow users repeat is.',
  { engineLanguage: 'en', requireTopicOverlap: true }
);
assert.equal(faithful.issues.includes('language_mismatch'), false);
assert.equal(faithful.issues.includes('topic_drift'), false);

console.log('studio quality golden checks passed');
