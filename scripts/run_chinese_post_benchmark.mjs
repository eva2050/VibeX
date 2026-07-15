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
  const reasonLabels = {
    missing_outputs: '缺少模型生成结果',
    claim_preservation_below_95_percent: '主张保留率低于 95%',
    unsupported_facts_present: '存在新增事实',
    template_hit_rate_above_10_percent: '模板命中率高于 10%',
    strategy_duplication_above_20_percent: '候选策略重复率高于 20%',
    family_routing_below_95_percent: '内容类型路由准确率低于 95%',
    live_blind_comparison_not_run: '尚未运行真实模型盲测',
    live_blind_win_rate_below_65_percent: '真实盲测胜率低于 65%'
  };
  const reason = value => reasonLabels[value] || value;
  return [
    '# 中文 X Post Skill v1.1 离线回归报告',
    '',
    `- Skill：\`${report.skillId}@${report.skillVersion}\``,
    `- 提交：\`${report.commit}\``,
    `- 素材数量：${report.fixtureCount}`,
    `- 已评估候选：${report.candidateCount}`,
    `- 主张保留率：${percent(report.claimPreservationRate)}`,
    `- 新增事实：${report.unsupportedFactCount}`,
    `- 确定性升级率：${percent(report.certaintyEscalationRate)}`,
    `- 模板命中率：${percent(report.templateHitRate)}`,
    `- 扩写违规率：${percent(report.expansionViolationRate)}`,
    `- 策略重复率：${percent(report.strategyDuplicationRate)}`,
    `- 内容类型路由准确率：${percent(report.familyRoutingAccuracy)}`,
    `- 确定性门槛：${report.releaseGate.deterministicPassed ? '通过' : '未通过'}`,
    `- 真实盲测状态：${report.liveBlindComparison.status}`,
    `- 真实盲测胜率：${report.liveBlindComparison.winRate === null ? '暂无数据' : percent(report.liveBlindComparison.winRate)}`,
    `- 发布决定：**${report.releaseDecision.status === 'release' ? '发布' : '暂缓'}**`,
    `- 是否开启：${report.releaseDecision.rolloutEnabled ? '是' : '否'}`,
    '',
    '## 门槛失败原因',
    '',
    ...(report.releaseGate.failures.length ? report.releaseGate.failures.map(item => `- ${reason(item)}`) : ['- 无']),
    '',
    '## 发布决定原因',
    '',
    ...(report.releaseDecision.reasons.length ? report.releaseDecision.reasons.map(item => `- ${reason(item)}`) : ['- 无']),
    '',
    '## 缺少输出的素材 ID',
    '',
    ...(report.missingFixtureIds.length ? report.missingFixtureIds.map(item => `- ${item}`) : ['- 无']),
    '',
    '## 失败素材 ID',
    '',
    ...(report.failedFixtureIds.length ? report.failedFixtureIds.map(item => `- ${item}`) : ['- 无']),
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
