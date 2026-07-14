import assert from 'node:assert/strict';

let storedLogs = [];
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, callback) => callback({ logs: storedLogs }),
      set: (items) => { storedLogs = items.logs ?? storedLogs; }
    }
  },
  runtime: {
    sendMessage: () => Promise.resolve()
  }
};

const {
  buildAutoPostPrompt,
  buildAutoQualityReviewPrompt,
  buildUniquenessConstraint,
  reviewGeneratedTweetQuality
} = await import('./core/automation.js');

// --- buildUniquenessConstraint ---

// Empty/missing draftVault should not inject any constraint.
assert.equal(buildUniquenessConstraint(undefined), '');
assert.equal(buildUniquenessConstraint([]), '');

// Recent auto-post drafts should surface as an anti-repetition instruction,
// most recent first, limited to 8 items, ignoring non-post content modes.
const draftVault = [
  { text: '第一条帖子：我们复盘了一次踩坑经历', timestamp: 1000, contentMode: 'post' },
  { text: '第二条帖子：\n- 步骤一\n- 步骤二\n- 步骤三\n- 步骤四', timestamp: 2000, contentMode: 'post' },
  { text: '这是一条改写内容，不应计入', timestamp: 3000, contentMode: 'rewrite' },
  { text: '这是一条回复，不应计入', timestamp: 4000, contentMode: 'reply' }
];
const constraint = buildUniquenessConstraint(draftVault);
assert.match(constraint, /近期已发布内容/);
assert.match(constraint, /第一条帖子/);
assert.match(constraint, /第二条帖子/);
assert.equal(constraint.includes('这是一条改写内容'), false);
assert.equal(constraint.includes('这是一条回复'), false);
// Most recent (timestamp 2000) should be listed before the older one (1000).
assert.ok(constraint.indexOf('第二条帖子') < constraint.indexOf('第一条帖子'));

// --- buildAutoPostPrompt ---

const autoPrompt = buildAutoPostPrompt({
  config: { accountBio: 'AI workflow builder' },
  generationContext: {
    editFeedbackPrompt: '用户不喜欢模板腔。',
    preferencePrompt: '用户喜欢自然短文。'
  },
  persona: {
    targetUsers: 'AI builders',
    characteristics: 'practical workflow account',
    goals: 'share concrete workflow judgment'
  },
  memoryContext: 'No income claims.',
  performanceMemoryContext: 'First line needs stronger tension.',
  topPerformanceContext: 'Most founders spend 2 hours polishing one tweet.',
  playbookContext: 'Use concrete workflow examples.',
  reportContext: '',
  styleConstraint: '优质样本：自然短文。',
  langConstraint: '必须使用英文输出。',
  uniquenessConstraint: '近期已发布内容：avoid repeating.',
  randomSeed: '[seed]',
  outputLangInstruction: 'ENGLISH (en)'
});
assert.match(autoPrompt, /【历史高表现参考】/);
assert.match(autoPrompt, /仅供参考节奏，严禁学习它们的题材或观点。/);
assert.doesNotMatch(autoPrompt, /必须学习它们的题材/);
assert.match(autoPrompt, /静默质量门控/);
assert.match(autoPrompt, /Most founders\/creators/);

const reviewPrompt = buildAutoQualityReviewPrompt('Most founders are just prompt engineers.', {
  characteristics: 'practical workflow account',
  targetUsers: 'AI builders'
});
assert.match(reviewPrompt, /严格、独立的 X 内容质量复核员/);
assert.match(reviewPrompt, /静默质量门控/);
assert.match(reviewPrompt, /Most founders\/creators/);

// --- reviewGeneratedTweetQuality ---

const originalFetch = globalThis.fetch;
async function withMockFetch(mockFetch, fn) {
  globalThis.fetch = mockFetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const config = { apiProvider: 'openai', apiKey: 'k', aiModel: 'gpt-test' };

await withMockFetch(async () => {
  return new Response(JSON.stringify({
    choices: [{ message: { content: '{"approved": true, "reason": ""}' } }]
  }), { status: 200 });
}, async () => {
  const result = await reviewGeneratedTweetQuality('一条候选推文', config, {});
  assert.equal(result.approved, true);
});

await withMockFetch(async () => {
  return new Response(JSON.stringify({
    choices: [{ message: { content: '{"approved": false, "reason": "套话过多，没有信息增量"}' } }]
  }), { status: 200 });
}, async () => {
  const result = await reviewGeneratedTweetQuality('一条空洞的候选推文', config, {});
  assert.equal(result.approved, false);
  assert.match(result.reason, /套话/);
});

// A broken/garbled review response must not block publishing — default to approved.
storedLogs = [];
await withMockFetch(async () => {
  return new Response('not json at all', { status: 200 });
}, async () => {
  const result = await reviewGeneratedTweetQuality('一条候选推文', config, {});
  assert.equal(result.approved, true);
});
assert.equal(storedLogs.length, 1);
assert.equal(storedLogs[0].messageKey ?? storedLogs[0].key, 'post_quality_review_call_failed');

console.log('automation generation checks passed');
