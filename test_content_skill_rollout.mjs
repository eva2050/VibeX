import assert from 'node:assert/strict';
import { normalizeContentSkillRollout } from './core/contentSkillRollout.js';

assert.deepEqual(normalizeContentSkillRollout(), {
  schemaVersion: 2,
  zhPostStudio: true,
  zhPostAuto: false
});
assert.deepEqual(normalizeContentSkillRollout({ zhPost: true }), {
  schemaVersion: 2,
  zhPostStudio: true,
  zhPostAuto: false
});
assert.deepEqual(normalizeContentSkillRollout({ zhPostStudio: true, zhPostAuto: false }), {
  schemaVersion: 2,
  zhPostStudio: true,
  zhPostAuto: false
});
assert.deepEqual(normalizeContentSkillRollout({ zhPostStudio: false, zhPostAuto: true }), {
  schemaVersion: 2,
  zhPostStudio: true,
  zhPostAuto: false
});
assert.deepEqual(normalizeContentSkillRollout({ schemaVersion: 2, zhPostStudio: false, zhPostAuto: true }), {
  schemaVersion: 2,
  zhPostStudio: false,
  zhPostAuto: true
});

console.log('content Skill rollout checks passed');
