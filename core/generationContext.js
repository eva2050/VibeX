import { memoryValueToText } from '../utils/textUtils.js';
import { AGENT_MEMORY_LABELS, DEFAULT_AGENT_MEMORY, selectGrowthPlaybook } from './constants.js';
import { MEMORY_FIELD_PROTOCOL } from './storageSchema.js';

function normalizeAgentMemory(memory = {}) {
  return { ...DEFAULT_AGENT_MEMORY, ...(memory || {}) };
}

function truncateForPrompt(value = '', maxLength = 700) {
  const text = memoryValueToText(value).replace(/\s+\n/g, '\n').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function formatAgentMemoryForPrompt(memory = {}) {
  const normalized = normalizeAgentMemory(memory);
  const priorityKeys = [
    'identity',
    'marketPosition',
    'audienceSegments',
    'audiencePains',
    'contentPillars',
    'contentAngles',
    'proofAssets',
    'personalStories',
    'coreOpinions',
    'boundaries',
    'voiceRules',
    'bannedClaims',
    'replyStrategy',
    'weeklyReviewSignals'
  ];

  const lines = priorityKeys
    .map((key) => {
      const value = truncateForPrompt(normalized[key]);
      return value ? `- ${AGENT_MEMORY_LABELS[key] || key}：${value}` : '';
    })
    .filter(Boolean);

  return lines.length > 0
    ? lines.join('\n')
    : '暂无长期记忆。请基于账号简介和当前策略保守生成，不要编造不可验证经历。';
}

function formatPerformanceMemoryForPrompt(aiMemory = {}) {
  const rules = Array.isArray(aiMemory?.learnedRules) ? aiMemory.learnedRules : [];
  const lines = rules
    .slice(0, 8)
    .map((rule, index) => {
      const text = truncateForPrompt(rule?.text || rule, 360);
      if (!text) return '';
      const ratio = Number(rule?.deviationRatio ?? rule?.lastDeviationRatio);
      const ratioText = Number.isFinite(ratio) ? `；历史偏差：${Math.round(ratio * 100)}%` : '';
      const sampleCount = Number(rule?.sampleCount);
      const confidence = Number(rule?.confidence);
      const sampleText = Number.isFinite(sampleCount) && sampleCount > 1 ? `；样本数：${sampleCount}` : '';
      const confidenceText = Number.isFinite(confidence) ? `；置信度：${confidence}%` : '';
      return `${index + 1}. ${text}${ratioText}${sampleText}${confidenceText}`;
    })
    .filter(Boolean);

  if (lines.length === 0) {
    return '暂无发布表现记忆。生成后需要进入 Posts 回填实际表现，Loop 才能持续校准。';
  }

  return [
    '以下规则来自已发布内容的预测偏差与用户回填表现。它们优先级高于通用爆款模板，但不要因为单条样本过度重复同一种写法：',
    ...lines
  ].join('\n');
}

function formatPlaybookForPrompt(playbook = {}) {
  if (!playbook?.id) return '';
  const method = Array.isArray(playbook.method)
    ? playbook.method.map((item) => `- ${item}`).join('\n')
    : '';
  return [
    `增长模板：${playbook.label || playbook.id}`,
    method ? `打法要点：\n${method}` : '',
    playbook.mix ? `内容配比参考：${playbook.mix}` : ''
  ].filter(Boolean).join('\n');
}

function formatStyleTrainingForPrompt(styleTrainingData) {
  const examples = Array.isArray(styleTrainingData)
    ? styleTrainingData.filter(Boolean).join('\n---\n')
    : memoryValueToText(styleTrainingData).trim();
  if (!examples) return '';
  return `\n【严格文风约束】：必须100%模仿以下参考素材的断句节奏、用词习惯（如特定语气词、emoji）、情绪饱和度以及排版结构。请提取并在输出中重现这种独特的个人风格，杜绝任何AI感。\n<文风参考>\n${examples}\n</文风参考>\n\n`;
}

function formatPreferenceMemoryForPrompt(config = {}, promptType = '') {
  if (!['viral_rewrite', 'draft_reply', 'auto_post'].includes(promptType)) return '';
  let text = '';
  if (Array.isArray(config.feedbackLikes) && config.feedbackLikes.length > 0) {
    const likes = config.feedbackLikes
      .slice(-10)
      .map((fb, idx) => `[正面案例 ${idx + 1}]\n${truncateForPrompt(fb.text, 500)}`)
      .join('\n\n');
    text += `\n【正面偏好】：用户喜欢以下输出的风格和口吻，后续生成应优先靠近这种调性：\n<正面案例>\n${likes}\n</正面案例>\n`;
  }
  if (Array.isArray(config.feedbackDislikes) && config.feedbackDislikes.length > 0) {
    const dislikes = config.feedbackDislikes
      .slice(-10)
      .map((fb, idx) => `[反面案例 ${idx + 1}]\n${truncateForPrompt(fb.text, 500)}`)
      .join('\n\n');
    text += `\n【反面偏好】：用户讨厌以下输出的风格，本次生成必须避免类似语气、句式或套路：\n<反面案例>\n${dislikes}\n</反面案例>\n`;
  }
  return text;
}

function formatEditFeedbackForPrompt(feedbackLoopData, promptType = '') {
  if (!Array.isArray(feedbackLoopData) || feedbackLoopData.length === 0) return '';
  if (!['viral_rewrite', 'draft_reply', 'auto_post'].includes(promptType)) return '';
  const feedbackExamples = feedbackLoopData
    .slice(-10)
    .map((fb, idx) => [
      `[示例 ${idx + 1}]`,
      `- 你的原输出：${truncateForPrompt(fb.original, 500)}`,
      `- 用户的修改版：${truncateForPrompt(fb.modified, 500)}`
    ].join('\n'))
    .join('\n\n');
  return `\n【人工校对记忆】：请学习用户对你以往输出的修改思路，避免重复 AI 味、翻译腔或不符合账号风格的句式。\n<校对案例>\n${feedbackExamples}\n</校对案例>\n`;
}

function buildGenerationContext(config = {}, options = {}) {
  const persona = config.aiPersona || {};
  const agentMemory = normalizeAgentMemory(config.agentMemory);
  const playbook = selectGrowthPlaybook({
    onboardingStrategy: config.onboardingStrategy,
    persona,
    agentMemory,
    accountBio: config.accountBio,
    leadTarget: config.leadTarget
  });
  const promptType = options.promptType || 'auto_post';

  return {
    memoryProtocol: MEMORY_FIELD_PROTOCOL,
    accountBio: memoryValueToText(config.accountBio) || '暂无',
    persona,
    agentMemory,
    playbook,
    agentMemoryPrompt: formatAgentMemoryForPrompt(agentMemory),
    performanceMemoryPrompt: formatPerformanceMemoryForPrompt(config.aiMemory),
    playbookPrompt: formatPlaybookForPrompt(playbook),
    stylePrompt: formatStyleTrainingForPrompt(config.styleTrainingData),
    editFeedbackPrompt: formatEditFeedbackForPrompt(config.feedbackLoopData, promptType),
    preferencePrompt: formatPreferenceMemoryForPrompt(config, promptType),
    competitorReportPrompt: config.competitorReport
      ? `\n可用的流量操盘报告如下，必须严格吸收其中的钩子、矩阵和风险边界：\n${truncateForPrompt(config.competitorReport, 5000)}\n`
      : ''
  };
}

export {
  buildGenerationContext,
  formatAgentMemoryForPrompt,
  formatPerformanceMemoryForPrompt,
  formatPlaybookForPrompt,
  normalizeAgentMemory,
  truncateForPrompt
};
