import assert from 'node:assert/strict';
import { buildGenerationContext } from './core/generationContext.js';
import { POST_CONTENT_MODE, POST_ORIGIN, POST_STATUS, normalizeAiMemory, normalizePostRecord } from './core/storageSchema.js';
import { selectGrowthPlaybook } from './core/constants.js';

const post = normalizePostRecord({
  text: 'Stop building AI demos.\n\nBuild one workflow people repeat weekly.',
  origin: POST_ORIGIN.AUTO_GENERATED,
  publishedAt: 1700000000000
});

assert.equal(post.status, POST_STATUS.PUBLISHED);
assert.equal(post.origin, POST_ORIGIN.AUTO_GENERATED);
assert.equal(post.contentMode, POST_CONTENT_MODE.POST);

const reviewed = normalizePostRecord({
  ...post,
  actualViews: 12000,
  reviewedAt: 1700001000000
});
assert.equal(reviewed.status, POST_STATUS.REVIEWED);

const memory = normalizeAiMemory({
  learningEvents: Array.from({ length: 120 }, (_, index) => ({ id: index })),
  learnedRules: Array.from({ length: 20 }, (_, index) => ({ text: `rule ${index}` }))
});
assert.equal(memory.learningEvents.length, 100);
assert.equal(memory.learnedRules.length, 12);
assert.equal(memory.learningEvents[0].contentMode, POST_CONTENT_MODE.POST);
assert.equal(memory.learnedRules[0].contentMode, POST_CONTENT_MODE.POST);

const playbook = selectGrowthPlaybook({
  accountBio: 'AI automation founder building agents and workflow tools'
});
assert.equal(playbook.id, 'ai_product_kol');

const context = buildGenerationContext({
  accountBio: 'AI automation founder',
  aiPersona: {
    targetUsers: 'AI builders',
    characteristics: 'direct and practical',
    goals: 'share workflow lessons'
  },
  agentMemory: {
    contentPillars: 'AI workflow teardown\nBuild in public',
    bannedClaims: 'No guaranteed income claims'
  },
  aiMemory: {
    learnedRules: [{
      text: 'playbook posts with specific hooks outperformed',
      contentMode: POST_CONTENT_MODE.POST,
      sampleCount: 3,
      confidence: 82
    }]
  },
  styleTrainingData: ['Short first line.\n\nConcrete second line.'],
  feedbackLoopData: [{
    original: 'This is very important.',
    modified: 'The boring part is usually the bottleneck.'
  }],
  accountPerformanceBaseline: {
    topByViews: [{
      id: 'view-winner',
      text: 'The best AI products feel like cheating at boring work.',
      contentMode: POST_CONTENT_MODE.POST,
      actualViews: 42000,
      performanceMetrics: { views: 42000, likes: 900, replies: 42, reposts: 80 }
    }],
    topByLikes: [{
      id: 'like-winner',
      text: 'Coding is taste under pressure.',
      contentMode: POST_CONTENT_MODE.POST,
      actualViews: 21000,
      performanceMetrics: { views: 21000, likes: 1200, replies: 18, reposts: 60 }
    }],
    topRepliesByViews: [{
      id: 'reply-view-winner',
      text: 'This is the exact trap: everyone optimizes the demo, nobody fixes the workflow.',
      contentMode: POST_CONTENT_MODE.REPLY,
      actualViews: 15000,
      performanceMetrics: { views: 15000, likes: 500, replies: 12, reposts: 22 }
    }]
  }
}, { promptType: 'auto_post' });

assert.match(context.agentMemoryPrompt, /内容支柱/);
assert.match(context.performanceMemoryPrompt, /playbook posts/);
assert.match(context.topPerformancePrompt, /Top 6 by views/);
assert.match(context.topPerformancePrompt, /Top 6 replies by views/);
assert.match(context.topPerformancePrompt, /boring work/);
assert.match(context.topPerformancePrompt, /workflow/);
assert.match(context.stylePrompt, /优质推文样本学习/);
assert.match(context.stylePrompt, /为什么优质/);
assert.match(context.editFeedbackPrompt, /人工校对记忆/);

const rewriteContext = buildGenerationContext({
  aiMemory: {
    learnedRules: [
      { text: 'post-only rule', contentMode: POST_CONTENT_MODE.POST },
      { text: 'rewrite-only rule', contentMode: POST_CONTENT_MODE.REWRITE }
    ]
  }
}, { promptType: 'viral_rewrite' });
assert.doesNotMatch(rewriteContext.performanceMemoryPrompt, /post-only rule/);
assert.match(rewriteContext.performanceMemoryPrompt, /rewrite-only rule/);

console.log('loop/context checks passed');
