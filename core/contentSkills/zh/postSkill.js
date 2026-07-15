import { registerContentSkill } from '../registry.js';
import {
  buildChineseCandidateInstruction,
  diagnoseChinesePostInput,
  selectChinesePostStrategies
} from './postStrategies.js';
import {
  buildChineseJudgeInstruction,
  buildChineseRepairInstruction,
  evaluateChinesePostOutput
} from './postJudge.js';

const ZH_POST_SKILL = registerContentSkill({
  id: 'zh-x-post',
  version: '1.0.0',
  language: 'zh',
  format: 'post',
  objectives: ['studio_rewrite', 'auto_post'],
  supports(input = {}) {
    return diagnoseChinesePostInput(input).supported;
  },
  analyze: diagnoseChinesePostInput,
  selectCandidateStrategies: selectChinesePostStrategies,
  buildCandidateInstruction: buildChineseCandidateInstruction,
  buildJudgeInstruction: buildChineseJudgeInstruction,
  buildRepairInstruction: buildChineseRepairInstruction,
  evaluateDeterministically: evaluateChinesePostOutput
});

export { ZH_POST_SKILL };
