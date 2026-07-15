import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CHINESE_POST_FIXTURES } from '../benchmarks/chinesePostFixtures.js';
import {
  compareBlindResults,
  evaluateChinesePostBenchmark
} from '../core/contentSkills/zh/postBenchmark.js';

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

function readJson(path = '') {
  if (!path || !existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

function getGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (_) {
    return 'unknown';
  }
}

function getReleaseDecision(deterministic = {}, liveBlindComparison = {}) {
  const reasons = [];
  if (!deterministic.releaseGate?.deterministicPassed) {
    reasons.push(...(deterministic.releaseGate?.failures || ['deterministic_gate_failed']));
  }
  if (liveBlindComparison.status !== 'passed') {
    reasons.push(liveBlindComparison.status === 'credentials_required'
      ? 'live_blind_comparison_not_run'
      : 'live_blind_win_rate_below_65_percent');
  }
  return {
    status: reasons.length ? 'hold' : 'release',
    rolloutEnabled: reasons.length === 0,
    reasons: [...new Set(reasons)]
  };
}

function buildChinesePostReleaseReport({
  fixtures = CHINESE_POST_FIXTURES,
  outputs = [],
  currentResults = [],
  skillResults = [],
  judgments = [],
  commit = getGitCommit(),
  generatedAt = new Date().toISOString()
} = {}) {
  const deterministic = evaluateChinesePostBenchmark(fixtures, outputs);
  const liveBlindComparison = compareBlindResults(currentResults, skillResults, judgments);
  return {
    ...deterministic,
    liveBlindComparison,
    releaseDecision: getReleaseDecision(deterministic, liveBlindComparison),
    commit,
    generatedAt
  };
}

function markdownReport(report) {
  const percent = value => `${Math.round(Number(value || 0) * 1000) / 10}%`;
  return [
    '# Chinese X Post Skill v1 Benchmark',
    '',
    `- Skill: \`${report.skillId}@${report.skillVersion}\``,
    `- Commit: \`${report.commit}\``,
    `- Fixtures: ${report.fixtureCount}`,
    `- Evaluated candidates: ${report.candidateCount}`,
    `- Claim preservation: ${percent(report.claimPreservationRate)}`,
    `- Unsupported facts: ${report.unsupportedFactCount}`,
    `- Certainty escalation: ${percent(report.certaintyEscalationRate)}`,
    `- Template hits: ${percent(report.templateHitRate)}`,
    `- Expansion violations: ${percent(report.expansionViolationRate)}`,
    `- Strategy duplication: ${percent(report.strategyDuplicationRate)}`,
    `- Family routing accuracy: ${percent(report.familyRoutingAccuracy)}`,
    `- Deterministic gate: ${report.releaseGate.deterministicPassed ? 'passed' : 'failed'}`,
    `- Live blind comparison: ${report.liveBlindComparison.status}`,
    `- Live blind win rate: ${report.liveBlindComparison.winRate === null ? 'not available' : percent(report.liveBlindComparison.winRate)}`,
    `- Release decision: **${report.releaseDecision.status.toUpperCase()}**`,
    `- Rollout enabled: ${report.releaseDecision.rolloutEnabled ? 'yes' : 'no'}`,
    '',
    '## Gate failures',
    '',
    ...(report.releaseGate.failures.length ? report.releaseGate.failures.map(item => `- ${item}`) : ['- none']),
    '',
    '## Release decision reasons',
    '',
    ...(report.releaseDecision.reasons.length ? report.releaseDecision.reasons.map(item => `- ${item}`) : ['- none']),
    '',
    '## Missing output fixture IDs',
    '',
    ...(report.missingFixtureIds.length ? report.missingFixtureIds.map(item => `- ${item}`) : ['- none']),
    '',
    '## Failed fixture IDs',
    '',
    ...(report.failedFixtureIds.length ? report.failedFixtureIds.map(item => `- ${item}`) : ['- none']),
    ''
  ].join('\n');
}

function runCli() {
  const report = buildChinesePostReleaseReport({
    outputs: readJson(getArg('--outputs')),
    currentResults: readJson(getArg('--current-results')),
    skillResults: readJson(getArg('--skill-results')),
    judgments: readJson(getArg('--judgments'))
  });
  const reportPath = getArg('--report');
  if (reportPath) writeFileSync(reportPath, markdownReport(report));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();

export {
  buildChinesePostReleaseReport,
  getReleaseDecision,
  markdownReport
};
