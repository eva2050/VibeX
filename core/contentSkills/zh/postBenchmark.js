import { bigramSimilarity } from '../../generationAttribution.js';
import { ZH_POST_SKILL } from './postSkill.js';

function includesRequiredTerms(text = '', terms = []) {
  const normalized = String(text || '').toLowerCase();
  return (Array.isArray(terms) ? terms : []).every(term => normalized.includes(String(term).toLowerCase()));
}

function evaluateChinesePostBenchmark(fixtures = [], outputs = []) {
  const outputByFixture = new Map(
    (Array.isArray(outputs) ? outputs : []).map(item => [item.fixtureId, item])
  );
  let candidateCount = 0;
  let preservedClaims = 0;
  let unsupportedFactCount = 0;
  let certaintyEscalationCount = 0;
  let templateHitCount = 0;
  let expansionViolationCount = 0;
  let duplicatePairs = 0;
  let comparedPairs = 0;
  let routedCorrectly = 0;
  const missingFixtureIds = [];
  const failedFixtureIds = new Set();

  (Array.isArray(fixtures) ? fixtures : []).forEach((fixture) => {
    const diagnosis = ZH_POST_SKILL.analyze({ text: fixture.input });
    if (diagnosis.family === fixture.family) routedCorrectly += 1;
    const output = outputByFixture.get(fixture.id);
    const candidates = Array.isArray(output?.candidates) ? output.candidates : [];
    if (candidates.length === 0) {
      missingFixtureIds.push(fixture.id);
      return;
    }
    candidateCount += candidates.length;
    candidates.forEach((candidate) => {
      if (includesRequiredTerms(candidate.text, fixture.requiredTerms)) preservedClaims += 1;
      else failedFixtureIds.add(fixture.id);
      const evaluation = ZH_POST_SKILL.evaluateDeterministically(
        fixture.input,
        candidate.text,
        { ...diagnosis, targetLength: { ...diagnosis.targetLength, maxRatio: fixture.maxExpansionRatio } }
      );
      if (evaluation.issues.includes('unsupported_number') || evaluation.issues.includes('unsupported_entity')) {
        unsupportedFactCount += 1;
        failedFixtureIds.add(fixture.id);
      }
      if (evaluation.issues.includes('certainty_escalation')) certaintyEscalationCount += 1;
      if (evaluation.issues.includes('template_tone')) templateHitCount += 1;
      if (evaluation.issues.includes('excessive_expansion')) expansionViolationCount += 1;
    });
    for (let left = 0; left < candidates.length; left += 1) {
      for (let right = left + 1; right < candidates.length; right += 1) {
        comparedPairs += 1;
        const sameStrategy = candidates[left].strategyId
          && candidates[left].strategyId === candidates[right].strategyId;
        if (sameStrategy || bigramSimilarity(candidates[left].text, candidates[right].text) >= 0.82) {
          duplicatePairs += 1;
          failedFixtureIds.add(fixture.id);
        }
      }
    }
  });

  const fixtureCount = fixtures.length;
  const ratio = (value, total) => total > 0 ? value / total : 0;
  const claimPreservationRate = ratio(preservedClaims, candidateCount);
  const templateHitRate = ratio(templateHitCount, candidateCount);
  const strategyDuplicationRate = ratio(duplicatePairs, comparedPairs);
  const familyRoutingAccuracy = ratio(routedCorrectly, fixtureCount);
  const failures = [];
  if (missingFixtureIds.length) failures.push('missing_outputs');
  if (candidateCount && claimPreservationRate < 0.95) failures.push('claim_preservation_below_95_percent');
  if (unsupportedFactCount > 0) failures.push('unsupported_facts_present');
  if (candidateCount && templateHitRate > 0.1) failures.push('template_hit_rate_above_10_percent');
  if (comparedPairs && strategyDuplicationRate > 0.2) failures.push('strategy_duplication_above_20_percent');
  if (familyRoutingAccuracy < 0.95) failures.push('family_routing_below_95_percent');

  return {
    skillId: ZH_POST_SKILL.id,
    skillVersion: ZH_POST_SKILL.version,
    fixtureCount,
    candidateCount,
    claimPreservationRate,
    unsupportedFactCount,
    certaintyEscalationRate: ratio(certaintyEscalationCount, candidateCount),
    templateHitRate,
    expansionViolationRate: ratio(expansionViolationCount, candidateCount),
    strategyDuplicationRate,
    familyRoutingAccuracy,
    missingFixtureIds,
    failedFixtureIds: [...failedFixtureIds],
    releaseGate: {
      deterministicPassed: failures.length === 0 && candidateCount > 0,
      failures
    }
  };
}

function compareBlindResults(currentResults = [], skillResults = [], judgments = []) {
  if (!currentResults.length || !skillResults.length || !judgments.length) {
    return {
      status: 'credentials_required',
      comparisonCount: 0,
      skillWins: 0,
      currentWins: 0,
      ties: 0,
      winRate: null
    };
  }
  const available = new Set(currentResults.map(item => item.fixtureId));
  const skillAvailable = new Set(skillResults.map(item => item.fixtureId));
  const comparable = judgments.filter(item => available.has(item.fixtureId) && skillAvailable.has(item.fixtureId));
  const skillWins = comparable.filter(item => item.winner === 'skill').length;
  const currentWins = comparable.filter(item => item.winner === 'current').length;
  const ties = comparable.length - skillWins - currentWins;
  const winRate = comparable.length ? skillWins / comparable.length : null;
  return {
    status: winRate !== null && winRate >= 0.65 ? 'passed' : 'failed',
    comparisonCount: comparable.length,
    skillWins,
    currentWins,
    ties,
    winRate
  };
}

export {
  compareBlindResults,
  evaluateChinesePostBenchmark,
  includesRequiredTerms
};
