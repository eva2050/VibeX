import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBenchmarkController } from './handlers/benchmarkHandler.js';

let stored = {};
const controller = createBenchmarkController({
  getStorage: async () => stored,
  setStorage: async (value) => { stored = { ...stored, ...value }; },
  callModel: async () => { throw new Error('should not call'); }
});
assert.deepEqual(await controller.start(), { success: false, error: 'ERR_MISSING_API_KEY' });

const router = readFileSync(new URL('./handlers/messageRouter.js', import.meta.url), 'utf8');
for (const action of ['startChinesePostBenchmark', 'runNextChinesePostBenchmarkStep', 'getChinesePostBenchmark', 'submitChinesePostBenchmarkReview', 'resetChinesePostBenchmark']) {
  assert.match(router, new RegExp(action));
}

console.log('Chinese post benchmark handler checks passed');
