import { memoryValueToText } from '../utils/textUtils.js';
import { AGENT_MEMORY_LABELS, DEFAULT_AGENT_MEMORY, selectGrowthPlaybook } from './constants.js';
import { LEARNING_OBJECTIVE, MEMORY_FIELD_PROTOCOL, POST_CONTENT_MODE } from './storageSchema.js';
import { getPromptText } from './i18n.js';
import { formatStyleSampleLearningForPrompt } from './styleLearning.js';
import { selectActiveRules } from './learningPolicy.js';

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

function getContentModeForPrompt(promptType = '') {
  if (promptType === 'auto_post') return POST_CONTENT_MODE.POST;
  if (promptType === 'draft_reply') return POST_CONTENT_MODE.REPLY;
  return POST_CONTENT_MODE.REWRITE;
}

function getObjectiveForPrompt(promptType = '') {
  if (promptType === 'auto_post') return LEARNING_OBJECTIVE.AUTO_POST;
  if (promptType === 'draft_reply') return LEARNING_OBJECTIVE.STUDIO_REPLY;
  return LEARNING_OBJECTIVE.STUDIO_REWRITE;
}

function formatPerformanceMemoryForPrompt(aiMemory = {}, options = {}) {
  const contentMode = options.contentMode || POST_CONTENT_MODE.POST;
  const objective = options.objective || getObjectiveForPrompt(options.promptType);
  const engineLanguage = options.engineLanguage || options.lang || 'unknown';
  const rules = Array.isArray(aiMemory?.learnedRules) ? aiMemory.learnedRules : [];
  const relevantRules = selectActiveRules(rules, {
    objective,
    contentMode,
    engineLanguage
  }, options.now || Date.now(), 3);
  const lines = relevantRules
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
    return getPromptText(options.lang, 'performanceMemoryEmpty');
  }

  return [
    getPromptText(options.lang, 'performanceMemoryIntro'),
    ...lines
  ].join('\n');
}

function formatTopSampleLine(post = {}, index = 0) {
  const metrics = post.performanceMetrics || {};
  const metricText = [
    `${Number(post.actualViews || metrics.views || 0)} views`,
    Number(metrics.likes) ? `${Number(metrics.likes)} likes` : '',
    Number(metrics.reposts) ? `${Number(metrics.reposts)} reposts` : '',
    Number(metrics.replies) ? `${Number(metrics.replies)} replies` : ''
  ].filter(Boolean).join(', ');
  const mode = post.contentMode === 'reply' ? 'reply' : 'post';
  const text = truncateForPrompt(post.text || '', 260);
  return `${index + 1}. [${mode}; ${metricText}] ${text}`;
}

function uniqueTopSamples(posts = [], limit = 3) {
  const seen = new Set();
  return (Array.isArray(posts) ? posts : [])
    .filter((post) => {
      const key = post.statusId || post.id || post.text;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return Boolean(post.text);
    })
    .slice(0, limit);
}

function formatSampleGroup(title, posts = []) {
  const samples = uniqueTopSamples(posts, 6);
  if (samples.length === 0) return '';
  const lines = samples
    .map((post, index) => formatTopSampleLine(post, index))
    .filter(Boolean);
  return lines.length ? `${title}\n${lines.join('\n')}` : '';
}

function formatTopPostsForPrompt(baseline = {}) {
  const groups = [
    formatSampleGroup('Top 6 by views across posts/replies:', baseline.topByViews),
    formatSampleGroup('Top 6 by likes across posts/replies:', baseline.topByLikes),
    formatSampleGroup('Top 6 replies by views:', baseline.topRepliesByViews),
    formatSampleGroup('Top 6 replies by likes:', baseline.topRepliesByLikes)
  ].filter(Boolean);

  if (groups.length === 0) {
    const topPosts = Array.isArray(baseline?.topPosts) ? baseline.topPosts : [];
    const lines = uniqueTopSamples(topPosts, 12)
      .map((post, index) => formatTopSampleLine(post, index))
      .filter(Boolean);
    if (lines.length === 0) return '';
    groups.push(`Top-performing account samples from recent scan:\n${lines.join('\n')}`);
  }

  return [
    'Historical high-signal account samples. Use them only as empirical signal for hook strength, pacing, format, emotional temperature, and reply style. Do not copy their language, topic, product, claim, or point of view. The current input remains the only topic source:',
    ...groups
  ].join('\n\n');
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
  const learning = formatStyleSampleLearningForPrompt(styleTrainingData, { limit: 3 });
  if (!learning) return '';
  return `\n<优质样本>\n${learning}\n</优质样本>\n\n【极度严格的输出约束】：\n1. 你必须只学习优质样本的“活人感、具体观察、轻判断、自然短文”风格。\n2. 学习样本的 Hook 方式、断句节奏和留白格式。\n3. 严禁使用任何常见 AI 模板（如“最反直觉的一点是”、“底层逻辑是”、“本质是”）。\n4. 如果输入素材太短，绝对不要把它硬扩写成长篇大论，请保持短小精悍的观察或吐槽。\n5. 严禁借用样本的具体题材、产品名或业务数据；不要编造年份或不存在的行业报告。\n6. 输出语言必须完全服从后台 Engine Language，不跟随素材语种。\n\n`;
}

function formatPreferenceMemoryForPrompt(config = {}, promptType = '') {
  if (!['viral_rewrite', 'draft_reply', 'auto_post'].includes(promptType)) return '';
  let text = '';
  if (Array.isArray(config.feedbackLikes) && config.feedbackLikes.length > 0) {
    const likes = config.feedbackLikes
      .slice(-3)
      .map((fb, idx) => `[正面案例 ${idx + 1}]\n${truncateForPrompt(fb.text, 500)}`)
      .join('\n\n');
    text += `\n【正面偏好】：用户喜欢以下输出的风格和口吻，后续生成应优先靠近这种调性：\n<正面案例>\n${likes}\n</正面案例>\n`;
  }
  if (Array.isArray(config.feedbackDislikes) && config.feedbackDislikes.length > 0) {
    const dislikes = config.feedbackDislikes
      .slice(-3)
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
    .slice(-3)
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
  const contentMode = getContentModeForPrompt(promptType);
  const lang = options.lang || config.engineLanguage || 'auto';
  const objective = options.objective || getObjectiveForPrompt(promptType);

  return {
    memoryProtocol: MEMORY_FIELD_PROTOCOL,
    accountBio: memoryValueToText(config.accountBio) || '暂无',
    persona,
    agentMemory,
    playbook,
    agentMemoryPrompt: formatAgentMemoryForPrompt(agentMemory),
    contentMode,
    objective,
    performanceMemoryPrompt: formatPerformanceMemoryForPrompt(config.aiMemory, {
      contentMode,
      objective,
      promptType,
      engineLanguage: lang,
      lang,
      now: options.now
    }),
    topPerformancePrompt: formatTopPostsForPrompt(config.accountPerformanceBaseline),
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
  getObjectiveForPrompt,
  formatPerformanceMemoryForPrompt,
  formatStyleTrainingForPrompt,
  formatTopPostsForPrompt,
  formatPlaybookForPrompt,
  normalizeAgentMemory,
  truncateForPrompt
};
