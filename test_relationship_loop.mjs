import assert from 'node:assert/strict';
import {
  aggregateRelationshipAuthors,
  buildRelationshipInteraction,
  buildRelationshipVaultRecord
} from './core/relationshipLoop.js';

const first = buildRelationshipInteraction({
  id: 'rel-1',
  targetAuthor: '@Builder',
  sourceStatusId: '111',
  sourceUrl: 'https://x.com/builder/status/111',
  sourceText: 'source',
  replyText: 'reply',
  engineLanguage: 'ja',
  completedAt: 100
});
const second = buildRelationshipInteraction({
  id: 'rel-2',
  targetAuthor: 'builder',
  sourceStatusId: '222',
  sourceText: 'source 2',
  replyText: 'reply 2',
  engineLanguage: 'ja',
  completedAt: 200
});

assert.equal(first.objective, 'auto_relationship');
assert.equal(first.authorKey, 'builder');
assert.equal(first.metrics.outboundCompleted, 1);
assert.equal(first.metrics.views, undefined);

const summary = aggregateRelationshipAuthors([first, second])[0];
assert.equal(summary.authorKey, 'builder');
assert.equal(summary.outboundReplies, 2);
assert.equal(summary.repeatInteraction, true);
assert.equal(summary.replyBackCount, 0);
assert.equal(summary.lastInteractionAt, 200);

const record = buildRelationshipVaultRecord(first);
assert.equal(record.contentMode, 'reply');
assert.equal(record.objective, 'auto_relationship');
assert.equal(record.status, 'published');
assert.equal(record.actualViews, undefined);
assert.equal(record.sourceStatusId, '111');

console.log('relationship loop checks passed');
