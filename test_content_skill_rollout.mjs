import assert from 'node:assert/strict';
import { normalizeContentSkillRollout } from './core/contentSkillRollout.js';

assert.deepEqual(normalizeContentSkillRollout(), {
  zhPostStudio: false,
  zhPostAuto: false
});
assert.deepEqual(normalizeContentSkillRollout({ zhPost: true }), {
  zhPostStudio: false,
  zhPostAuto: false
});
assert.deepEqual(normalizeContentSkillRollout({ zhPostStudio: true, zhPostAuto: false }), {
  zhPostStudio: true,
  zhPostAuto: false
});
assert.deepEqual(normalizeContentSkillRollout({ zhPostStudio: false, zhPostAuto: true }), {
  zhPostStudio: false,
  zhPostAuto: true
});

console.log('content Skill rollout checks passed');
