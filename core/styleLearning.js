import { memoryValueToText } from '../utils/textUtils.js';

function normalizeSampleText(value = '') {
  return memoryValueToText(value)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function getStyleSamples(styleTrainingData, limit = 5) {
  const rawSamples = Array.isArray(styleTrainingData)
    ? styleTrainingData
    : String(styleTrainingData || '').split(/\n-{3,}\n/g);

  return rawSamples
    .map(normalizeSampleText)
    .filter(Boolean)
    .slice(-limit);
}

function hasAny(text = '', patterns = []) {
  return patterns.some(pattern => pattern.test(text));
}

function analyzeStyleSample(text = '') {
  const normalized = normalizeSampleText(text);
  if (!normalized) {
    return {
      text: '',
      hook: '无有效样本',
      structure: '无',
      strengths: [],
      reusableRules: []
    };
  }

  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
  const firstLine = lines[0] || normalized;
  const hasQuestion = /[?？]/.test(normalized);
  const hasNumbers = /(?:\d+|一|二|三|四|五|六|七|八|九|十|百|千|万|亿)/.test(normalized);
  const hasLightRoastContrast = hasAny(normalized, [
    /以前[^：:\n]{0,16}[：:].{1,80}现在[^：:\n]{0,16}[：:]/s,
    /从.+到.+(听起来|其实|结果|现在)/s,
    /麻烦.+(举手|让我嫉妒|谁懂|上岸)/s
  ]);
  const hasExperienceReframe = hasAny(normalized, [
    /(vibe coding|写代码|做产品|创作|创造).{0,80}(消费|悦己|开心|快乐|内啡肽|多巴胺)/is,
    /(没人用|跑不通|不会再打开|没商业逻辑).{0,80}(可那又怎样|那又怎样|已经成立|值得)/s,
    /(刷短视频|消费).{0,80}(多巴胺|内啡肽|创造)/s
  ]);
  const hasContrast = hasAny(normalized, [
    /不是.+而是/s,
    /不是因为.+是因为/s,
    /表面.+实际/s,
    /看起来.+其实/s,
    /真正.+不是/s,
    /but|instead|actually|not.+but/i,
    /vs\.?|versus/i
  ]);
  const hasComparison = hasAny(normalized, [
    /京东|淘宝|拼多多|天猫|抖音|小红书|OpenAI|Anthropic|Google|Apple|Tesla|NVIDIA|英伟达/i,
    /赌/
  ]);
  const hasCausalTurn = hasAny(normalized, [
    /结果|所以|因此|最后|剩下|then|so |therefore|which means/i,
    /因为|原因|核心变量|关键变量|底层变量/
  ]);

  let hook = '先给结论或判断';
  if (hasContrast) hook = '用反差/反常识让读者停住';
  else if (hasQuestion) hook = '用问题制造认知缺口';
  else if (hasNumbers) hook = '用数字或具体对象提高可信度';
  else if (firstLine.length <= 32) hook = '用短句开场降低阅读阻力';

  let structure = '短段落推进：观点 -> 解释 -> 结论';
  if (hasLightRoastContrast) {
    structure = '低频轻吐槽对照：用生活化反差开场，再落到处境变化或自嘲互动';
  } else if (hasExperienceReframe) {
    structure = '体验重命名：把一个看似无用/失败的行为，重新解释成一种成立的心理回报';
  } else if (hasComparison && hasCausalTurn) {
    structure = '多对象对照：逐个解释变量，最后给出胜负手';
  } else if (hasContrast) {
    structure = '反转结构：先拆掉表面解释，再给出更深变量';
  } else if (lines.length >= 4) {
    structure = '分行递进：每行只承载一个判断，方便移动端扫读';
  }

  const strengths = [];
  if (hasLightRoastContrast) strengths.push('有轻吐槽和自嘲感，像真人发帖而不是观点论文');
  if (hasExperienceReframe) strengths.push('有强活人感：先承认无用和失败可能，再给读者一个松弛的情绪许可');
  if (hasComparison) strengths.push('有具体对象，不像空泛观点');
  if (hasContrast) strengths.push('有认知反转，提供新解释而不是复述常识');
  if (hasNumbers) strengths.push('有数字/规模感，增强判断重量');
  if (lines.length >= 3) strengths.push('断句清楚，移动端阅读压力低');
  if (hasCausalTurn) strengths.push('有因果链或变量解释，读者能学到一套判断方式');
  if (strengths.length === 0) strengths.push('表达克制，适合作为语气和节奏参考');

  const reusableRules = [];
  if (hasLightRoastContrast) reusableRules.push('“以前/现在”轻吐槽结构只能低频使用，最多约 10-15%，不要变成默认模板。');
  if (hasExperienceReframe) reusableRules.push('可复用“重新命名 -> 承认无用/失败 -> 情绪许可 -> 轻对照收束”，但不要写成鸡汤或宏大定义。');
  if (hasComparison) reusableRules.push('保留“对象 A / 对象 B / 对象 C”的对照感，但必须换成当前话题里的真实对象。');
  if (hasContrast) reusableRules.push('优先写“表面原因 vs 真正变量”，不要只做情绪评价。');
  if (hasCausalTurn) reusableRules.push('结尾给一个可迁移判断标准，让读者知道以后怎么看类似问题。');
  if (lines.length >= 3) reusableRules.push('按 1 个判断 1 行来排版，长段落要拆开。');
  if (reusableRules.length === 0) reusableRules.push('学习它的节奏和克制感，不复制原句、原话题或原观点。');

  return {
    text: normalized,
    hook,
    structure,
    strengths: strengths.slice(0, 4),
    reusableRules: reusableRules.slice(0, 4)
  };
}

function formatStyleSampleLearningForPrompt(styleTrainingData, options = {}) {
  const samples = getStyleSamples(styleTrainingData, options.limit || 5);
  if (samples.length === 0) return '';

  const blocks = samples.map((sample, index) => {
    const analysis = analyzeStyleSample(sample);
    return [
      `样本 ${index + 1}:`,
      analysis.text,
      '为什么优质：',
      `- Hook：${analysis.hook}`,
      `- 结构：${analysis.structure}`,
      `- 强项：${analysis.strengths.join('；')}`,
      `- 可复用规则：${analysis.reusableRules.join('；')}`
    ].join('\n');
  });

  const title = options.title || '【优质推文样本学习】：这些样本是用户手动沉淀的高质量内容。学习“为什么好”：Hook、结构、变量解释、节奏和可复用规则；不要复制原句、原话题、产品名、人物或观点。';
  return `${title}\n<优质样本拆解>\n${blocks.join('\n\n---\n\n')}\n</优质样本拆解>`;
}

export {
  analyzeStyleSample,
  formatStyleSampleLearningForPrompt,
  getStyleSamples
};
