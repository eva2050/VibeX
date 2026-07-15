import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REPLY_CANDIDATE_BRIEFS,
  REWRITE_CANDIDATE_BRIEFS,
  STUDIO_PASS_SCORE
} from './core/studioGeneration.js';
import {
  MIN_ACTIVE_SAMPLES,
  MIN_CANDIDATE_SAMPLES
} from './core/learningPolicy.js';
import {
  DEFAULT_AMBIGUITY_GAP,
  DEFAULT_FUZZY_THRESHOLD
} from './core/generationAttribution.js';
import { shouldSchedulePerformanceReview } from './core/performanceReviewScheduler.js';
import { buildRelationshipInteraction } from './core/relationshipLoop.js';
import { buildChinesePostReleaseReport } from './scripts/run_chinese_post_benchmark.mjs';

assert.equal(REWRITE_CANDIDATE_BRIEFS.length, 3);
assert.equal(REPLY_CANDIDATE_BRIEFS.length, 2);
assert.equal(STUDIO_PASS_SCORE, 82);
assert.equal(MIN_CANDIDATE_SAMPLES, 5);
assert.equal(MIN_ACTIVE_SAMPLES, 8);
assert.equal(DEFAULT_FUZZY_THRESHOLD, 0.92);
assert.equal(DEFAULT_AMBIGUITY_GAP, 0.05);

const interaction = buildRelationshipInteraction({
  targetAuthor: 'builder',
  sourceStatusId: '123',
  replyText: 'Useful reply',
  completedAt: 100
});
assert.equal(interaction.objective, 'auto_relationship');
assert.equal('views' in interaction.metrics, false);

assert.equal(shouldSchedulePerformanceReview({
  isRunning: false,
  posts: [{ status: 'published', autoReviewEnabled: true, nextAutoReviewAt: 100 }]
}), true);

const html = readFileSync(new URL('./options/options.html', import.meta.url), 'utf8');
assert.match(html, /id="generation-result"[^>]+contenteditable="true"/);
const background = readFileSync(new URL('./background.js', import.meta.url), 'utf8');
assert.match(background, /shouldSchedulePerformanceReview\(\{ posts, now \}\)/);
const router = readFileSync(new URL('./handlers/messageRouter.js', import.meta.url), 'utf8');
assert.match(router, /startChinesePostBenchmark/);
assert.match(router, /submitChinesePostBenchmarkReview/);
const benchmarkHtml = readFileSync(new URL('./options/chinese-post-benchmark.html', import.meta.url), 'utf8');
assert.match(benchmarkHtml, /本轮 10 条内容/);
assert.doesNotMatch(
  background,
  /alarm\.name === PERFORMANCE_REVIEW_ALARM[\s\S]{0,240}!res\.isRunning/
);

const skillReport = buildChinesePostReleaseReport({
  outputs: [],
  currentResults: [],
  skillResults: [],
  judgments: [],
  commit: 'test-commit',
  generatedAt: '2026-07-15T00:00:00.000Z'
});
assert.equal(skillReport.skillId, 'zh-x-post');
assert.equal(skillReport.skillVersion, '1.0.0');
assert.equal(typeof skillReport.releaseGate.deterministicPassed, 'boolean');
assert.ok(['passed', 'failed', 'credentials_required'].includes(skillReport.liveBlindComparison.status));
assert.equal(skillReport.liveBlindComparison.winRate ?? null, null);
assert.equal(skillReport.releaseDecision.status, 'hold');
assert.equal(skillReport.releaseDecision.rolloutEnabled, false);

globalThis.window = {};
await import('./options/locales.js');
const requiredLocaleKeys = [
  'studio_phase_generating',
  'studio_phase_judging',
  'studio_phase_repairing',
  'objective_studio',
  'objective_auto_post',
  'objective_auto_relationship',
  'rule_state_candidate',
  'rule_state_active',
  'relative_insufficient_data',
  'relationship_outbound_completed'
];
for (const language of ['zh', 'en', 'ja', 'es', 'id']) {
  for (const key of requiredLocaleKeys) {
    assert.ok(window.i18nDict[language][key], `${language}.${key}`);
  }
}

console.log('generation loop integration checks passed');
