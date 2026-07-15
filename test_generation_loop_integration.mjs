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
assert.doesNotMatch(
  background,
  /alarm\.name === PERFORMANCE_REVIEW_ALARM[\s\S]{0,240}!res\.isRunning/
);

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
