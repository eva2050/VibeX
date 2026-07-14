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

console.log('studio quality golden checks passed');
