import assert from 'node:assert/strict';

const {
  detectLanguageFromText,
  inferDominantAccountLanguage,
  normalizeDetectedAccountLanguage
} = await import('./core/accountLanguage.js');

assert.equal(normalizeDetectedAccountLanguage('zh-CN'), 'zh');
assert.equal(normalizeDetectedAccountLanguage('in'), 'id');
assert.equal(normalizeDetectedAccountLanguage('und'), '');

assert.equal(detectLanguageFromText('我最近在测试 AI 自动化工作流，发现真正难的是稳定执行。'), 'zh');
assert.equal(detectLanguageFromText('The real bottleneck is workflow fit, not model choice.'), 'en');
assert.equal(detectLanguageFromText('これは AI ワークフローの検証メモです。'), 'ja');
assert.equal(detectLanguageFromText('La clave es convertir una idea en un sistema que se repite cada día.'), 'es');
assert.equal(detectLanguageFromText('Ini cara yang lebih praktis untuk membuat sistem konten otomatis.'), 'id');

const zhSignal = inferDominantAccountLanguage([
  { text: '我用 AI 自动化做内容分发。' },
  { text: '真正的问题不是工具，而是持续输出。' },
  { text: '账号增长要先有清晰定位。' },
  { text: 'Loop 会记录每条内容的表现。' }
]);
assert.equal(zhSignal.language, 'zh');
assert.equal(zhSignal.sampleCount, 4);
assert.ok(zhSignal.confidence >= 0.6);

const mixedSignal = inferDominantAccountLanguage([
  { text: 'Short English note about agents.' },
  { text: '中文内容一条。' }
]);
assert.equal(mixedSignal.language, '');

console.log('account language checks passed');
