import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync(new URL('./options/options.html', import.meta.url), 'utf8');
const optionsSource = readFileSync(new URL('./options/options.js', import.meta.url), 'utf8');
const routerSource = readFileSync(new URL('./handlers/messageRouter.js', import.meta.url), 'utf8');

assert.doesNotMatch(html, /generation-candidates|generation-candidate-list/);
assert.doesNotMatch(optionsSource, /renderGenerationCandidates|generation-candidate-option/);
assert.doesNotMatch(routerSource, /handleBenchmarkMessage|ChinesePostBenchmark/);

for (const path of [
  './handlers/benchmarkHandler.js',
  './options/chinese-post-benchmark.html',
  './options/chinese-post-benchmark.js',
  './options/chinese-post-benchmark.css',
  './core/contentSkills/zh/postBlindBenchmark.js'
]) {
  assert.equal(existsSync(new URL(path, import.meta.url)), false, `${path} should be removed`);
}

console.log('Studio exposes one output and no product benchmark UI');
