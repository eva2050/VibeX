import assert from 'node:assert/strict';
import { createLogEntry, renderLogEntry } from './core/logCatalog.js';

const structured = createLogEntry('success', 'post_published', [3]);
assert.equal(renderLogEntry(structured, 'en'), 'Post published. 3 posts sent today.');
assert.equal(renderLogEntry(structured, 'zh'), '推文发布成功，今日已发 3 条');

const legacy = { message: '任务完成。生成长度: 128' };
assert.equal(renderLogEntry(legacy, 'en'), 'Task completed. Generated length: 128');
assert.equal(renderLogEntry(legacy, 'es'), 'Tarea completada. Longitud generada: 128');

const unknown = { message: 'unmapped mixed log' };
assert.equal(renderLogEntry(unknown, 'en'), 'unmapped mixed log');

console.log('log catalog checks passed');
