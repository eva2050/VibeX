import assert from 'node:assert/strict';
import {
  buildStudioPrompt,
  buildStudioQualityGateRules,
  buildStudioRegenerateInstruction,
  buildStudioTimeContext
} from './core/studioPrompt.js';

const timeContext = buildStudioTimeContext(new Date('2026-07-13T00:00:00Z'));
assert.match(timeContext, /当前时间是 2026年7月/);
assert.match(timeContext, /不要为了显得新而编造最新数据/);

const gate = buildStudioQualityGateRules('viral_rewrite');
assert.match(gate, /静默质量门控/);
assert.match(gate, /不被账号样本、历史表现或偏好案例带跑题/);
assert.match(gate, /Most founders\/creators/);

const regen = buildStudioRegenerateInstruction(true);
assert.match(regen, /不要扩大主题/);
assert.match(regen, /更贴近原文/);
assert.doesNotMatch(regen, /完全不同/);

const prompt = buildStudioPrompt({
  promptType: 'viral_rewrite',
  promptPrefix: 'PREFIX\n',
  textToProcess: 'vibe coding 像一种创造型消费，过程本身就成立。',
  config: { engineLanguage: 'zh' },
  generationContext: {
    stylePrompt: '样本说：以前失业，现在 CEO。',
    editFeedbackPrompt: '用户不喜欢一行一句。',
    preferencePrompt: '用户喜欢自然短文。',
    performanceMemoryPrompt: '首句要有具体冲突。',
    topPerformancePrompt: 'Most founders spend 2 hours polishing one tweet.'
  },
  langConstraint: '必须使用中文重写。',
  inputLockConstraint: '输入是唯一主题来源。',
  strictAntiAI: '不要模板腔。',
  includePerformanceMemory: true,
  includeTopPerformanceSamples: false
});

assert.match(prompt, /^PREFIX/);
assert.match(prompt, /输入是唯一主题来源/);
assert.match(prompt, /必须使用中文重写/);
assert.match(prompt, /样本说/);
assert.match(prompt, /首句要有具体冲突/);
assert.match(prompt, /待处理文本 - 唯一主题来源/);
assert.doesNotMatch(prompt, /polishing one tweet/);

console.log('studio prompt checks passed');
