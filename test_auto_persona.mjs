import assert from 'node:assert/strict';

const {
  resolveAutoPersonaLanguage,
  localizeAutoPersona,
  buildInitialAutoPersona
} = await import('./core/autoPersona.js');

assert.equal(resolveAutoPersonaLanguage('auto', 'zh-CN'), 'en');
assert.equal(resolveAutoPersonaLanguage('auto', 'en-US', 'zh'), 'zh');
assert.equal(resolveAutoPersonaLanguage('zh', 'en-US'), 'zh');

const user = {
  username: 'Sakura_dacc',
  description: 'AI automation builder'
};

const englishSeed = buildInitialAutoPersona(user, {}, 'auto', { replaceExisting: true }, 'zh-CN');
assert.match(englishSeed.goals, /^Not enough high-quality samples yet, so run with this starting strategy/);
// The seed must directly quote the bio and instruct the writer model to infer
// from it now, not defer with a "waiting for samples" placeholder.
assert.match(englishSeed.characteristics, /infer directly from the bio below instead of waiting/);
assert.match(englishSeed.characteristics, /AI automation builder/);
// The old wording literally told the writer model to wait; the new text may
// mention avoiding that, but must still hand over a concrete instruction to
// act now instead of resolving to "there is nothing to work with".
assert.match(englishSeed.characteristics, /commit to a concrete target audience/);
assert.match(englishSeed.goals, /open with a concrete scene, number, or contrast/);

const zhLocalized = localizeAutoPersona(englishSeed, user, 'zh', 'en-US');
assert.equal(zhLocalized.changed, true);
assert.match(zhLocalized.persona.goals, /^样本还不足3条，暂时按这版策略执行/);
assert.match(zhLocalized.persona.characteristics, /先直接用下面这条 Bio 强推理，不要等待样本/);
assert.match(zhLocalized.persona.characteristics, /AI automation builder/);

const zhFromAccountLanguage = localizeAutoPersona(englishSeed, user, 'auto', 'en-US', 'zh');
assert.equal(zhFromAccountLanguage.changed, true);
assert.match(zhFromAccountLanguage.persona.goals, /^样本还不足3条，暂时按这版策略执行/);

// No bio at all: fallback must still be a concrete, usable positioning, not
// an empty "nothing to work with yet" note.
const bioless = buildInitialAutoPersona({ username: 'blank_acct' }, {}, 'zh', { replaceExisting: true });
assert.match(bioless.characteristics, /独立开发者\/内容操盘手账号/);
assert.doesNotMatch(bioless.characteristics, /等待/);

const manual = {
  characteristics: 'Manual voice: short, specific, a little dry.',
  goals: 'Manual strategy: post one strong build note per day.'
};
const untouched = localizeAutoPersona(manual, user, 'zh', 'en-US');
assert.equal(untouched.changed, false);
assert.deepEqual(untouched.persona, manual);

const empty = localizeAutoPersona({}, user, 'zh', 'en-US');
assert.equal(empty.changed, false);

// Legacy placeholder personas saved before this change must still be
// recognized as "known auto text" so they get upgraded/relocalized instead
// of being mistaken for real user-written positioning.
const legacyPersona = {
  characteristics: '@old_handle 已通过 X 连接。\n\n请结合公开 Bio 和优质推文样本，补全目标读者、内容领域、核心主张和可信边界。',
  goals: '发推策略等待优质推文样本沉淀。\n\n添加样本后，再从已验证内容里归纳 Hook、结构、内容支柱和结尾规则。'
};
const legacyRelocalized = localizeAutoPersona(legacyPersona, user, 'zh', 'en-US');
assert.equal(legacyRelocalized.changed, true);
assert.match(legacyRelocalized.persona.characteristics, /先直接用下面这条 Bio 强推理，不要等待样本/);

console.log('auto persona language checks passed');
