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
assert.equal(strategies.length, 1);
assert.deepEqual(strategies.map(item => item.id), [
  'scene_note'
]);

const framework = ZH_POST_SKILL.analyze({ text: familyCases[5][1] });
assert.equal(
  ZH_POST_SKILL.selectCandidateStrategies(framework).some(item => item.id === 'short_judgment'),
  true
);

const outside = ZH_POST_SKILL.analyze({ text: '今天的番茄炒蛋少放一点糖会更清爽。' });
assert.equal(outside.supported, false);
assert.equal(outside.fallbackReason, 'outside_supported_territory');

const signalCases = [
  ['first_hand_test', 'strong', '昨天我用 Hy3 跑了一个 10 页 PPT，又做了一个 HTML 页面。任务都跑完了，但纯视觉还不够稳。'],
  ['sourced_update', 'strong', 'Anthropic 7 月 10 日发布了一场 Agent 基础设施对谈，平台负责人分享了团队一线观察。来源：https://example.com/talk'],
  ['public_feedback', 'medium', 'Claude Code 桌面版右侧 Panel 会把浏览器挤得只剩一点，任务完成后的文件名还不能直接点击。'],
  ['data_snapshot', 'strong', '这个产品昨天从 Google 获得 11000 次自然流量，其中 3000 人完成注册。'],
  ['abstract_opinion', 'weak', 'AI 时代真正的竞争，不是模型能力，而是谁更理解用户。'],
  ['thin_input', 'weak', 'AI 很强。']
];
for (const [signalType, sourceStrength, text] of signalCases) {
  const diagnosis = ZH_POST_SKILL.analyze({ text });
  assert.equal(diagnosis.signalType, signalType, text);
  assert.equal(diagnosis.sourceStrength, sourceStrength, text);
  assert.ok(Array.isArray(diagnosis.availableSignals), text);
  assert.ok(diagnosis.patternCardId, text);
}

const candidateInstruction = ZH_POST_SKILL.buildCandidateInstruction(strategies[0], uncertain);
assert.match(candidateInstruction, /现场片段/);
assert.match(candidateInstruction, /不得把怀疑或可能改成确定事实/);
assert.match(candidateInstruction, /保留素材里的动作、数字、对象、结果或限制/);
assert.match(candidateInstruction, /写自己如何观察和行动，不要站在高处教别人/);
assert.match(candidateInstruction, /不得伪造/);
assert.match(candidateInstruction, /信号类型/);
assert.match(candidateInstruction, /素材强度/);
assert.match(candidateInstruction, /停止条件/);
assert.match(candidateInstruction, /研究语料不提供当前主题/);
const judgeInstruction = ZH_POST_SKILL.buildJudgeInstruction(uncertain);
assert.match(judgeInstruction, /自然中文 X 表达/);
assert.match(judgeInstruction, /硬失败/);
assert.match(judgeInstruction, /fidelity/);
assert.match(judgeInstruction, /先看素材里的数字、对象、动作/);
assert.match(judgeInstruction, /说教/);
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

const lectureOutput = ZH_POST_SKILL.evaluateDeterministically(
  familyCases[0][1],
  '真正重要的是：功能决定第一次体验，上下文决定会不会有第二次。',
  ZH_POST_SKILL.analyze({ text: familyCases[0][1] })
);
assert.equal(lectureOutput.issues.includes('lecture_tone'), true);
assert.equal(lectureOutput.approved, false);

const evidenceFirstOutput = ZH_POST_SKILL.evaluateDeterministically(
  familyCases[0][1],
  '第一次打开很惊艳，第二次使用却要重新解释背景。上下文接不上，功能再多，也很难让人愿意回来。',
  ZH_POST_SKILL.analyze({ text: familyCases[0][1] })
);
assert.equal(evidenceFirstOutput.approved, true);

const richSource = '昨天我用 Hy3 跑了一个 10 页 PPT，又生成了一个 HTML 页面。两个任务都跑完了，但纯视觉还不够稳。';
const richDiagnosis = ZH_POST_SKILL.analyze({ text: richSource });
const eraManifesto = ZH_POST_SKILL.evaluateDeterministically(
  richSource,
  '这个时代已经彻底变了。未来已来，真正的拐点是 Agent 开始接管所有工作。',
  richDiagnosis
);
assert.equal(eraManifesto.issues.includes('era_manifesto'), true);

const contentFarm = ZH_POST_SKILL.evaluateDeterministically(
  richSource,
  '王炸来了：Hy3 的表现太炸裂，这可能是今年最颠覆认知的模型。',
  richDiagnosis
);
assert.equal(contentFarm.issues.includes('content_farm_tone'), true);

const inventedSteps = ZH_POST_SKILL.evaluateDeterministically(
  richSource,
  '用好 Hy3 只要三步：第一步写需求，第二步交给 Agent，第三步等待结果。',
  richDiagnosis
);
assert.equal(inventedSteps.issues.includes('invented_steps'), true);

const stackedContrast = ZH_POST_SKILL.evaluateDeterministically(
  richSource,
  '这不是模型升级，而是生产关系升级。重要的不是参数，而是认知。',
  richDiagnosis
);
assert.equal(stackedContrast.issues.includes('stacked_contrast'), true);

const droppedSignals = ZH_POST_SKILL.evaluateDeterministically(
  richSource,
  '模型能力不错，未来可能会有更多人使用。',
  richDiagnosis
);
assert.equal(droppedSignals.issues.includes('concrete_signal_dropped'), true);

const groundedTest = ZH_POST_SKILL.evaluateDeterministically(
  richSource,
  '昨天拿 Hy3 跑了 10 页 PPT 和一个 HTML 页面，两个任务都完成了。纯视觉还不够稳，这部分我暂时不会交给它。',
  richDiagnosis
);
assert.equal(groundedTest.approved, true);

assert.equal(ZH_POST_SKILL.version, '1.3.0');

console.log('Chinese post skill checks passed');
