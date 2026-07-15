import { SUPPORTED_CHINESE_POST_FAMILIES } from './postStrategies.js';

function selectBlindBenchmarkFixtures(fixtures = []) {
  return SUPPORTED_CHINESE_POST_FAMILIES.flatMap(family => (
    fixtures.filter(item => item.family === family).slice(0, 4)
  ));
}

function stableHash(value = '') {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function assignAnonymousArms(runId = '', fixtureId = '') {
  const skillFirst = stableHash(`${runId}|${fixtureId}`) % 2 === 0;
  return {
    first: skillFirst ? ['skill', 'current'] : ['current', 'skill'],
    second: skillFirst ? ['current', 'skill'] : ['skill', 'current'],
    skillLabel: skillFirst ? 'A' : 'B'
  };
}

function parseNumbersAfter(text, pattern) {
  const match = String(text).match(pattern);
  return match ? [...match[1].matchAll(/\d+/g)].map(item => Number(item[0])) : [];
}

function parseBatchReviewFeedback(text = '') {
  const raw = String(text || '').trim();
  const scoreMatch = raw.match(/(?:整体|总分|评分)?\s*(\d{1,3})\s*分?/);
  const tags = [];
  if (/AI\s*味|模板|套话|营销号/.test(raw)) tags.push('template_tone');
  if (/不够具体|太空|空泛|没有细节/.test(raw)) tags.push('low_specificity');
  if (/开头|Hook|首句/i.test(raw)) tags.push('weak_hook');
  return {
    score: scoreMatch ? Math.min(100, Number(scoreMatch[1])) : null,
    approved: /(?:可以|通过|合格|可用)/.test(raw),
    bestIds: parseNumbersAfter(raw, /([\d、,，\s]+)(?:最好|最佳|不错|优秀)/),
    weakIds: parseNumbersAfter(raw, /([\d、,，\s]+)(?:AI\s*味|不好|最差|有问题|较弱)/),
    tags,
    raw
  };
}

function fixturePriority(item = {}) {
  const judgments = item.judgments || [];
  const disagreement = judgments.length < 2 || judgments[0]?.winner !== judgments[1]?.winner;
  const gap = judgments.reduce((sum, value) => sum + Math.abs(Number(value?.gap) || 0), 0);
  const risk = Number(item.skill?.deterministic?.unsupportedFacts || 0) * 100
    + (item.skill?.deterministic?.templateHit ? 50 : 0);
  return { disagreement, gap, risk };
}

function selectReviewBatch(run = {}) {
  const items = Object.values(run.fixtures || {}).sort((left, right) => {
    const a = fixturePriority(left);
    const b = fixturePriority(right);
    if (a.disagreement !== b.disagreement) return a.disagreement ? -1 : 1;
    if (a.risk !== b.risk) return b.risk - a.risk;
    return a.gap - b.gap;
  });
  const selected = [];
  SUPPORTED_CHINESE_POST_FAMILIES.forEach((family) => {
    const item = items.find(value => value.family === family && !selected.includes(value.fixtureId));
    if (item) selected.push(item.fixtureId);
  });
  items.forEach((item) => {
    if (selected.length < 10 && !selected.includes(item.fixtureId)) selected.push(item.fixtureId);
  });
  return selected.slice(0, 10);
}

function finalizeBlindBenchmark(run = {}) {
  const fixtures = Object.values(run.fixtures || {});
  let skillWins = 0;
  let currentWins = 0;
  let ties = 0;
  for (const fixture of fixtures) {
    const [first, second] = fixture.judgments || [];
    if (!first || !second || first.winner !== second.winner) ties += 1;
    else if (first.winner === 'skill') skillWins += 1;
    else if (first.winner === 'current') currentWins += 1;
    else ties += 1;
  }
  const decisiveCount = skillWins + currentWins;
  const winRate = decisiveCount ? skillWins / decisiveCount : 0;
  const skillItems = fixtures.map(item => item.skill?.deterministic || {});
  const unsupportedFactCount = skillItems.reduce((sum, item) => sum + Number(item.unsupportedFacts || 0), 0);
  const templateHitRate = skillItems.length
    ? skillItems.filter(item => item.templateHit).length / skillItems.length
    : 0;
  const claimPreservationRate = skillItems.length
    ? skillItems.filter(item => item.claimPreserved !== false).length / skillItems.length
    : 0;
  const userPassed = run.reviewFeedback?.approved === true || Number(run.reviewFeedback?.score) >= 85;
  const reasons = [];
  if (fixtures.length !== 24) reasons.push('incomplete_outputs');
  if (decisiveCount < 18) reasons.push('decisive_samples_below_18');
  if (winRate < 0.65) reasons.push('blind_win_rate_below_65_percent');
  if (claimPreservationRate < 0.95) reasons.push('claim_preservation_below_95_percent');
  if (unsupportedFactCount > 0) reasons.push('unsupported_facts_present');
  if (templateHitRate > 0.1) reasons.push('template_hit_rate_above_10_percent');
  if (!userPassed) reasons.push('user_review_below_85');
  return {
    fixtureCount: fixtures.length,
    decisiveCount,
    skillWins,
    currentWins,
    ties,
    winRate,
    claimPreservationRate,
    unsupportedFactCount,
    templateHitRate,
    userScore: run.reviewFeedback?.score ?? null,
    releaseDecision: {
      status: reasons.length ? 'hold' : 'release',
      rolloutEnabled: reasons.length === 0,
      reasons
    }
  };
}

export {
  assignAnonymousArms,
  finalizeBlindBenchmark,
  parseBatchReviewFeedback,
  selectBlindBenchmarkFixtures,
  selectReviewBatch
};
