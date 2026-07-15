import assert from 'node:assert/strict';
import {
  CHINESE_POST_FIXTURES
} from './benchmarks/chinesePostFixtures.js';
import {
  compareBlindResults,
  evaluateChinesePostBenchmark
} from './core/contentSkills/zh/postBenchmark.js';
import { SUPPORTED_CHINESE_POST_FAMILIES } from './core/contentSkills/zh/postStrategies.js';
import { ZH_POST_SKILL } from './core/contentSkills/zh/postSkill.js';

assert.equal(CHINESE_POST_FIXTURES.length, 60);
assert.equal(new Set(CHINESE_POST_FIXTURES.map(item => item.id)).size, 60);
for (const family of SUPPORTED_CHINESE_POST_FAMILIES) {
  assert.equal(
    CHINESE_POST_FIXTURES.filter(item => item.family === family).length,
    10,
    family
  );
}
for (const fixture of CHINESE_POST_FIXTURES) {
  assert.ok(fixture.input.length >= 12, fixture.id);
  assert.ok(fixture.requiredTerms.length >= 1, fixture.id);
  assert.ok(Array.isArray(fixture.forbiddenStructures), fixture.id);
  assert.ok(Number(fixture.maxExpansionRatio) > 0, fixture.id);
}
const routedFixtureCount = CHINESE_POST_FIXTURES.filter((fixture) => (
  ZH_POST_SKILL.analyze({ text: fixture.input }).family === fixture.family
)).length;
assert.ok(routedFixtureCount / CHINESE_POST_FIXTURES.length >= 0.95);

const fixture = CHINESE_POST_FIXTURES[0];
const outputs = [{
  fixtureId: fixture.id,
  candidates: [
    {
      strategyId: 'faithful_sharpening',
      text: 'AI 产品第一次惊艳不难，难的是让上下文接得上，让用户愿意第二次回来。'
    },
    {
      strategyId: 'cognitive_reframe',
      text: '决定 AI 产品重复使用的，可能不是功能数量，而是上下文能不能连续。'
    },
    {
      strategyId: 'concrete_scene',
      text: '第二次打开还要重新解释上下文，再多功能也很难变成用户会重复使用的 AI 产品。'
    }
  ]
}];
const report = evaluateChinesePostBenchmark([fixture], outputs);
assert.equal(report.fixtureCount, 1);
assert.equal(report.candidateCount, 3);
assert.equal(report.unsupportedFactCount, 0);
assert.equal(report.claimPreservationRate, 1);
assert.equal(report.templateHitRate, 0);
assert.equal(report.strategyDuplicationRate, 0);
assert.equal(report.familyRoutingAccuracy, 1);
assert.equal(report.releaseGate.deterministicPassed, true);

const missing = evaluateChinesePostBenchmark([fixture], []);
assert.equal(missing.releaseGate.deterministicPassed, false);
assert.equal(missing.releaseGate.failures.includes('missing_outputs'), true);

const noCredentials = compareBlindResults([], [], []);
assert.deepEqual(noCredentials, {
  status: 'credentials_required',
  comparisonCount: 0,
  skillWins: 0,
  currentWins: 0,
  ties: 0,
  winRate: null
});

const blind = compareBlindResults(
  [{ fixtureId: 'a' }, { fixtureId: 'b' }],
  [{ fixtureId: 'a' }, { fixtureId: 'b' }],
  [{ fixtureId: 'a', winner: 'skill' }, { fixtureId: 'b', winner: 'current' }]
);
assert.equal(blind.status, 'failed');
assert.equal(blind.winRate, 0.5);

console.log('Chinese post benchmark checks passed');
