import { getPromptText } from './i18n.js';

function buildStudioTimeContext(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return `\n\n【时间与事实边界】：当前时间是 ${year}年${month}月。可以理解为当前语境，但不要为了显得新而编造最新数据、年份、融资、公司事件或趋势判断；只有待处理文本或明确上下文里给出的事实才能写进正文。`;
}

function buildStudioQualityGateRules(promptType = 'viral_rewrite') {
  const scope = promptType === 'draft_reply' ? '回复' : '改写';
  return `\n\n【静默质量门控】：输出前在心里检查，正文不要解释检查过程。
1. 这条${scope}是否仍然只围绕当前输入/原推，不被账号样本、历史表现或偏好案例带跑题。
2. 是否有一个具体判断或洞见，而不是安全、正确、空泛的 AI 总结。
3. 是否没有新增原文不存在的数据、年份、公司、经历、内幕或确定性指控。
4. 是否足够短：默认 1 段，最多 2 段；除非结构规则明确允许，否则不要一行一句。
5. 是否避开模板腔、翻译腔和万能互动尾巴。
6. 如果结果像“Most founders/creators...”“That's the edge.”这种套壳英文短帖，但输入本身没有这种语气，必须重写。`;
}

function buildStudioRegenerateInstruction(isRegenerate = false) {
  if (!isRegenerate) return '';
  return `\n\n【重新生成】：用户不满意上一版。不要扩大主题、不要换成账号样本里的题材；只换一个更贴近原文、更像真人表达的切入方式。优先减少废话、减少模板句、减少过度分行。`;
}

function section(title, body) {
  const text = String(body || '').trim();
  if (!text) return '';
  return `\n\n${title}\n${text}`;
}

function buildStudioPrompt({
  promptType = 'viral_rewrite',
  promptPrefix = '',
  textToProcess = '',
  config = {},
  generationContext = {},
  langConstraint = '',
  inputLockConstraint = '',
  strictAntiAI = '',
  regenerateConstraint = '',
  candidateBrief = '',
  includePerformanceMemory = true,
  includeTopPerformanceSamples = false,
  sourceLabel = '【待处理文本 - 唯一主题来源】'
} = {}) {
  const isRewrite = promptType === 'viral_rewrite';
  const isReply = promptType === 'draft_reply';
  const lang = config.engineLanguage || 'auto';
  const performanceMemory = includePerformanceMemory && isRewrite
    ? `${getPromptText(lang, 'rewritePerformanceMemoryHeader', {}, globalThis.navigator?.language || '')}\n${generationContext.performanceMemoryPrompt || ''}`
    : '';
  const topPerformance = includeTopPerformanceSamples && generationContext.topPerformancePrompt
    ? `${generationContext.topPerformancePrompt}\n只参考 Hook 强度、节奏和可复用判断方式；不得借用样本题材、产品名、观点、具体句子或篇幅。当前任务的主题只能来自本次输入。`
    : '';

  return [
    promptPrefix,
    buildStudioTimeContext(),
    inputLockConstraint,
    section('【输出语言】', langConstraint),
    isRewrite || isReply ? section('【优质样本学习（低优先级）】', generationContext.stylePrompt) : '',
    isRewrite || isReply ? section('【人工校对记忆（低优先级）】', generationContext.editFeedbackPrompt) : '',
    isRewrite || isReply ? section('【用户偏好记忆（低优先级）】', generationContext.preferencePrompt) : '',
    section('【表现记忆（只用于避坑，不改变主题）】', performanceMemory),
    section('【高表现样本（默认不参与主题选择）】', topPerformance),
    strictAntiAI,
    buildStudioQualityGateRules(promptType),
    section('【本候选的结构策略】', candidateBrief),
    regenerateConstraint || buildStudioRegenerateInstruction(false),
    `${sourceLabel}：\n${textToProcess}`
  ].filter(Boolean).join('');
}

export {
  buildStudioPrompt,
  buildStudioQualityGateRules,
  buildStudioRegenerateInstruction,
  buildStudioTimeContext
};
