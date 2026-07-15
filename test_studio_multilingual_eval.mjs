import assert from 'node:assert/strict';
import { buildViralRewritePromptPrefix } from './core/rewritePrompts.js';
import { assessStudioOutputQuality } from './core/studioQuality.js';

const cases = [
  ['zh', '产品不是功能列表，而是用户愿意重复的工作流。'],
  ['en', 'The product is not the feature list. It is the workflow users repeat.'],
  ['ja', 'プロダクトは機能一覧ではなく、ユーザーが繰り返すワークフローです。'],
  ['es', 'El producto no es la lista de funciones, sino el flujo que el usuario repite.'],
  ['id', 'Produk bukan daftar fitur, melainkan alur kerja yang terus dipakai pengguna.']
];

for (const [language, output] of cases) {
  const prompt = buildViralRewritePromptPrefix({ engineLanguage: language, persona: {} });
  assert.doesNotMatch(prompt, /顶级 X 中文写作者/, language);
  const quality = assessStudioOutputQuality(output, output, {
    engineLanguage: language,
    requireTopicOverlap: true
  });
  assert.equal(quality.issues.includes('language_mismatch'), false, language);
  assert.equal(quality.issues.includes('topic_drift'), false, language);
}

console.log('studio multilingual evaluation checks passed');
