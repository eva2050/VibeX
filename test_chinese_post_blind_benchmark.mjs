import assert from 'node:assert/strict';
import { CHINESE_POST_FIXTURES } from './benchmarks/chinesePostFixtures.js';
import { SUPPORTED_CHINESE_POST_FAMILIES } from './core/contentSkills/zh/postStrategies.js';
import {
  assignAnonymousArms,
  finalizeBlindBenchmark,
  parseBatchReviewFeedback,
  selectBlindBenchmarkFixtures,
  selectReviewBatch
} from './core/contentSkills/zh/postBlindBenchmark.js';

const selected = selectBlindBenchmarkFixtures(CHINESE_POST_FIXTURES);
assert.equal(selected.length, 24);
for (const family of SUPPORTED_CHINESE_POST_FAMILIES) {
  assert.equal(selected.filter(item => item.family === family).length, 4);
}
assert.deepEqual(assignAnonymousArms('run-1', selected[0].id), assignAnonymousArms('run-1', selected[0].id));

const feedback = parseBatchReviewFeedback('整体 70 分；2、6 最好；4、9 AI 味重；观点不够具体。');
assert.equal(feedback.score, 70);
assert.deepEqual(feedback.bestIds, [2, 6]);
assert.deepEqual(feedback.weakIds, [4, 9]);
assert.deepEqual(feedback.tags, ['template_tone', 'low_specificity']);
assert.equal(parseBatchReviewFeedback('可以，通过').approved, true);

const fixtures = Object.fromEntries(selected.map((fixture, index) => [fixture.id, {
  fixtureId: fixture.id,
  family: fixture.family,
  skill: { text: fixture.input, deterministic: { claimPreserved: true, unsupportedFacts: 0, templateHit: false } },
  current: { text: `${fixture.input} 当前版` },
  judgments: [{ winner: index < 13 ? 'skill' : 'current', gap: index + 1 }, { winner: index < 13 ? 'skill' : 'current', gap: index + 1 }]
}]));
const reviewIds = selectReviewBatch({ fixtures });
assert.equal(reviewIds.length, 10);
for (const family of SUPPORTED_CHINESE_POST_FAMILIES) {
  assert.equal(reviewIds.some(id => fixtures[id].family === family), true);
}

const report = finalizeBlindBenchmark({
  fixtures,
  reviewFeedback: { score: 85, approved: false }
});
assert.equal(report.decisiveCount, 24);
assert.equal(report.skillWins, 13);
assert.equal(report.releaseDecision.status, 'hold');
assert.equal(report.releaseDecision.reasons.includes('blind_win_rate_below_65_percent'), true);

console.log('Chinese post blind benchmark checks passed');
