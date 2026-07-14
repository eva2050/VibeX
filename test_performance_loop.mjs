import assert from 'node:assert/strict';
import {
  applyPerformanceReview,
  buildAccountPerformanceBaseline,
  inferContentFeatures,
  updateAiMemoryWithReviewedPost,
  classifyRelativePerformance
} from './core/performanceLoop.js';
import { POST_CONTENT_MODE, POST_ORIGIN, POST_STATUS, normalizePostRecord } from './core/storageSchema.js';

const reviewedVault = [1, 2, 3].map((id) => normalizePostRecord({
  id: `old-${id}`,
  text: `Past post ${id}`,
  origin: POST_ORIGIN.AUTO_GENERATED,
  contentMode: POST_CONTENT_MODE.POST,
  actualViews: 800,
  performanceMetrics: { views: 800 },
  relativePerformance: 'below_baseline',
  reviewedAt: 1700000000000 + id
}));

const nextPost = normalizePostRecord({
  id: 'next',
  text: 'Coding is not a skill. It is leverage.',
  origin: POST_ORIGIN.AUTO_GENERATED,
  contentMode: POST_CONTENT_MODE.POST,
  status: POST_STATUS.PUBLISHED,
  publishedAt: 1700001000000
});

const metrics = { views: 900, likes: 12, replies: 2, reposts: 1 };
const review = applyPerformanceReview(nextPost, metrics, reviewedVault);

assert.equal(review.post.status, POST_STATUS.REVIEWED);
assert.equal(review.post.performanceMetrics.views, 900);
assert.equal(review.post.performanceMetrics.likes, 12);
assert.ok(review.post.aiLearning.includes('Reason:'));
assert.ok(review.post.aiLearning.includes('Next:'));

const memory = updateAiMemoryWithReviewedPost({}, review.post);
assert.ok(Array.isArray(memory.learnedRules));

const baseline = buildAccountPerformanceBaseline([...reviewedVault, review.post]);
assert.equal(baseline.sampleCount, 4);
assert.ok(baseline.medianViews > 0);

const storyWithQuestion = inferContentFeatures({
  text: '我复盘了一次踩坑经历：上线当天服务挂了。你们遇到过这种情况吗？'
});
assert.equal(storyWithQuestion.contentType, 'story');

const playbookWithCTA = inferContentFeatures({
  text: '如何验证一个想法：\n- 先找 10 个真实用户\n- 再做一个最小可用版本\n- 最后看留存\n欢迎关注了解更多'
});
assert.equal(playbookWithCTA.contentType, 'soft_conversion');

const plainPlaybook = inferContentFeatures({
  text: '如何验证一个想法：\n- 先找 10 个真实用户\n- 再做一个最小可用版本\n- 最后看留存'
});
assert.equal(plainPlaybook.contentType, 'playbook');

const plainQuestion = inferContentFeatures({ text: '你更看重产品的哪一点？速度还是稳定？' });
assert.equal(plainQuestion.contentType, 'reply_bait');

console.log('performance loop checks passed');
