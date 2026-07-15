import { registerContentSkill } from '../registry.js';

const ZH_POST_SKILL = registerContentSkill({
  id: 'zh-x-post',
  version: '1.0.0',
  language: 'zh',
  format: 'post',
  objectives: ['studio_rewrite', 'auto_post']
});

export { ZH_POST_SKILL };
