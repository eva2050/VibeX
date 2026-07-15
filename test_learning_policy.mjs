import assert from 'node:assert/strict';
import {
  buildPerformanceObservation,
  deriveLearningRules,
  selectActiveRules
} from './core/learningPolicy.js';

const NOW = 1700000000000;
const base = {
  objective: 'studio_rewrite',
  contentMode: 'rewrite',
  engineLanguage: 'en',
  featureKey: 'short_opinion|specific|growth'
};

function observations(count, options = {}) {
  const positiveCount = options.positiveCount ?? Math.ceil(count * 0.75);
  return Array.from({ length: count }, (_, index) => ({
    ...base,
    id: `${options.prefix || 'obs'}-${index}`,
    direction: index < positiveCount ? 'positive' : 'negative',
    liftRatio: index < positiveCount ? 0.3 : -0.25,
    observedAt: NOW - (count - index) * 1000,
    metrics: { views: 1000 + index * 10, likes: 20, replies: 3, reposts: 2, bookmarks: 1 }
  }));
}

assert.deepEqual(deriveLearningRules(observations(4), [], NOW), []);

const candidate = deriveLearningRules(observations(5, { positiveCount: 4 }), [], NOW)[0];
assert.equal(candidate.ruleState, 'candidate');
assert.equal(candidate.active, false);
assert.equal(candidate.sampleCount, 5);
assert.match(candidate.text, /associated with higher performance/i);

const active = deriveLearningRules(observations(8, { positiveCount: 6 }), [], NOW)[0];
assert.equal(active.ruleState, 'active');
assert.equal(active.active, true);
assert.equal(active.sampleCount, 8);

assert.equal(selectActiveRules([active], {
  ...base,
  objective: 'auto_post'
}, NOW).length, 0);
assert.equal(selectActiveRules([active], {
  ...base,
  engineLanguage: 'ja'
}, NOW).length, 0);
assert.equal(selectActiveRules([active], base, NOW).length, 1);
assert.equal(selectActiveRules([{ ...active, expiresAt: NOW - 1 }], base, NOW).length, 0);

const inconsistent = deriveLearningRules(observations(8, { positiveCount: 4 }), [active], NOW);
assert.equal(inconsistent[0].ruleState, 'demoted');
assert.equal(inconsistent[0].active, false);

const comparableHistory = Array.from({ length: 5 }, (_, index) => ({
  ...base,
  id: `history-${index}`,
  metrics: { views: 500, likes: 5, replies: 1, reposts: 0, bookmarks: 0 },
  observedAt: NOW - 10000 + index
}));
const observation = buildPerformanceObservation({
  ...base,
  id: 'current'
}, {
  views: 1000,
  likes: 20,
  replies: 4,
  reposts: 2,
  bookmarks: 1
}, comparableHistory, NOW);
assert.equal(observation.cohortSize, 5);
assert.equal(observation.relativePerformance, 'above_cohort');
assert.equal(observation.direction, 'positive');

const insufficient = buildPerformanceObservation({
  ...base,
  id: 'cold-start'
}, {
  views: 1000,
  likes: 20
}, comparableHistory.slice(0, 1), NOW);
assert.equal(insufficient.relativePerformance, 'insufficient_data');

console.log('learning policy checks passed');
