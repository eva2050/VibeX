import assert from 'node:assert/strict';

const {
  buildDirectRewritePrompt,
  buildViralRewritePromptPrefix,
  getRewriteStructureRules
} = await import('./core/rewritePrompts.js');
const {
  buildInputLockedRewriteRules
} = await import('./handlers/llmHandler.js');
const {
  getBannedClichePhrasesRule
} = await import('./core/contentRules.js');

const rules = getRewriteStructureRules();
assert.match(rules, /牌局对照结构/);
assert.match(rules, /现象钉住结构/);
assert.match(rules, /感受命名结构/);
assert.match(rules, /排比金句结构/);
assert.match(rules, /不许硬造“谁在押什么”/);
assert.match(rules, /怀疑、吐槽、反问/);
assert.match(rules, /真正变量是另一个/);
assert.match(rules, /不得新增原文没有的公司、数据、年份/);
assert.match(rules, /不得把原文里的怀疑、吐槽、反问升级成确定事实/);
assert.match(rules, /只写 1-2 个短段落/);
assert.match(rules, /Studio 手动输入默认是“精炼改写”/);
assert.match(rules, /不要一行一句/);
assert.match(rules, /默认用自然段/);
assert.match(rules, /最多占 10-15%/);
assert.match(rules, /不能作为默认句式/);
assert.match(rules, /保留必要的、少量口语词做点缀/);
assert.match(rules, /vibe coding 有点像/);
// 新方向：排比金句结构允许拆行、允许排比作为主力句式、允许具体反问收尾、允许适度 emoji
assert.match(rules, /允许每句单独一行，靠短句拼接取胜/);
assert.match(rules, /排比是主力句式，不是低频调味/);
assert.match(rules, /结尾用一句反问或一句总结金句钉住主题/);
assert.match(rules, /结尾最多加 1 个贴切的 Emoji/);
assert.match(rules, /抽象概念、学术引用、理论堆砌 → 主动换成具体生活场景类比/);
assert.match(rules, /创业\/开发黑话/);
assert.match(rules, /只要你享受这个过程，那一切就是值得的/);
// 旧版把“反差开头”技巧和空话模板一起封杀，新版应保留对空话模板的禁止，
// 但不再一并禁掉互动反问和 emoji 这两个技巧本身
assert.doesNotMatch(rules, /不要加“家人们”“你们怎么看”“最近是不是也这样”等互动钩子，除非原文已经有/);
assert.doesNotMatch(rules, /不要 Emoji，不要 hashtag/);

const prefix = buildViralRewritePromptPrefix({
  errorMsgText: 'extract failed',
  persona: {
    characteristics: '冷静，短句，有判断',
    goals: '输出高密度商业观察'
  }
});
assert.match(prefix, /账号定位/);
assert.match(prefix, /变量反转结构/);
assert.match(prefix, /短刀结构/);
assert.doesNotMatch(prefix, /千万级爆款操盘手|Dwell Time|自然.*Emoji/);

const direct = buildDirectRewritePrompt({
  author: 'bornanit',
  text: '京东赌中产，淘宝赌贫困减少，拼多多赌贫困变多。',
  archetypeLabel: '商业观察',
  styleLabel: '牌局对照'
});
assert.match(direct, /bornanit/);
assert.match(direct, /牌局对照结构/);
assert.match(direct, /请直接输出改写后的正文/);

const codexComplaint = buildDirectRewritePrompt({
  author: 'eva',
  text: '发现最近codex执行任务的时间越来越久了，哪怕一个小功能，都会反复校对，随随便便都把任务时间拉到十几分钟以上。一看推理猛如虎，结果一看代码才改了几十行。这是用时间去拉低用户Token消耗么',
  archetypeLabel: '产品体验吐槽',
  styleLabel: '短刀结构'
});
assert.match(codexComplaint, /产品体验吐槽/);
assert.match(codexComplaint, /现象钉住结构/);
assert.match(codexComplaint, /输出必须比原文更短或接近原文长度/);
assert.match(codexComplaint, /不得把原文里的怀疑、吐槽、反问升级成确定事实/);
assert.match(codexComplaint, /不得强行套用“谁在押什么 \/ 谁赌对了 \/ 谁活到下半场”/);

const shortInputLock = buildInputLockedRewriteRules('一个小功能，反复校对十几分钟，最后只改了几十行。');
assert.match(shortInputLock, /长度预算/);
assert.match(shortInputLock, /最多约 120 个中文字符/);
assert.match(shortInputLock, /不要扩写成长帖/);
assert.match(shortInputLock, /排版预算/);
assert.match(shortInputLock, /其余情况默认 1 段，最多 2 段/);
assert.match(shortInputLock, /排比金句结构/);

const mediumInputLock = buildInputLockedRewriteRules('发现最近codex执行任务的时间越来越久了，哪怕一个小功能，都会反复校对，随随便便都把任务时间拉到十几分钟以上。一看推理猛如虎，结果一看代码才改了几十行。这是用时间去拉低用户Token消耗么');
assert.match(mediumInputLock, /最多约 220 个中文字符/);

const vibeCodingPrompt = buildDirectRewritePrompt({
  author: 'eva',
  text: 'vibe coding像一种就是以创造为形式的一种消费行为。就是你做出来的东西不一定要对别人有用，你自己在这个过程，创造的过程很开心，它本身就是一种很好的体验。',
  archetypeLabel: '概念感受',
  styleLabel: '感受命名'
});
assert.match(vibeCodingPrompt, /概念命名/);
assert.match(vibeCodingPrompt, /感受命名结构/);
assert.match(vibeCodingPrompt, /可那又怎样/);
assert.match(vibeCodingPrompt, /不要写“最反直觉的一点\/本质上\/本质是”这种空话模板/);
assert.match(vibeCodingPrompt, /我越来越觉得，vibe coding 其实更像/);
assert.match(vibeCodingPrompt, /默认写成 1 段自然短文/);
assert.match(vibeCodingPrompt, /只要你享受这个过程，那一切就是值得的/);

const vibeCodingLock = buildInputLockedRewriteRules('vibe coding像一种就是以创造为形式的一种消费行为。产品可能没人用，逻辑可能跑不通，甚至你自己明天都不会再打开。可那又怎样呢？');
assert.match(vibeCodingLock, /本质上、本质是、深层满足、短暂兴奋/);
assert.match(vibeCodingLock, /最反直觉的一点、最真实的一点、最残酷的一点/);
// 新方向：不再一刀切封杀这两个具体朴素结论句，只要原文本身支持
assert.doesNotMatch(vibeCodingLock, /如果你享受这个过程，它就是值得的/);
assert.doesNotMatch(vibeCodingLock, /产品是否有人用，那是另一个问题/);

// Task 6: Studio 的两条改写路径（rewritePrompts 的结构规则 + llmHandler 的
// 输入锁定规则）必须共享同一份"空话套壳"禁用清单，而不是各自维护一份、
// 改一处漏一处。直接断言两边都字面包含同一个共享片段。
const sharedClicheRule = getBannedClichePhrasesRule();
assert.ok(rules.includes(sharedClicheRule), 'rewritePrompts structure rules should reuse the shared cliche-ban text verbatim');
assert.ok(vibeCodingLock.includes(sharedClicheRule), 'llmHandler input-locked rules should reuse the shared cliche-ban text verbatim');

// Auto 发帖 (core/automation.js) also folds the same shared cliche-ban rule
// into its hard-gate prompt section. It can't easily be exercised end-to-end
// here (it's wrapped in a chrome.storage.local.get callback and calls the
// live LLM), so this is a cheap static guard against someone quietly
// dropping the shared import/usage and reintroducing a second hand-maintained
// copy of this list.
const fs = await import('node:fs');
const automationSource = fs.readFileSync(new URL('./core/automation.js', import.meta.url), 'utf8');
assert.match(automationSource, /from '\.\/contentRules\.js'/, 'automation.js should import the shared content rules module');
assert.match(automationSource, /\$\{getBannedClichePhrasesRule\(\)\}/, 'automation.js should splice the shared cliche-ban rule into its prompt');

console.log('rewrite prompt checks passed');
