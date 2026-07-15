import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHINESE_X_CORPUS } from './core/contentSkills/zh/postCorpus.js';

const path = new URL('./docs/reviews/中文-X-Skill-v1.2-人工审核第2轮.md', import.meta.url);
const markdown = readFileSync(path, 'utf8');
const sections = [...markdown.matchAll(/^## (\d{2})$/gm)];
assert.equal(sections.length, 15);
assert.deepEqual(sections.map(match => match[1]), Array.from({ length: 15 }, (_, index) => String(index + 1).padStart(2, '0')));

const urls = markdown.match(/https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+/g) || [];
assert.equal(urls.length, 15);
assert.equal(new Set(urls).size, 15);
assert.equal((markdown.match(/\*\*素材摘要：\*\*/g) || []).length, 15);
assert.equal((markdown.match(/\*\*正文：\*\*/g) || []).length, 15);
assert.doesNotMatch(markdown, /内部评分|候选 [A-D]|总分：/);

function chineseWindows(text = '', size = 12) {
  const chars = [...String(text).replace(/[^\u3400-\u9fff]/g, '')];
  const windows = new Set();
  for (let index = 0; index <= chars.length - size; index += 1) {
    windows.add(chars.slice(index, index + size).join(''));
  }
  return windows;
}

const corpusWindows = new Set(CHINESE_X_CORPUS.flatMap(item => [...chineseWindows(item.summary)]));
for (const line of markdown.split('\n').filter(value => value && !value.startsWith('**素材摘要：**'))) {
  for (const window of chineseWindows(line)) {
    assert.equal(corpusWindows.has(window), false, `copied corpus window: ${window}`);
  }
}

console.log('Chinese post v1.2 review batch checks passed');
