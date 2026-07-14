import assert from 'node:assert/strict';

globalThis.chrome = {
  storage: {
    local: {
      get: () => {},
      set: () => {}
    }
  }
};

const {
  getGeneratedReplyRejectionReason,
  getGeneratedTweetRejectionReason
} = await import('./utils/scoreUtils.js');

assert.match(
  getGeneratedReplyRejectionReason('Missing angle: GPU memory bandwidth matters more than raw RAM.', 'Mac Studio for LLM inference?'),
  /模板化/
);

assert.match(
  getGeneratedReplyRejectionReason("The real test isn't launch strength — it's whether Sonnet holds the lead.", 'Sonnet 5 launch thoughts'),
  /模板化/
);

assert.match(
  getGeneratedTweetRejectionReason('Most founders are just prompt engineers with a landing page.\n\nThe real ones build agents that replace themselves.'),
  /模板化/
);

assert.equal(
  getGeneratedTweetRejectionReason('I stopped rewriting posts from scratch.\n\nNow I save one sharp comment from the timeline, rewrite the angle, and test it as a 2-line post.'),
  ''
);

assert.equal(
  getGeneratedReplyRejectionReason('The constraint is usually workflow fit, not model choice.', 'Which AI model should I use?'),
  ''
);

assert.match(
  getGeneratedReplyRejectionReason(
    '2026年Q2数据显示，Crypto初创企业近8成半年内融不到下一轮。Chainalysis追踪的亚洲钱包中，38%的散户在2025牛市中盈利。',
    '只要你足够穷，别人对你的态度都无比真实。'
  ),
  /编造数据/
);

console.log('generation quality guard checks passed');
