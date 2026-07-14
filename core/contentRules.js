// Shared, low-risk "hard constraint" text fragments reused by more than one
// prompt builder:
//   - core/rewritePrompts.js        (Studio 仿写/改写, getRewriteStructureRules)
//   - handlers/llmHandler.js        (Studio 仿写的输入锁定规则, buildInputLockedRewriteRules)
//   - core/automation.js            (Auto 自动发帖生成)
//
// Why this file exists: Studio 仿写 and Auto 发帖 each grew their own copy of
// overlapping hard constraints (banned empty-cliche phrases, in particular).
// When the desired direction changed once (see the Batch 1 fix that allowed
// plain, honest conclusion sentences instead of banning them as "AI cliche"),
// the two copies had to be edited separately and briefly drifted out of sync.
// Anything that means exactly the same thing in every caller belongs here so
// it only has to change in one place. Anything that legitimately differs by
// context (length budgets, structure selection, hashtag/emoji defaults,
// retry/scoring logic) stays local to its own file - don't move those here
// just to "unify" them, that's a behavior change disguised as a refactor.

function getBannedClichePhrasesRule() {
  return '不要用"冷知识、划重点、最反直觉的一点、最真实的一点、最残酷的一点、底层逻辑是、真正的真相是、你发现了吗、谁更懂底层、本质上、本质是、深层满足、短暂兴奋"这类空话模板——这些是没有信息量的套话，不等于反差开头或强观点这些技巧本身，要用具体的信息或画面替代空话。但如果原文/素材本身的结论就是"体验本身成立就够了""产品有没有人用是另一回事"这类朴素判断，允许直白说出来，不要因为怕像套话就回避这种结论。';
}

export { getBannedClichePhrasesRule };
