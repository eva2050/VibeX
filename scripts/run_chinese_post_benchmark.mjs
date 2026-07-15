import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

function markdownReport(report) {
  const percent = value => `${Math.round(Number(value || 0) * 1000) / 10}%`;
  return [
    '# Chinese X Post Skill v1 Benchmark',
    '',
    `- Skill: \`${report.skillId}@${report.skillVersion}\``,
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
    '',
    '## Gate failures',
    '',
    ...(report.releaseGate.failures.length ? report.releaseGate.failures.map(item => `- ${item}`) : ['- none']),
    '',
    '## Failed fixture IDs',
    '',
    ...(report.failedFixtureIds.length ? report.failedFixtureIds.map(item => `- ${item}`) : ['- none']),
    ''
  ].join('\n');
}

const outputs = readJson(getArg('--outputs'));
const currentResults = readJson(getArg('--current-results'));
const skillResults = readJson(getArg('--skill-results'));
const judgments = readJson(getArg('--judgments'));
const deterministic = evaluateChinesePostBenchmark(CHINESE_POST_FIXTURES, outputs);
const report = {
  ...deterministic,
  liveBlindComparison: compareBlindResults(currentResults, skillResults, judgments),
  generatedAt: new Date().toISOString()
};
const reportPath = getArg('--report');
if (reportPath) writeFileSync(reportPath, markdownReport(report));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
