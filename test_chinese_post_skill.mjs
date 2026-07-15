import assert from 'node:assert/strict';
import { ZH_POST_SKILL } from './core/contentSkills/zh/postSkill.js';
import { SUPPORTED_CHINESE_POST_FAMILIES } from './core/contentSkills/zh/postStrategies.js';

const familyCases = [
  ['product_observation', '很多 AI 产品第一次打开很惊艳，但第二次使用还要重新解释背景。影响重复使用的可能不是功能数量，而是上下文能不能接上。'],
  ['tool_experience', '我连续试了三个 AI 写作工具，最后留下来的不是功能最多的，而是每周复盘时不用重新教一遍背景的那个。'],
  ['build_in_public', 'Build in public 第 15 天：今天没有加新功能，只删掉了三个不必要的配置入口，发布流程反而稳定了。'],
  ['failure_retrospective', '这次产品冷启动失败后复盘，最大的问题不是曝光少，而是我们根本没验证用户会不会第二次回来。'],
  ['industry_opinion', '我越来越觉得，AI 应用接下来的分水岭不会只是模型能力，而是谁先进入真实工作流。'],
  ['workflow_framework', '我现在验证 AI 产品只看三步：先找重复任务，再观察用户是否主动回来，最后才考虑扩功能。']
];

assert.deepEqual([...SUPPORTED_CHINESE_POST_FAMILIES].sort(), familyCases.map(item => item[0]).sort());
for (const [family, text] of familyCases) {
  const diagnosis = ZH_POST_SKILL.analyze({ text });
  assert.equal(diagnosis.supported, true, family);
  assert.equal(diagnosis.family, family, text);
  assert.equal(diagnosis.forbiddenStructures.includes('certainty_escalation'), diagnosis.certainty === 'uncertain');
}

const experience = ZH_POST_SKILL.analyze({ text: familyCases[1][1] });
assert.equal(experience.hasFirstPersonExperience, true);
assert.equal(experience.forbiddenStructures.includes('invented_experience'), false);

const uncertain = ZH_POST_SKILL.analyze({
  text: '我怀疑很多 AI 产品的问题不是模型不够强，而是用户可能根本没有第二次打开的理由。'
});
assert.equal(uncertain.certainty, 'uncertain');
assert.equal(uncertain.hasFirstPersonExperience, false);
assert.equal(uncertain.forbiddenStructures.includes('certainty_escalation'), true);
assert.equal(uncertain.forbiddenStructures.includes('competition_bet'), true);

const strategies = ZH_POST_SKILL.selectCandidateStrategies(uncertain);
assert.equal(strategies.length, 3);
assert.equal(new Set(strategies.map(item => item.id)).size, 3);
assert.deepEqual(strategies.map(item => item.id), [
  'faithful_sharpening',
  'cognitive_reframe',
  'concrete_scene'
]);

const framework = ZH_POST_SKILL.analyze({ text: familyCases[5][1] });
assert.equal(
  ZH_POST_SKILL.selectCandidateStrategies(framework).some(item => item.id === 'structured_framework'),
  true
);

const outside = ZH_POST_SKILL.analyze({ text: '今天的番茄炒蛋少放一点糖会更清爽。' });
assert.equal(outside.supported, false);
assert.equal(outside.fallbackReason, 'outside_supported_territory');

const candidateInstruction = ZH_POST_SKILL.buildCandidateInstruction(strategies[0], uncertain);
assert.match(candidateInstruction, /忠实强化/);
assert.match(candidateInstruction, /不得把怀疑或可能改成确定事实/);
const judgeInstruction = ZH_POST_SKILL.buildJudgeInstruction(uncertain);
assert.match(judgeInstruction, /自然中文 X 表达/);
assert.match(judgeInstruction, /硬失败/);
assert.match(judgeInstruction, /fidelity/);
const repairInstruction = ZH_POST_SKILL.buildRepairInstruction(uncertain, ['certainty_escalation']);
assert.match(repairInstruction, /certainty_escalation/);
assert.match(repairInstruction, /只修复失败项/);

const safeOutput = ZH_POST_SKILL.evaluateDeterministically(
  uncertain.sourceText,
  '很多 AI 产品缺的可能不是更强的模型，而是一个让用户第二次打开的具体理由。',
  uncertain
);
assert.equal(safeOutput.approved, true);

const unsupportedNumber = ZH_POST_SKILL.evaluateDeterministically(
  uncertain.sourceText,
  '数据显示，90% 的 AI 产品失败，是因为用户根本不会第二次打开。',
  uncertain
);
assert.equal(unsupportedNumber.issues.includes('unsupported_number'), true);
assert.equal(unsupportedNumber.issues.includes('certainty_escalation'), true);

const inventedExperience = ZH_POST_SKILL.evaluateDeterministically(
  uncertain.sourceText,
  '我连续做了半年 AI 产品，最后发现用户根本不会第二次打开。',
  uncertain
);
assert.equal(inventedExperience.issues.includes('invented_first_person'), true);

const templateOutput = ZH_POST_SKILL.evaluateDeterministically(
  uncertain.sourceText,
  '最反直觉的一点是：AI 产品的底层逻辑，本质上就是用户不会第二次打开。',
  uncertain
);
assert.equal(templateOutput.issues.includes('template_tone'), true);

console.log('Chinese post skill checks passed');
