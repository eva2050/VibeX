import assert from 'node:assert/strict';
import { ZH_POST_SKILL } from './core/contentSkills/zh/postSkill.js';

const source = `感觉 AI 这波，真的好像当年的 Web3 啊。

一样的二级市场 FOMO，几十倍造富效应，一级抢着要额度。
一样的年轻人入场，想要改变 or 干翻这个世界，新晋富豪更是扎堆。
一样的主席大大讲话，主会场一票难求，分会场遍地开花。
一样的自媒体红利，懂不懂先放一边，反正都在教别人怎么上车。

但，还是不一样吧？
毕竟 AI 可比 Web3 实用太多了。

但，真的不一样么？
或许那座 “歪脖山” ，也曾这样辉煌过。`;

const diagnosis = ZH_POST_SKILL.analyze({ text: source });
assert.equal(diagnosis.ownership, 'first_party');
assert.equal(diagnosis.allowedPerspective, 'first_person_optional');
assert.equal(diagnosis.publishReason, 'unresolved_personal_judgment');
assert.ok(diagnosis.firstPartySignals.includes('personal_judgment'));
assert.deepEqual(diagnosis.externalSignals, []);
assert.ok(diagnosis.speechMoves.includes('repeated_anaphora'));
assert.ok(diagnosis.speechMoves.includes('code_switch'));
assert.ok(diagnosis.speechMoves.includes('self_questioning'));
assert.ok(diagnosis.speechMoves.includes('reversal'));
assert.ok(diagnosis.speechMoves.includes('colloquial_emotion'));
assert.ok(diagnosis.speechMoves.includes('reality_correction'));
assert.ok(diagnosis.speechMoves.includes('memory_anchor'));
assert.ok(diagnosis.humanTrace.repeatedOpeners.includes('一样的'));
assert.ok(diagnosis.humanTrace.codeSwitches.includes('or'));
assert.ok(diagnosis.humanTrace.quotedPhrases.includes('歪脖山'));
assert.ok(['low', 'medium', 'high'].includes(diagnosis.emotionalTemperature));

const prompt = ZH_POST_SKILL.buildCandidateInstruction(
  ZH_POST_SKILL.selectCandidateStrategies(diagnosis)[0],
  diagnosis
);
assert.match(prompt, /口头思路轨迹/);
assert.match(prompt, /一样的/);
assert.match(prompt, /or/);
assert.match(prompt, /歪脖山/);
assert.match(prompt, /不得统一改成标准书面中文/);
assert.match(prompt, /允许停在怀疑、记忆或情绪/);
assert.doesNotMatch(prompt, /必须使用.*哈哈哈/);

const costSource = `我时常觉得 GPT 这么好用
一个月花 200 刀没毛病吧

哈哈哈，实际上愿意花这个钱的人
其实少之又少`;
const costDiagnosis = ZH_POST_SKILL.analyze({ text: costSource });
assert.equal(costDiagnosis.ownership, 'first_party');
assert.ok(costDiagnosis.speechMoves.includes('self_questioning'));
assert.ok(costDiagnosis.speechMoves.includes('colloquial_emotion'));
assert.ok(costDiagnosis.speechMoves.includes('reality_correction'));
const costPrompt = ZH_POST_SKILL.buildCandidateInstruction(
  ZH_POST_SKILL.selectCandidateStrategies(costDiagnosis)[0],
  costDiagnosis
);
assert.match(costPrompt, /只保留素材已经出现的轨迹/);
assert.doesNotMatch(costPrompt, /所有正文都.*哈哈哈/);

const externalDiagnosis = ZH_POST_SKILL.analyze({
  text: '看到 @builder 写了一段自己的 AI 测试经历，来源：https://x.com/builder/status/123'
});
assert.equal(externalDiagnosis.ownership, 'attributed_external');
assert.equal(externalDiagnosis.allowedPerspective, 'source_attributed');
assert.deepEqual(externalDiagnosis.firstPartySignals, []);
assert.ok(externalDiagnosis.externalSignals.length > 0);

const polished = ZH_POST_SKILL.evaluateDeterministically(
  source,
  'AI 与 Web3 都是时代浪潮。历史周期滚滚向前，无论人还是科技浪花，能有片刻高光，足矣。',
  diagnosis
);
assert.ok(polished.issues.includes('sterile_polish'));

const lostQuestion = ZH_POST_SKILL.evaluateDeterministically(
  source,
  'AI 与 Web3 有相似的资本和传播结构，但 AI 更实用，因此未来一定会走得更远。',
  diagnosis
);
assert.ok(lostQuestion.issues.includes('human_trace_dropped'));

const neutralSource = 'AI 产品今天上线了。';
const inventedLaugh = ZH_POST_SKILL.evaluateDeterministically(
  neutralSource,
  '哈哈哈，AI 产品今天终于上线了！',
  ZH_POST_SKILL.analyze({ text: neutralSource })
);
assert.ok(inventedLaugh.issues.includes('generic_emotion'));

const finalDraft = `感觉 AI 这波，真的好像当年的 Web3 啊。

一样的二级市场 FOMO，几十倍造富效应，一级抢着要额度。
一样的年轻人入场，想要改变 or 干翻这个世界，新晋富豪更是扎堆。
一样的主席大大讲话，主会场一票难求，分会场遍地开花。
一样的自媒体红利，懂不懂先放一边，反正都在教别人怎么上车。

但，还是不一样吧？
毕竟 AI 可比 Web3 实用太多了。

但，真的不一样么？
或许那座 “歪脖山” ，也曾这样辉煌过。`;
assert.equal(
  ZH_POST_SKILL.evaluateDeterministically(source, finalDraft, diagnosis).approved,
  true
);

console.log('Chinese post human voice checks passed');
