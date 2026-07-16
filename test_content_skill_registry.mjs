import assert from 'node:assert/strict';
import {
  getRegisteredContentSkills,
  resolveContentSkill
} from './core/contentSkills/registry.js';
import './core/contentSkills/zh/postSkill.js';

const studioSkill = resolveContentSkill({
  language: 'zh',
  format: 'post',
  objective: 'studio_rewrite'
});
assert.equal(studioSkill.id, 'zh-x-post');
assert.equal(studioSkill.version, '1.3.0');
assert.equal(Object.isFrozen(studioSkill), true);

const autoSkill = resolveContentSkill({
  language: 'zh',
  format: 'post',
  objective: 'auto_post'
});
assert.equal(autoSkill, studioSkill);
assert.deepEqual(getRegisteredContentSkills(), [studioSkill]);

assert.equal(resolveContentSkill({
  language: 'en',
  format: 'post',
  objective: 'studio_rewrite'
}), null);
assert.equal(resolveContentSkill({
  language: 'zh',
  format: 'reply',
  objective: 'auto_relationship'
}), null);

console.log('content skill registry checks passed');
