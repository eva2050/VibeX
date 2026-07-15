import assert from 'node:assert/strict';
import {
  CHINESE_POST_PATTERN_CARDS,
  CHINESE_X_CORPUS,
  validateChinesePostCorpus
} from './core/contentSkills/zh/postCorpus.js';

assert.equal(CHINESE_X_CORPUS.length, 40);
assert.equal(new Set(CHINESE_X_CORPUS.map(item => item.id)).size, 40);
assert.ok(new Set(CHINESE_X_CORPUS.map(item => item.author)).size >= 8);
assert.equal(CHINESE_X_CORPUS.filter(item => item.label === 'positive').length, 24);
assert.equal(CHINESE_X_CORPUS.filter(item => item.label === 'negative').length, 16);

for (const item of CHINESE_X_CORPUS) {
  assert.match(item.url, /^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/);
  assert.match(item.capturedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(item.ageAtCapture || item.publishedAt, item.id);
  assert.ok(item.topic, item.id);
  assert.ok(item.format, item.id);
  assert.ok(item.sourceType, item.id);
  assert.ok(item.summary, item.id);
  assert.ok(Array.from(item.summary).length <= 80, item.id);
  assert.ok(Array.isArray(item.learn), item.id);
  assert.ok(Array.isArray(item.avoid), item.id);
  for (const key of ['replies', 'reposts', 'likes', 'views', 'bookmarks']) {
    assert.equal(Number.isFinite(item.metrics[key]), true, `${item.id}:${key}`);
  }
}

assert.ok(CHINESE_POST_PATTERN_CARDS.length >= 6);
for (const card of CHINESE_POST_PATTERN_CARDS) {
  assert.ok(card.id, 'pattern card id');
  assert.ok(card.instruction, card.id);
  assert.ok(card.stopCondition, card.id);
  assert.ok(new Set(card.evidenceAuthors).size >= 3, card.id);
}

assert.deepEqual(validateChinesePostCorpus(), {
  valid: true,
  sampleCount: 40,
  authorCount: 8,
  positiveCount: 24,
  negativeCount: 16,
  invalidIds: []
});

console.log('Chinese post corpus checks passed');
