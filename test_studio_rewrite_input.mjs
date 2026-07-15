import assert from 'node:assert/strict';
import { buildStudioRewriteInput, detectInputLanguage } from './core/studioRewriteInput.js';

assert.equal(detectInputLanguage('这是中文'), 'zh');
assert.equal(detectInputLanguage('A workflow note'), 'en');
const input = buildStudioRewriteInput({
  sourceText: '这个 AI 产品第一次很惊艳，但第二次上下文断了。',
  config: { engineLanguage: 'zh' },
  generationContext: {},
  contentSkill: null
});
assert.equal(input.promptType, 'viral_rewrite');
assert.match(input.sourceText, /上下文断了/);
assert.match(input.inputLockConstraint, /唯一主题来源/);
assert.equal(input.contentSkill, null);

console.log('Studio rewrite input checks passed');
