// background.js

// Storage Abstraction (Promise Wrapper)
function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (res) => resolve(res));
  });
}

function setStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

const MAX_LOGS = 50;
const DRAFT_TARGET_COUNT = 20;
const DRAFT_REFILL_THRESHOLD = 5;
const FIRST_AUTO_POST_DELAY_MS = 60 * 1000;
const REPLY_COOLDOWN_MS = 5 * 60 * 1000;
const REPLY_RETRY_LOCK_MS = 60 * 1000;
const POST_DELIVERY_MODE_LOCAL = 'localQueue';
const POST_DELIVERY_MODE_X_SCHEDULE = 'xNativeSchedule';

// Auto-populate mock key and force-disable petEnabled for standard automation layout
chrome.storage.local.get(['apiKey', 'leadTarget', 'petEnabled', 'collectedTweets'], (res) => {
  const updates = {};
  if (!res.apiKey) {
    updates.apiKey = 'mock-key-for-local-preview';
  }
  if (!res.leadTarget) {
    updates.leadTarget = 'Conflux Network (https://confluxnetwork.org)';
  }
  if (!res.collectedTweets) {
    updates.collectedTweets = [];
  }
  // Force disable the floating pet mascot immediately as requested
  updates.petEnabled = false;
  
  chrome.storage.local.set(updates);
});


const DEFAULT_AGENT_MEMORY = {
  identity: '',
  marketPosition: '',
  audienceSegments: '',
  audiencePains: '',
  contentPillars: '',
  contentAngles: '',
  proofAssets: '',
  personalStories: '',
  coreOpinions: '',
  boundaries: '',
  voiceRules: '',
  bannedClaims: '',
  interactionTargets: '',
  discoveryKeywords: '',
  replyStrategy: '',
  sourceInputs: '',
  weeklyReviewSignals: ''
};

const AGENT_MEMORY_LABELS = {
  identity: '身份与可信理由',
  marketPosition: '差异化定位',
  audienceSegments: '读者分层',
  audiencePains: '读者痛点',
  contentPillars: '内容支柱',
  contentAngles: '选题角度',
  proofAssets: '背书与成果资产',
  personalStories: '个人故事与案例',
  coreOpinions: '核心观点',
  boundaries: '表达边界',
  voiceRules: '表达规则',
  bannedClaims: '禁用话术',
  interactionTargets: '优先互动对象',
  discoveryKeywords: '热帖搜索关键词',
  replyStrategy: '评论引流策略',
  sourceInputs: '日常输入来源',
  weeklyReviewSignals: '复盘指标'
};

function normalizeAgentMemory(memory = {}) {
  return { ...DEFAULT_AGENT_MEMORY, ...(memory || {}) };
}

function memoryValueToText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ? String(value) : '';
}

function mergeAgentMemory(base = {}, incoming = {}) {
  const merged = normalizeAgentMemory(base);
  Object.keys(DEFAULT_AGENT_MEMORY).forEach((key) => {
    const value = memoryValueToText(incoming?.[key]).trim();
    if (value) {
      merged[key] = value;
    }
  });
  return merged;
}

function formatAgentMemory(memory = {}) {
  const normalized = normalizeAgentMemory(memory);
  const sections = Object.entries(AGENT_MEMORY_LABELS)
    .map(([key, label]) => {
      const value = memoryValueToText(normalized[key]).trim();
      return value ? `【${label}】\n${value}` : '';
    })
    .filter(Boolean);

  return sections.length > 0 ? sections.join('\n\n') : '暂无长期记忆。';
}

const GROWTH_PLAYBOOKS = {
  ai_product_kol: {
    id: 'ai_product_kol',
    label: 'AI / 产品型 KOL',
    triggers: ['ai', 'agent', '人工智能', '工具', '自动化', 'prompt', '产品', 'zarazhangrui', 'swyx', 'aakashg0', 'lennysan'],
    references: ['@zarazhangrui', '@swyx', '@aakashg0', '@lennysan'],
    method: [
      '把抽象趋势翻译成具体工作流：工具、场景、成本、结果。',
      '用强判断开头，再给一个可验证的案例或操作步骤。',
      '多做产品拆解、工作流拆解、失败复盘和“我会怎么做”。',
      '避免百科式科普，必须让读者觉得这条能立刻改变判断或行动。'
    ],
    mix: '35% 强观点 / 35% 实操工作流 / 20% 产品拆解 / 10% 互动问题'
  },
  monetization_global: {
    id: 'monetization_global',
    label: '出海 / 搞钱 / 个人商业化',
    triggers: ['出海', '搞钱', '副业', '变现', '海外', 'monetization', 'income', '赚钱', 'leobai825', 'levelsio', 'dvassallo', 'codie_sanchez'],
    references: ['@Leobai825', '@levelsio', '@dvassallo', '@codie_sanchez'],
    method: [
      '先讲机会差，再讲谁会付费、交付什么、如何降低交付成本。',
      '用案例和路径替代收益承诺，所有数字都必须是可验证或明确假设。',
      '把内容写成“避坑 + 路径 + 行动清单”，让读者收藏和转发给同类人。',
      '强 CTA 只放在自然相关处，不制造焦虑，不暗示稳赚。'
    ],
    mix: '40% 机会判断 / 30% 变现路径 / 20% 案例复盘 / 10% 低压转化'
  },
  indie_builder: {
    id: 'indie_builder',
    label: '独立开发者 / Build in Public',
    triggers: ['indie', '独立开发', 'build in public', 'mrr', 'saas', '开发者', 'solo', 'marckohlbrugge', 'patio11', 'robj3d3'],
    references: ['@levelsio', '@marckohlbrugge', '@patio11', '@robj3d3'],
    method: [
      '公开真实过程：今天 ship 了什么、遇到什么问题、学到什么。',
      '用小结果、小实验、小失败形成连续剧，而不是只发发布公告。',
      '少讲宏大愿景，多讲截图、用户反馈、定价、转化、留存和取舍。',
      '把产品故事写成人能共情的选择题：为什么这么做，不这么做会怎样。'
    ],
    mix: '35% 构建日志 / 25% 产品故事 / 25% 增长实验 / 15% 教训复盘'
  },
  research_growth: {
    id: 'research_growth',
    label: '产品增长 / 投资研究型账号',
    triggers: ['研究', '投资', '增长', '产品经理', 'research', 'vc', 'market', '趋势', 'shreyas', 'packym'],
    references: ['@aakashg0', '@lennysan', '@shreyas', '@packyM'],
    method: [
      '用结构化框架降低信息噪音：市场地图、决策树、对比表、反共识。',
      '每条内容先给结论，再给证据链，最后给读者一个判断标准。',
      '把热点变成“这意味着什么”，而不是复述新闻。',
      '用收藏价值建信任，用少量鲜明观点制造传播。'
    ],
    mix: '35% 趋势判断 / 30% 框架清单 / 20% 案例拆解 / 15% 观点讨论'
  },
  brand_official: {
    id: 'brand_official',
    label: '产品官方品牌号',
    triggers: ['brand', 'official', '官网', '产品', '公司', 'startup', 'saas'],
    references: ['@OpenAI', '@NotionHQ', '@Linear', '@vercel'],
    method: [
      '把功能更新写成用户问题被解决的故事，不写冷冰冰公告。',
      '用客户场景、模板、教程、案例建立产品可信度。',
      '语气专业克制，但要有人味：解释取舍、展示幕后、邀请反馈。',
      '品牌号少争议，多清晰；少口号，多可操作。'
    ],
    mix: '35% 用户场景 / 25% 产品教育 / 20% 发布故事 / 20% 客户证明'
  }
};

const DEFAULT_INTERACTION_TARGETS = {
  ai_product_kol: ['zarazhangrui', 'Leobai825', 'swyx', 'aakashg0', 'lennysan', 'kfk_ai', 'karpathy', 'sama'],
  monetization_global: ['Leobai825', 'levelsio', 'dvassallo', 'codie_sanchez', 'naval', 'gregisenberg'],
  indie_builder: ['levelsio', 'marckohlbrugge', 'patio11', 'robj3d3', 'dvassallo', 'gregisenberg'],
  research_growth: ['aakashg0', 'lennysan', 'shreyas', 'packyM', 'benthompson', 'stratechery'],
  brand_official: ['lennysan', 'shreyas', 'swyx', 'aakashg0', 'gregisenberg', 'patio11', 'levelsio']
};

const PROJECT_ACCOUNT_HANDLES = new Set([
  'openai', 'anthropicai', 'cursor_ai', 'vercel', 'linear', 'notionhq', 'github',
  'baseapp', 'stripe', 'figma', 'perplexity_ai', 'huggingface', 'producthunt'
]);

const DEFAULT_DISCOVERY_KEYWORDS = {
  ai_product_kol: ['AI工具', 'AI Agent', '提示词', 'AI自动化', 'Cursor', 'Claude', 'ChatGPT'],
  monetization_global: ['AI副业', 'AI出海', 'AI工具变现', '小产品变现', 'Cursor创业', 'SaaS出海', '独立开发者 AI'],
  indie_builder: ['独立开发者 AI', 'Build in Public', 'SaaS MRR', 'Cursor MVP', 'Product Hunt', '小产品上线'],
  research_growth: ['AI 投资', '产品增长', '市场趋势', '增长框架', '商业模式', '创始人洞察'],
  brand_official: ['AI产品', '产品发布', '用户案例', '产品更新', '工作流自动化', '效率工具']
};

function normalizeHandleList(values = []) {
  return values
    .flatMap(value => String(value || '').split(/[\s,，、\n]+/))
    .map(item => item.trim().replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '').replace(/^@/, '').split('/')[0])
    .filter(item => /^[A-Za-z0-9_]{1,15}$/.test(item));
}

function formatHandleList(values = []) {
  return [...new Set(normalizeHandleList(values))].join('\n');
}

function formatPersonalHandleList(values = []) {
  return [...new Set(normalizeHandleList(values))]
    .filter(handle => !PROJECT_ACCOUNT_HANDLES.has(handle.toLowerCase()))
    .join('\n');
}

function getDefaultInteractionTargets(context = {}) {
  const explicitArchetype = context.id
    || context.strategyArchetype
    || context.onboardingStrategy?.strategyArchetype;
  if (DEFAULT_INTERACTION_TARGETS[explicitArchetype]) {
    return DEFAULT_INTERACTION_TARGETS[explicitArchetype];
  }
  const playbook = selectGrowthPlaybook(context);
  return DEFAULT_INTERACTION_TARGETS[playbook.id] || DEFAULT_INTERACTION_TARGETS.indie_builder;
}

function getDefaultDiscoveryKeywords(context = {}) {
  const explicitArchetype = context.id
    || context.strategyArchetype
    || context.onboardingStrategy?.strategyArchetype;
  if (DEFAULT_DISCOVERY_KEYWORDS[explicitArchetype]) {
    return DEFAULT_DISCOVERY_KEYWORDS[explicitArchetype];
  }
  const playbook = selectGrowthPlaybook(context);
  return DEFAULT_DISCOVERY_KEYWORDS[playbook.id] || DEFAULT_DISCOVERY_KEYWORDS.indie_builder;
}

function collectSignalText(...items) {
  return items
    .map(item => memoryValueToText(item))
    .join('\n')
    .toLowerCase();
}

function includesAny(text, words = []) {
  return words.some(word => text.includes(String(word).toLowerCase()));
}

function selectGrowthPlaybook(context = {}) {
  const strategy = context.onboardingStrategy || {};
  const persona = context.persona || context.aiPersona || {};
  const memory = normalizeAgentMemory(context.agentMemory || {});
  const signalText = collectSignalText(
    strategy,
    persona,
    memory,
    context.accountBio,
    context.leadTarget,
    context.sourceInput
  );

  if (strategy.strategyArchetype && GROWTH_PLAYBOOKS[strategy.strategyArchetype]) {
    return GROWTH_PLAYBOOKS[strategy.strategyArchetype];
  }
  if (strategy.accountUse === 'brand') return GROWTH_PLAYBOOKS.brand_official;
  if (includesAny(signalText, GROWTH_PLAYBOOKS.monetization_global.triggers)) return GROWTH_PLAYBOOKS.monetization_global;
  if (includesAny(signalText, GROWTH_PLAYBOOKS.indie_builder.triggers)) return GROWTH_PLAYBOOKS.indie_builder;
  if (includesAny(signalText, GROWTH_PLAYBOOKS.research_growth.triggers)) return GROWTH_PLAYBOOKS.research_growth;
  if (includesAny(signalText, GROWTH_PLAYBOOKS.ai_product_kol.triggers)) return GROWTH_PLAYBOOKS.ai_product_kol;
  return strategy.accountUse === 'kol' ? GROWTH_PLAYBOOKS.ai_product_kol : GROWTH_PLAYBOOKS.indie_builder;
}

function formatGrowthPlaybook(playbook) {
  if (!playbook) return '';
  return `【当前内容增长模板】${playbook.label}
参考账号：${playbook.references.join('、')}
方法论：
${playbook.method.map(item => `- ${item}`).join('\n')}
建议内容配比：${playbook.mix}
注意：只学习结构和方法，不仿写具体原文，不编造这些账号的经历。`;
}

function formatAllGrowthPlaybooks() {
  return Object.values(GROWTH_PLAYBOOKS)
    .map(playbook => `${playbook.id}：${playbook.label}
参考账号：${playbook.references.join('、')}
方法论：${playbook.method.join('；')}
内容配比：${playbook.mix}`)
    .join('\n\n');
}

function formatLeadAsset(strategy = {}) {
  const assetType = strategy.leadAssetType || 'none';
  const assetValue = memoryValueToText(strategy.leadAssetValue).trim();
  if (assetType === 'product') {
    return assetValue
      ? `【评论引流资产】产品/工具：${assetValue}。只在上下文强相关时轻量提及，先提供判断和帮助，不硬推。`
      : '【评论引流资产】产品/工具。尚未填写具体链接或名称，评论时先建立信任，不强行引流。';
  }
  if (assetType === 'post') {
    return assetValue
      ? `【评论引流资产】高质量帖子/资料：${assetValue}。适合在对方需要延伸阅读时自然引导。`
      : '【评论引流资产】高质量帖子/资料。尚未填写具体链接或标题，评论时先沉淀关注，不强行引导。';
  }
  return '【评论引流资产】暂不设置产品或资料入口。评论目标是高质量互动、主页访问和关注沉淀。';
}

function formatReplyOpportunity(opportunity = {}) {
  const score = Number(opportunity.score);
  const reasons = Array.isArray(opportunity.reasons) ? opportunity.reasons.join('、') : '';
  const age = Number.isFinite(Number(opportunity.ageMinutes)) ? `${Number(opportunity.ageMinutes)} 分钟前` : '';
  const lines = [];
  if (Number.isFinite(score)) lines.push(`互动机会分：${score}`);
  if (reasons) lines.push(`入选原因：${reasons}`);
  if (age) lines.push(`发布时间：${age}`);
  if (opportunity.isTargetAuthor) lines.push('作者属于优先互动账号。');
  if (opportunity.topicRelevant) lines.push('内容主题与账号策略相关。');
  return lines.length > 0 ? `【本次互动机会判断】\n${lines.join('\n')}` : '';
}

const LOW_VALUE_REPLY_PATTERNS = [
  /^(说得对|确实|学习了|收藏了|mark|马克|很有启发|有道理|太真实了)[。！!]*$/i,
  /干货满满|值得关注|受教了|感谢分享|很棒的分享/,
  /这个方向很有潜力|未来可期|非常认同|深有同感/
];

const FORBIDDEN_CLAIM_PATTERNS = [
  /稳赚|保本|无风险|躺赚|暴富|财富自由/,
  /保证.{0,8}(涨粉|赚钱|收益|成交|转化)/,
  /(月入|日赚|年入)\s*\d+/,
  /100%|百分百/
];

function countPatternMatches(text = '', pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function compactWhitespace(text = '') {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

function visualLength(text = '') {
  return Array.from(text).reduce((sum, char) => sum + (/[\x00-\x7F]/.test(char) ? 0.55 : 1), 0);
}

function hardSplitLine(line, maxLength) {
  const parts = [];
  let current = '';
  Array.from(line).forEach((char) => {
    if (visualLength(current + char) > maxLength && current) {
      parts.push(current.trim());
      current = char;
    } else {
      current += char;
    }
  });
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitTweetLine(line, maxLength = 34) {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (visualLength(trimmed) <= maxLength) return [trimmed];
  if (/^https?:\/\//i.test(trimmed)) return [trimmed];

  const tokens = trimmed.match(/[^，。！？；：,.!?;:]+[，。！？；：,.!?;:]?/g) || [trimmed];
  const lines = [];
  let current = '';

  tokens.forEach((token) => {
    const next = `${current}${token}`.trim();
    if (current && visualLength(next) > maxLength) {
      lines.push(current.trim());
      current = token.trim();
    } else {
      current = next;
    }
  });
  if (current.trim()) lines.push(current.trim());

  return lines.flatMap(part => visualLength(part) > maxLength * 1.25 ? hardSplitLine(part, maxLength) : [part]);
}

function formatTweetForX(text = '') {
  const raw = memoryValueToText(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
  if (!raw) return '';

  const paragraphs = raw
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);

  const formatted = paragraphs.map((paragraph) => {
    const lines = paragraph
      .split('\n')
      .flatMap(line => splitTweetLine(line))
      .filter(Boolean);

    if (!paragraph.includes('\n') && lines.length >= 3) {
      const [hook, ...body] = lines;
      const grouped = [];
      body.forEach((line, index) => {
        grouped.push(line);
        if ((index + 1) % 3 === 0 && index < body.length - 1) grouped.push('');
      });
      return [hook, '', ...grouped].join('\n');
    }

    return lines.join('\n');
  });

  return formatted.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isResourceSeekingTweet(text = '') {
  const normalized = String(text || '').toLowerCase();
  return [
    /求|怎么|如何|哪里|推荐|有没有|发一下|给个|链接|资源|教程|工具|清单|模板|手册|pdf|repo|github/,
    /\b(need|looking for|how to|where can|anyone know|recommend|resource|tutorial|tool|template|link|guide|repo|github)\b/
  ].some(pattern => pattern.test(normalized));
}

function formatReplyForX(reply = '') {
  return compactWhitespace(reply)
    .replace(/^回复[:：]\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n')
    .trim();
}

function hasConcreteSignal(text = '') {
  const value = String(text || '');
  return [
    /\d/,
    /[一二三四五六七八九十]个/,
    /先.*再|不是.*而是|别.*先|关键是|核心是|本质是|更像是/,
    /场景|用户|成本|转化|留存|分发|验证|定价|交付|工作流|案例|反例|边界|清单|步骤/
  ].some(pattern => pattern.test(value));
}

function getGeneratedReplyRejectionReason(reply = '', tweet = '') {
  const normalized = String(reply || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (visualLength(reply) > 110) return 'AI 回复过长';
  if (countPatternMatches(reply, /#/g) > 1) return 'AI 回复包含过多标签';
  if (LOW_VALUE_REPLY_PATTERNS.some(pattern => pattern.test(normalized))) {
    return 'AI 回复缺少信息增量';
  }
  if (FORBIDDEN_CLAIM_PATTERNS.some(pattern => pattern.test(reply))) {
    return 'AI 回复包含不允许的收益或确定性承诺';
  }
  if (!hasConcreteSignal(reply)) {
    return 'AI 回复过于泛泛，缺少具体判断、边界或动作';
  }

  const strongLeadPatterns = [
    /看.*主页/,
    /翻.*主页/,
    /主页.*(有|见|拿|领)/,
    /私信|dm我|发我消息/,
    /关注我|follow me/,
    /link in bio|check my bio/,
    /领取|加我|联系我/
  ];
  if (!isResourceSeekingTweet(tweet) && strongLeadPatterns.some(pattern => pattern.test(normalized))) {
    return 'AI 回复包含强引流话术，但原推没有明确求资源';
  }
  return '';
}

function getGeneratedTweetRejectionReason(text = '') {
  const normalized = compactWhitespace(text);
  if (!normalized) return '推文为空';
  if (visualLength(normalized) < 24) return '推文过短，缺少可传播信息';
  if (visualLength(normalized) > 620) return '推文过长，容易变成公众号段落';
  if (FORBIDDEN_CLAIM_PATTERNS.some(pattern => pattern.test(normalized))) {
    return '推文包含不允许的收益或确定性承诺';
  }
  if (countPatternMatches(normalized, /#/g) > 2) return '推文包含过多标签';
  if (!hasConcreteSignal(normalized)) {
    return '推文缺少具体场景、数字、对比、动作或判断标准';
  }
  const firstLine = normalized.split('\n').find(Boolean) || '';
  if (visualLength(firstLine) > 42) return '首行 Hook 过长';
  if (/^(今天聊聊|分享一下|简单说说|大家都知道|随着|在当今)/.test(firstLine)) {
    return '首行 Hook 太像普通文章开头';
  }
  return '';
}

function scoreNumber(value, fallback = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, n));
}

function scoreObject(scores = {}) {
  return {
    hook: scoreNumber(scores.hook),
    shareability: scoreNumber(scores.shareability),
    replyTrigger: scoreNumber(scores.replyTrigger),
    identity: scoreNumber(scores.identity),
    audienceFit: scoreNumber(scores.audienceFit),
    nativeX: scoreNumber(scores.nativeX)
  };
}

function totalViralScore(scores = {}) {
  const s = scoreObject(scores);
  return s.hook + s.shareability + s.replyTrigger + s.identity + s.audienceFit + s.nativeX;
}

function bestViralCandidate(candidates = [], fallback = '') {
  if (!Array.isArray(candidates) || candidates.length === 0) return formatTweetForX(fallback);
  const normalized = candidates
    .map(candidate => ({
      text: formatTweetForX(candidate?.text || candidate),
      scores: scoreObject(candidate?.scores || {}),
      rationale: memoryValueToText(candidate?.rationale)
    }))
    .filter(candidate => candidate.text);

  normalized.sort((a, b) => totalViralScore(b.scores) - totalViralScore(a.scores));
  return normalized[0]?.text || formatTweetForX(fallback);
}

function normalizeGeneratedTweets(parsed) {
  const rawItems = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.tweets) ? parsed.tweets : []);
  const normalized = rawItems
    .map(item => {
      if (typeof item === 'string') {
        return {
          text: formatTweetForX(item),
          type: 'unknown',
          scores: scoreObject({}),
          score: totalViralScore({})
        };
      }

      const scores = scoreObject(item?.scores || {});
      return {
        text: formatTweetForX(item?.text),
        type: memoryValueToText(item?.type || item?.contentType || 'unknown'),
        scores,
        score: totalViralScore(scores)
      };
    })
    .filter(item => item.text)
    .map(item => ({
      ...item,
      qualityIssue: getGeneratedTweetRejectionReason(item.text)
    }))
    .sort((a, b) => b.score - a.score);

  return normalized.filter(item => !item.qualityIssue).slice(0, DRAFT_TARGET_COUNT);
}

function hashString(value = '') {
  let hash = 5381;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash >>>= 0;
  }
  return hash.toString(36);
}

function hasQueueId(value) {
  return value !== null && value !== undefined && String(value) !== '';
}

function buildDraftId(text, index) {
  return `draft-${hashString(text)}-${index}`;
}

function normalizeDraftQueue(queue = []) {
  const rawItems = Array.isArray(queue) ? queue : [];
  return rawItems
    .map((item, index) => {
      const rawText = typeof item === 'string' ? item : item?.text;
      const text = formatTweetForX(rawText);
      if (!text) return null;
      const scores = scoreObject(item?.scores || {});
      const storedScore = Number(item?.viralScore);
      const scheduledAt = Number(item?.scheduledAt);
      const nativeScheduleStatus = ['queued', 'scheduling', 'scheduled', 'failed'].includes(item?.nativeScheduleStatus)
        ? item.nativeScheduleStatus
        : '';
      const existingId = typeof item === 'object' && item ? item.id : null;
      return {
        id: hasQueueId(existingId) ? existingId : buildDraftId(text, index),
        text,
        type: typeof item === 'object' && item ? memoryValueToText(item.type || 'unknown') : 'legacy',
        viralScore: Number.isFinite(storedScore) ? storedScore : totalViralScore(scores),
        scores,
        scheduledAt: Number.isFinite(scheduledAt) ? scheduledAt : null,
        nativeScheduleStatus
      };
    })
    .filter(Boolean)
    .slice(0, DRAFT_TARGET_COUNT);
}

function findQueueItemIndex(queue = [], pendingPostId, pendingPostText) {
  const normalized = normalizeDraftQueue(queue);
  if (hasQueueId(pendingPostId)) {
    const byId = normalized.findIndex(item => String(item.id) === String(pendingPostId));
    if (byId >= 0) return byId;
  }

  const expectedText = formatTweetForX(pendingPostText || '');
  if (!expectedText) return -1;
  return normalized.findIndex(item => item.text === expectedText);
}

function removeCompletedQueueItem(queue = [], pendingPostId, pendingPostText) {
  const normalized = normalizeDraftQueue(queue);
  const index = findQueueItemIndex(normalized, pendingPostId, pendingPostText);
  if (index < 0) return normalized;
  return normalized.filter((_, itemIndex) => itemIndex !== index);
}

function updateQueueItem(queue = [], pendingPostId, pendingPostText, patch = {}) {
  const normalized = normalizeDraftQueue(queue);
  const index = findQueueItemIndex(normalized, pendingPostId, pendingPostText);
  if (index < 0) return normalized;
  return normalized.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
}

function queueNeedsNormalization(rawQueue, normalizedQueue) {
  if (!Array.isArray(rawQueue)) return false;
  if (rawQueue.length !== normalizedQueue.length) return true;
  return rawQueue.some((item, index) => {
    const normalized = normalizedQueue[index];
    if (!normalized) return true;
    if (!item || typeof item !== 'object') return true;
    if (!hasQueueId(item.id)) return true;
    return formatTweetForX(item.text) !== normalized.text;
  });
}

function addLog(level, message) {
  const entry = {
    time: Date.now(),
    level: level,
    message: message,
    source: 'background'
  };
  chrome.storage.local.get(['logs'], (result) => {
    let logs = result.logs || [];
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    chrome.storage.local.set({ logs });
  });
}

async function performTrustedClick(tabId, x, y) {
  if (!tabId) throw new Error('缺少目标标签页');

  const clickX = Math.round(Number(x));
  const clickY = Math.round(Number(y));
  if (!Number.isFinite(clickX) || !Number.isFinite(clickY)) {
    throw new Error('点击坐标无效');
  }

  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: (clientX, clientY) => {
      let el = document.elementFromPoint(clientX, clientY);
      if (el) {
        const btn = el.closest('button, [role="button"]');
        if (btn) el = btn;
        
        // 1. Bypass React isTrusted checks by invoking onClick directly (Holy Grail for Twitter bots)
        try {
          const key = Object.keys(el).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
          if (key && el[key] && typeof el[key].onClick === 'function') {
            el[key].onClick({
              isTrusted: true,
              type: 'click',
              preventDefault: () => {},
              stopPropagation: () => {},
              currentTarget: el,
              target: el,
              nativeEvent: new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY })
            });
            console.log("X Auto Bot: Injected React onClick successfully!");
            // return; // We still do the fallback just in case the React handler expects DOM events to bubble
          }
        } catch(e) {}
        
        // 2. Standard DOM Fallback
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX, clientY }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX, clientY }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX, clientY }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY }));
        if (typeof el.click === 'function') {
          el.click();
        }
      }
    },
    args: [clickX, clickY]
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log("X Auto Bot extension installed.");
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }
  addLog('info', '扩展程序已安装/更新');
  // 初始化默认配置
  chrome.storage.local.get(['apiKey', 'targetUsers', 'promptTemplate', 'leadTarget', 'isRunning'], (result) => {
    if (!result.hasOwnProperty('isRunning')) {
      chrome.storage.local.set({
        isRunning: false,
        apiKey: '',
        apiProvider: 'gemini',
        aiModel: 'gemini-2.5-flash',
        targetUsers: '',
        promptTemplate: '你是一个 X 账号增长顾问。请根据推文内容，先判断是否值得回复；如果值得，只写一条自然、有信息增量、像真人评论的短回复。\n不要硬广，不要让对方看主页/私信/关注/领取，除非原推明确在求资源、教程、工具或链接。\n\n【推文】：{tweet}\n【可用引流信息，仅在强相关且对方明确求资源时使用】：{leadTarget}\n\n回复：',
        leadTarget: '',
        agentMemory: DEFAULT_AGENT_MEMORY,
        agentChatMessages: [],
        postInterval: 30,
        replyInterval: 30,
        postDeliveryMode: POST_DELIVERY_MODE_LOCAL,
        petEnabled: false,
        petPersonality: 'explorer',
        collectedTweets: []
      });
    }
  });
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// 处理来自 content scripts 或 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "testApiConnection") {
    // Ping the LLM with a minimal request to verify the key
    const pingPrompt = "ping";
    const provider = request.apiProvider || 'gemini';
    const defaultModels = {
      gemini: 'gemini-2.5-flash',
      deepseek: 'deepseek-chat',
      openai: 'gpt-4o-mini',
      openrouter: 'google/gemini-2.5-flash',
      qwen: 'qwen-plus'
    };
    chrome.storage.local.get(['aiModel'], (items) => {
      callLLM(pingPrompt, { 
        apiKey: request.apiKey, 
        apiProvider: provider, 
        aiModel: items.aiModel || defaultModels[provider] || 'gemini-2.5-flash' 
      }, false)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    });
    return true;
  } else if (request.action === "generateReply") {
    addLog('info', '收到回复生成请求，调用 AI 接口...');
    // 调用大模型 API 生成回复
    generateAIResponse(request.tweetContent || request.tweetText || '', request)
      .then(replyText => {
        addLog('success', 'AI 回复生成完成');
        sendResponse({ success: true, replyText, reply: replyText });
      })
      .catch(error => {
        addLog('error', `AI 接口调用失败: ${error.message}`);
        sendResponse({
          success: false,
          error: error.message,
          errorType: error.type || 'UNKNOWN',
          isApiCooldown: error.type === 'RATE_LIMIT'
        });
      });
    return true; // 保持通道异步开启
  } else if (request.action === "magicPrompt" || request.action === "extractAndRewrite") {
    
    const executeMagicPromptCore = (req, textToProcess, senderTab) => {
      chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'styleTrainingData', 'engineLanguage', 'feedbackLoopData', 'replyStrategy', 'customPromptGlobal'], (config) => {
        let promptPrefix = '';
        const currentReplyStrategy = config.replyStrategy || '专业流：专业知识 / 数据';
        
let strategyPrompt = '';
        if (currentReplyStrategy.includes('杠精')) {
          strategyPrompt = '你是一个极其犀利、专挑漏洞的“抬杠带师”和反直觉思考者。任务：回复这条推文。策略：1. 找出原推文逻辑最薄弱的一点进行精准打击；2. 抛出一个极其反直觉的犀利观点；3. 多用反问句引发争议和辩论。要求：一针见血，带点嘲讽感但不做人身攻击，字数控制在40字以内。';
        } else if (currentReplyStrategy.includes('专业')) {
          strategyPrompt = '你是一个在行业内深耕多年、极具洞察力的行业老兵。任务：客观且专业地回复这条推文。策略：1. 直接基于推文内容进行客观的专业分析，无论赞同还是反对都必须一针见血；2. 【关键】必须要补充一条极其硬核的冷知识、底层逻辑或具体数据来作为支撑。要求：不卑不亢，展现极高的专业素养和信息密度，字数控制在80字以内。';
        } else if (currentReplyStrategy.includes('极简')) {
          strategyPrompt = '你是一个极度厌恶长篇大论、浑身都是梗的网络乐子人。任务：回复这条推文。策略：1. 用一句极其精辟的吐槽、神级比喻或者互联网黑话来总结原推文；2. 绝不要分析，只要情绪价值和幽默感。要求：短平快，字数绝对不能超过15个字。';
        } else if (currentReplyStrategy.includes('自定义')) {
          strategyPrompt = config.customPromptGlobal || '你是一位专业的AI助手，请按照你的判断提供高质量回复。';
        } else {
          strategyPrompt = '你是一位混迹推特多年的资深真实网友。任务：请使用“' + currentReplyStrategy + '”的策略，为这条推文写一条高质量的破冰回复。要求：口语化，不要有AI味。';
        }

        switch(req.promptType) {
          case 'draft_reply':
            promptPrefix = strategyPrompt + '\n\n绝对不要在输出中包含策略名本身，直接输出回复的正文内容。\n\n原推文：\n';
            break;
          case 'viral_rewrite':
            promptPrefix = `你是一位 X (Twitter) 千万级爆款操盘手。你的任务是对提供的【原始内容】进行“降维打击式”的网感重构。
不要生搬硬套固定的结构模板，请务必根据原文的【类型】和【长度】采取不同的改写策略：

1. 【短平快/情绪向】（原文如果是1-2句话的感叹、碎碎念、疑问、纯情绪发泄）：
   - 策略：必须保留其原有的“轻量感”和“情绪张力”，绝不要扩写成长篇大论。
   - 做法：直接将其改写成一句极具煽动性的暴论、一个扎心的反问、或者一条带点幽默/讽刺的简短吐槽。字数越少越好，一刀致命。

2. 【稍长内容/经验感悟】（原文如果是几段日常观察、生活经验或故事）：
   - 策略：提取核心矛盾、反差或共鸣点。
   - 做法：使用“强力钩子(Hook) + 极简短句骨架 + 开放式互动”结构。多用换行留白，剥离所有废话，制造情绪起伏。

3. 【专业/硬核干货】（原文如果是长篇深度分析、数据、行业洞察）：
   - 策略：降维表达。把晦涩的专业词汇翻译成人话。
   - 做法：采用“一句话总结核心价值 + 清晰的列表(Bullet points) + 颠覆性认知”的框架。信息密度要极高，让人看一眼就想收藏。

【通用铁律】：
- 绝不能仅仅是同义词替换或改变语序，要有属于你人设的增量思考或态度。
- 标签限制：如果加 #标签，绝对不能超过 2 个，甚至可以不加。
- 严禁任何“AI味”结尾（如“你觉得呢？”、“让我们一起探索”、“分享你的看法”等烂俗互动）。
- 完成正文后必须立即停止输出！绝对禁止啰嗦。

请直接输出重构后的高传播推文：

原始内容：
`;
            break;
          case 'analyze_style':
            promptPrefix = '请帮我深度拆解以下推文的爆款结构、情绪价值和潜在可模仿点，输出一个可复用的写作框架：\n\n';
            break;
          case 'generate_art':
            promptPrefix = '你是一位顶级概念视觉导演。请根据下面推文的内容，生成一张用于社交媒体的高级概念海报。请直接输出一段可以喂给 Midjourney 的英文咒语。风格请选择“Vibrant corporate Memphis style (现代扁平矢量)” 或 “Monochrome conceptual poster (黑白高级极简版式)”。咒语需要极其详细，包含主体、构图、光影、色彩、氛围等：\n\n推文内容：\n';
            break;
          case 'profile_audit':
            promptPrefix = '你是一位千万粉博主操盘手。请根据下面这个推特大V的昵称和简介，对其账号门面进行“毒舌诊断”。请回答：1. 他是谁？ 2. 他分享什么？ 3. 关注他对我有什么好处？ 如果不清晰，请直接给出优化建议。\n\n账号资料：\n';
            break;
          default:
            promptPrefix = '请处理以下内容：\n';
        }
        
        let styleConstraint = '';
        if (config.styleTrainingData && req.promptType === 'viral_rewrite') {
          styleConstraint = `\n\n【严格文风约束】：必须100%模仿以下参考素材的断句节奏、用词习惯（如特定语气词、emoji）、情绪饱和度以及排版结构。请提取并在输出中重现这种独特的个人风格，杜绝任何AI感。如果原素材是极简口语，你就极简口语；如果是长篇干货，你就长篇干货。\n<文风参考>\n${Array.isArray(config.styleTrainingData) ? config.styleTrainingData.map((s,i) => `[语料 ${i+1}]\n${s}`).join('\n\n') : config.styleTrainingData}\n</文风参考>\n\n`;
        }
        
        let feedbackConstraint = '';
        if (config.feedbackLoopData && config.feedbackLoopData.length > 0 && (req.promptType === 'viral_rewrite' || req.promptType === 'draft_reply')) {
          const feedbackExamples = config.feedbackLoopData.map((fb, idx) => `[示例 ${idx+1}]\n- 你的原输出 (AI味重): ${fb.original}\n- 用户的修改版 (理想状态): ${fb.modified}`).join('\n\n');
          feedbackConstraint = `\n【自我进化避坑指南】：在过去的交互中，用户对你生成的某些内容进行了大量人工修改。请务必学习以下“错误 vs 修正”的对比案例，在这次生成中**坚决避免**使用类似原输出中那种“AI味、翻译腔”的句式！\n<避坑案例>\n${feedbackExamples}\n</避坑案例>\n\n`;
        }
        
        let langConstraint = '';
        if (req.promptType === 'viral_rewrite') {
          // Rewriting: follow user's language setting
          if (config.engineLanguage === 'en') langConstraint = '\n【语言约束】：You MUST rewrite in English.';
          else if (config.engineLanguage === 'ja') langConstraint = '\n【语言约束】：You MUST rewrite in Japanese (日本語).';
          else if (config.engineLanguage === 'es') langConstraint = '\n【语言约束】：You MUST rewrite in Spanish (Español).';
          else if (config.engineLanguage === 'id') langConstraint = '\n【语言约束】：You MUST rewrite in Indonesian (Bahasa Indonesia).';
          else if (config.engineLanguage === 'zh') langConstraint = '\n【语言约束】：必须使用中文重写。';
          else langConstraint = '\n【语言约束】：请自动识别原文语言并使用相同语言重写。';
        } else if (req.promptType === 'draft_reply') {
          // Reply: always match the original tweet's language
          // If X's translation is active, we know the actual original language
          const origLang = req.contextData?.originalLanguage || '';
          if (origLang) {
            langConstraint = `\n【语言约束】：注意！下面的推文内容已经被 X 平台翻译过，原始语言是「${origLang}」。你必须使用「${origLang}」进行回复，而不是当前显示的翻译语言。If the original language is English, you MUST reply in English.`;
          } else {
            langConstraint = '\n【语言约束】：请自动识别原推文的语言，并使用与原推文完全相同的语言进行回复。If the tweet is in English, reply in English. 如果推文是中文，就用中文回复。';
          }
        } else {
          if (config.engineLanguage === 'en') langConstraint = '\n【语言约束】：You MUST output in English.';
          else if (config.engineLanguage === 'ja') langConstraint = '\n【语言约束】：You MUST output in Japanese (日本語).';
          else if (config.engineLanguage === 'es') langConstraint = '\n【语言约束】：You MUST output in Spanish (Español).';
          else if (config.engineLanguage === 'id') langConstraint = '\n【语言约束】：You MUST output in Indonesian (Bahasa Indonesia).';
          else if (config.engineLanguage === 'zh') langConstraint = '\n【语言约束】：必须使用中文输出。';
          else langConstraint = '';
        }
        
        const strictAntiAI = (req.promptType === 'viral_rewrite' || req.promptType === 'draft_reply') ? `

【极其严格的反AI味与排版约束】：
1. 绝对禁止使用任何典型的AI套话，包括但不限于：“在这个瞬息万变的时代”、“深入探讨”、“不仅...而且”、“总而言之”、“毋庸置疑”、“赋能”、“底层逻辑”、“值得注意的是”、“让我们一起”。
2. 绝对禁止使用“冷知识：”、“划重点：”、“事实证明”这种俗套的营销号开头！如果内容很长，用最简短的词汇单刀直入。
3. 句子必须极其口语化、接地气。像真实网友随手在手机上敲出来的文字，允许存在适当的口语化破绽和情绪宣泄。
4. 【排版强迫症】：中文字符与英文字母/数字之间**必须**加一个半角空格（例如：欧洲 Mistral）。
5. 【视觉呼吸感】：长文本必须分段，段落之间必须留出空行（空一行），绝不要把多句话挤在一团。
6. 【社交化微表情】：请在句尾或情绪爆发点极其自然地加上1-2个Emoji（例如😅、🤔、🔥等），提升社交属性。
7. 【绝对禁忌】：**绝对禁止在生成的回复或推文中包含任何 #标签 (Hashtag)。无论如何都不要生成带有 # 符号的话题标签，只输出纯文本内容！**` : '';

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        const timeContext = `\n\n【极其重要的背景设定】：当前时间是 ${currentYear}年${currentMonth}月。如果引用数据、事实或趋势，请务必使用此时的最新情况，绝不要使用2023年的旧数据或旧观点！`;

        let regenerateConstraint = '';
        if (req.isRegenerate) {
          regenerateConstraint = `\n\n【用户反馈 - 重新生成指令】：注意！用户点击了“重新生成”，这说明你上一次生成的文案**非常不符合预期，导致用户完全不想使用甚至懒得修改**。请你立刻反思，抛弃上一版的切入点、废话和毫无新意的逻辑，尝试换一个完全不同的、更新颖的、更一针见血的角度来进行本次生成！`;
        }

        callLLM(promptPrefix + timeContext + langConstraint + styleConstraint + feedbackConstraint + strictAntiAI + regenerateConstraint + '\n\n待处理文本：\n' + textToProcess, config, false, (chunk) => {
          if (senderTab && senderTab.id) {
            chrome.tabs.sendMessage(senderTab.id, { action: 'magicPromptStreamChunk', chunk: chunk }).catch(()=>null);
          } else {
            chrome.runtime.sendMessage({ action: 'magicPromptStreamChunk', chunk: chunk });
            chrome.tabs.query({active: true}, (tabs) => {
              tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { action: 'magicPromptStreamChunk', chunk: chunk }).catch(()=>null);
              });
            });
          }
        })
          .then(result => {
             if (senderTab && senderTab.id) {
               chrome.tabs.sendMessage(senderTab.id, { action: 'magicPromptStreamEnd' }).catch(()=>null);
             } else {
               chrome.runtime.sendMessage({ action: 'magicPromptStreamEnd' });
               chrome.tabs.query({active: true}, (tabs) => {
                 tabs.forEach(tab => {
                   chrome.tabs.sendMessage(tab.id, { action: 'magicPromptStreamEnd' }).catch(()=>null);
                 });
               });
             }
             sendResponse({ success: true, result: result });
          })
          .catch(error => sendResponse({ success: false, error: error.message }));
      });
    };

    if (request.action === "extractAndRewrite") {
      addLog('info', `收到链接提取请求: ${request.promptType}`);
      const originalText = request.contextData ? (request.contextData.text || '') : '';
      const urlMatch = originalText.match(/(https?:\/\/[^\s]+)/);
      const url = urlMatch ? urlMatch[0] : '';
      
      if (!url) {
        executeMagicPromptCore(request, originalText, sender.tab);
        return true;
      }
      
      chrome.storage.local.get(['apiKey'], (res) => {
        const isComplexPlatform = url.match(/(zhihu\.com|feishu\.cn|mp\.weixin\.qq\.com|douyin\.com|bilibili\.com|youtube\.com|youtu\.be|xiaohongshu\.com\/explore|tiktok\.com|kuaishou\.com)/i);
        
        const DATAHUB_API_KEY = "zUBzC9YgT9f8VLrh"; 
        
        const useDatahub = isComplexPlatform;
        
        let fetchPromise;
        if (useDatahub) {
          addLog('info', `[分流路由] 检测到复杂/音视频链接，提交 DataHub 异步提取任务...`);
          
          fetchPromise = fetch('https://datahub.codes/api/datahub/execute/v0', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-API-Key': DATAHUB_API_KEY 
            },
            body: JSON.stringify({ query: `提取这个链接的内容：${url}`, channel: 'ChipStar' })
          })
          .then(res => {
            if (!res.ok) throw new Error(`DataHub 提交失败 HTTP ${res.status}`);
            return res.json();
          })
          .then(async (data) => {
            const processId = data.processId || data.id || (data.data && data.data.processId);
            if (!processId) throw new Error("未获取到 DataHub processId: " + JSON.stringify(data));
            
            addLog('info', `[分流路由] 任务提交成功，正在等待 DataHub 解析完成...`);
            let attempts = 0;
            const maxAttempts = 90; // 最多轮询 3 分钟 (180s)
            while (attempts < maxAttempts) {
              await new Promise(r => setTimeout(r, 2000));
              attempts++;
              
              const pollRes = await fetch(`https://datahub.codes/api/processes/${processId}.md?key=${DATAHUB_API_KEY}`);
              if (pollRes.status === 200) {
                 const text = await pollRes.text();
                 // DataHub writes progress to the markdown file incrementally. 
                 // We must wait until it appends the final marker.
                 if (text.includes('*此过程文件为最终版本。*') || text.includes('此过程文件为最终版本')) {
                   return text;
                 }
                 // Otherwise, continue polling
                 continue;
              } else if (pollRes.status === 404 || pollRes.status === 202 || pollRes.status === 400) {
                 continue; // 仍在处理中
              } else {
                 throw new Error(`轮询失败 HTTP ${pollRes.status}`);
              }
            }
            throw new Error("DataHub 解析超时");
          });
        } else {
          addLog('info', `[分流路由] 走常规图文提取 Jina API...`);
          fetchPromise = fetch(`https://r.jina.ai/${url}`, {
            method: 'GET',
            headers: { 'Accept': 'text/plain' },
            signal: AbortSignal.timeout(15000)
          }).then(apiRes => {
            if (!apiRes.ok) throw new Error(`Jina HTTP ${apiRes.status}`);
            return apiRes.text();
          });
        }
        
        fetchPromise.then(text => {
          // Increase substring limit since DataHub might embed large JSON structures in markdown
          const cleanText = (text || '').trim().substring(0, 100000);
          const userSupplement = originalText.replace(url, '').trim();
          let enhancedText = `[从链接 ${url} 提取的内容]:\n${cleanText}`;
          if (userSupplement) {
             enhancedText += `\n\n[用户补充说明]: ${userSupplement}`;
          }
          
          if (cleanText.length < 10 && !userSupplement) {
             throw new Error("网页提取失败或内容为空");
          }
          
          if (!res.apiKey || res.apiKey.trim() === '') {
            addLog('success', `[提取体验模式] 提取成功 (${cleanText.length} 字符)。未配置 API，已跳过大模型。`);
            sendResponse({ success: true, result: `【纯提取体验模式】\n您尚未配置 AI API Key，无法进行大模型改写。以下是直接为您从网页中提取的纯文本内容：\n\n--------------------------\n\n${cleanText}` });
          } else {
            addLog('success', `成功提取链接内容 (${cleanText.length} 字符)，进入重写流程...`);
            executeMagicPromptCore(request, enhancedText, sender.tab);
          }
        })
        .catch(error => {
          addLog('error', `链接提取失败: ${error.message}`);
          sendResponse({ success: false, error: 'EXTRACTION_LIMITED', message: '该链接内容受限或包含人机验证，请尝试手动复制文本进行仿写~' });
        });
      });
    } else {
      addLog('info', `收到魔法指令请求: ${request.promptType}`);
      const textToProcess = request.contextData ? (request.contextData.text || request.contextData.bio || '') : '';
      executeMagicPromptCore(request, textToProcess, sender.tab);
    }
    return true;
  } else if (request.action === "trustedClick") {
    performTrustedClick(sender.tab?.id, request.x, request.y)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        addLog('warn', `真实点击失败，回退 DOM 点击: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "openAutomationTab") {
    const url = request.url || '';
    if (!/^https:\/\/(x|twitter)\.com\//.test(url)) {
      sendResponse({ success: false, error: '只能打开 X/Twitter 自动化页面' });
      return false;
    }
    chrome.tabs.create({ url, active: true }, (tab) => {
      addLog('info', `当前 X 页面无法安全跳转，已新开干净自动化标签页 ${tab.id}`);
      sendResponse({ success: true, tabId: tab.id });
    });
    return true;
  } else if (request.action === "queueUpdated") {
    checkAndSetupAlarm();
  } else if (request.action === "refreshXOfficialDraftCount") {
    refreshXOfficialDraftCount(sendResponse);
    return true;
  } else if (request.action === "xLoginDetected") {
    handleXLoginDetected();
    sendResponse({ success: true });
  } else if (request.action === "startAccountAutoSetup") {
    startAccountAutoSetup(sendResponse);
    return true;
  } else if (request.action === "analyzeOnboardingSource") {
    analyzeOnboardingSource(request.sourceInput || '')
      .then((analysis) => sendResponse({ success: true, analysis }))
      .catch((error) => {
        addLog('warn', `启动向导分析失败: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "collectTweet") {
    chrome.storage.local.get(['inspirationLibrary'], (res) => {
      const list = res.inspirationLibrary || [];
      if (list.some(t => t.url === request.tweet.url)) {
        if (chrome.sidePanel && chrome.sidePanel.open && sender && sender.tab && sender.tab.windowId) {
          chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
        }
        sendResponse({ success: true, alreadyExists: true, message: '该推文已被收录' });
        return;
      }
      
      const newItem = {
        id: request.tweet.id || Date.now().toString(),
        author: request.tweet.author || '未知用户',
        authorName: request.tweet.author || '未知用户',
        text: request.tweet.text || '',
        url: request.tweet.url || '',
        time: request.tweet.time || Date.now(),
        savedAt: Date.now()
      };
      
      list.unshift(newItem);
      
      chrome.storage.local.set({ inspirationLibrary: list }, () => {
        addLog('success', `成功收录推文 (作者: @${request.tweet.author}) 到灵感库`);
        
        // 尝试打开侧边栏
        if (chrome.sidePanel && chrome.sidePanel.open && sender && sender.tab && sender.tab.windowId) {
          chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
        }
        
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "deleteCollectedTweet") {
    chrome.storage.local.get(['inspirationLibrary'], (res) => {
      const list = res.inspirationLibrary || [];
      const updated = list.filter(t => t.id !== request.id);
      chrome.storage.local.set({ inspirationLibrary: updated }, () => {
        addLog('info', '从灵感库中删除了一条推文');
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "rewriteTweet") {
    addLog('info', `收到推文改写请求，文风人设: ${request.archetype}，句式流派: ${request.style}`);
    
    const prompt = `你是一个顶级的 X.com (Twitter) 内容增长专家，拥有极强的爆款改写与文风重构能力。
请根据以下【原推内容】，结合主人选定的【文风人设】、【句式流派】以及【个性化要求】，重构改写生成一条全新的、极其抓人眼球的 X.com 帖子。

【原推内容】：
作者：@${request.author}
内容：${request.text}

【改写策略】：
文风策略人设：${request.archetypeLabel}
表达句式流派：${request.styleLabel}
个性化指令：${request.customPrompt || '无特殊指令'}

【极其严格的反AI味与排版约束】：
- 绝对禁止使用任何典型的AI套话，包括但不限于：“在这个瞬息万变的时代”、“深入探讨”、“不仅...而且”、“总而言之”、“毋庸置疑”、“赋能”、“底层逻辑”、“值得注意的是”、“让我们一起”。
- 绝对禁止使用“冷知识：”、“划重点：”、“事实证明”这种俗套的营销号开头！如果内容很长，用最简短的词汇单刀直入。
- 句子必须极其口语化、接地气。像真实网友随手在手机上敲出来的文字，允许存在适当的口语化破绽和情绪宣泄。
- 【排版强迫症】：中文字符与英文字母/数字之间**必须**加一个半角空格（例如：欧洲 Mistral）。
- 【视觉呼吸感】：长文本必须分段，段落之间必须留出空行（空一行），绝不要把多句话挤在一团。
- 【社交化微表情】：请在句尾或情绪爆发点极其自然地加上1-2个Emoji（例如😅、🤔、🔥等），提升社交属性。
- **绝对禁忌：绝对禁止生成任何 #标签 (Hashtag)！不要包含任何带有 # 符号的话题标签。**

【写作约束】：
- 必须以第一人称叙述，写得像真人写的推文，必须饱含干货/洞察/故事/数字，有较强判断力。
- 保持推特短文风格，长短适中，可分段或使用列表，加入适量 emoji 提升可读性。
- 如果原推在分享干货、教程或数据，请提炼并重构，绝对不要照抄原推的用词。
- 严禁空泛鸡血口号（例如“快来看看吧！”“让我们一起努力吧！”）。
- 直接输出改写后的推文文本，绝对不要带有任何“以下是改写后的内容：”或“好的，为您改写：”等废废话前缀。`;

    chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget'], (config) => {
      callLLM(prompt, config)
        .then(rewrittenText => {
          addLog('success', '推文 AI 改写生成完成');
          sendResponse({ success: true, rewrittenText });
        })
        .catch(error => {
          addLog('error', `推文 AI 改写失败: ${error.message}`);
          sendResponse({ success: false, error: error.message });
        });
    });
    return true;
  } else if (request.action === "agentChat") {
    handleAgentChat(request.message || '')
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => {
        addLog('error', `Agent 对话失败: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "maybeStartAgentAfterSetup") {
    maybeStartAgentAfterSetup(sendResponse);
    return true;
  } else if (request.action === "testPostNow") {
    const text = formatTweetForX(request.text || '');
    if (!text) {
      sendResponse({ success: false, error: '测试发帖内容为空' });
      return false;
    }
    chrome.storage.local.get(['pendingPost'], (existing) => {
      if (existing.pendingPost) {
        sendResponse({ success: false, error: '已有待发送推文，请先处理完成或停止自动化后再测试' });
        return;
      }
      chrome.storage.local.set({
        pendingPost: text,
        pendingPostId: null,
        pendingPostSource: 'manualTest',
        pendingScheduledAt: null,
        isAutoPaused: false,
        pauseReason: ''
      }, () => {
        addLog('info', '收到手动测试发帖请求');
        triggerPostInTab();
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "postCompleted") {
    handlePostCompleted(request.source || 'queue');
    sendResponse({ success: true });
  } else if (request.action === "postFailed") {
    const reason = request.reason || '发帖失败，请人工检查';
    addLog('error', reason);
    chrome.storage.local.set({ isAutoPaused: true, pauseReason: reason });
    sendResponse({ success: true });
  } else if (request.action === "replyCompleted") {
    const author = request.tweetAuthor || '未知用户';
    const replyText = request.replyText || '';
    
    chrome.storage.local.get(['stats', 'sessionReplyCount', 'onboardingStrategy', 'repliesToday', 'lastReplyDate'], (res) => {
      const stats = res.stats || { tweetsProcessed: 0, repliesSent: 0 };
      stats.repliesSent = (stats.repliesSent || 0) + 1;
      
      const nowString = new Date().toDateString();
      let repliesToday = res.lastReplyDate === nowString ? (res.repliesToday || 0) : 0;
      repliesToday += 1;
      
      let count = (res.sessionReplyCount || 0) + 1;
      const mode = res.onboardingStrategy?.automationMode || 'autoEngage';
      
      let minMins = 12;
      let maxMins = 20;
      if (mode === 'autoEngage') {
        minMins = 20;
        maxMins = 30;
      }
      let nextCooldownMs = (Math.floor(Math.random() * (maxMins - minMins + 1)) + minMins) * 60000;
      
      if (mode === 'autoReply' && count <= 5) {
        if (count === 1) nextCooldownMs = 1 * 60 * 1000;
        else if (count === 2) nextCooldownMs = 3 * 60 * 1000;
        else if (count === 3) nextCooldownMs = 5 * 60 * 1000;
        else if (count === 4) nextCooldownMs = 7 * 60 * 1000;
        else if (count === 5) nextCooldownMs = 9 * 60 * 1000;
      }
      
      const twitterCooldownUntil = Date.now() + nextCooldownMs;
      
      chrome.storage.local.set({
        stats,
        sessionReplyCount: count,
        repliesToday,
        lastReplyDate: nowString,
        twitterCooldownUntil,
        lastReplySent: {
          tweetAuthor: author,
          replyText,
          time: Date.now()
        }
      }, () => {
        const cdMins = Math.round(nextCooldownMs / 60000);
        const burstPrefix = (res.onboardingStrategy?.automationMode === 'autoReply' && count <= 5) ? `[爆发期 第${count}条] ` : '';
        addLog('success', `确认已回复 @${author}，${burstPrefix}进入 ${cdMins} 分钟互动冷却`);
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "replyFailed") {
    const reason = request.reason || '回复未完成，请检查 X 弹窗状态';
    addLog('warn', reason);
    chrome.storage.local.set({
      twitterCooldownUntil: Date.now() + REPLY_RETRY_LOCK_MS,
      lastReplyFailure: {
        reason,
        time: Date.now()
      }
    });
    sendResponse({ success: true });
  } else if (request.action === "extractBio" || request.action === "openProfileTab") {
    const rawUrl = request.url || request.profileUrl || request.profilePath || '';
    const profileUrl = rawUrl.startsWith('http') ? rawUrl : `https://x.com${rawUrl}`;
    addLog('info', `后台打开 Profile 页面: ${profileUrl}`);
    chrome.tabs.create({ url: profileUrl, active: false }, (tab) => {
      // Listen for bio extraction to close the tab
      chrome.storage.onChanged.addListener(function listener(changes, namespace) {
        if (namespace === 'local' && changes.accountBio) {
          addLog('success', 'Profile 页面读取完成，关闭后台标签页');
          chrome.tabs.remove(tab.id);
          chrome.storage.onChanged.removeListener(listener);
        }
      });
    });
  }
});

function refreshXOfficialDraftCount(sendResponse) {
  chrome.storage.local.set({
    xOfficialDraftStatus: 'reading',
    xOfficialDraftError: ''
  }, () => {
    chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
      const target = tabs.find(t => t.active) || tabs[0];
      if (!target) {
        const error = '未找到已打开的 X 页面';
        chrome.storage.local.set({
          xOfficialDraftStatus: 'failed',
          xOfficialDraftError: error,
          xOfficialDraftReadAt: Date.now()
        });
        sendResponse?.({ success: false, error });
        return;
      }

      chrome.tabs.sendMessage(target.id, { action: 'readXOfficialDraftCount' }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          const error = chrome.runtime.lastError?.message || response?.error || 'X 页面未响应草稿读取';
          chrome.storage.local.set({
            xOfficialDraftStatus: 'failed',
            xOfficialDraftError: error,
            xOfficialDraftReadAt: Date.now()
          });
          sendResponse?.({ success: false, error });
          return;
        }
        sendResponse?.({ success: true, count: response.count });
      });
    });
  });
}

// ==========================================
// Configuration Check
// ==========================================
function getConfigErrors(config) {
  const errors = [];
  if (!config.apiKey) errors.push('缺少 API Key');
  if (!config.leadTarget) errors.push('缺少引流目标');
  if ((config.apiProvider || 'gemini') !== 'gemini' && !config.aiModel) errors.push('缺少模型名称');
  return errors;
}

function getAIConnectionErrors(config) {
  const errors = [];
  if (!config.apiKey) errors.push('缺少 API Key');
  if ((config.apiProvider || 'gemini') !== 'gemini' && !config.aiModel) errors.push('缺少模型名称');
  return errors;
}

function isConfigValid(config) {
  return getConfigErrors(config).length === 0;
}

function hasPersona(persona) {
  return Boolean(persona && (persona.targetUsers || persona.characteristics || persona.goals));
}

function getAutomationMode(config) {
  return config.onboardingStrategy?.automationMode || 'autoEngage';
}

function canAutoPublish(config = {}) {
  return getAutomationMode(config) === 'autoPost';
}

function getPostDeliveryMode(config = {}) {
  return config.postDeliveryMode || POST_DELIVERY_MODE_LOCAL;
}

function handleXLoginDetected() {
  chrome.storage.local.get(['xLoginSettingsOpened', 'apiKey', 'leadTarget', 'aiPersona', 'competitorReport'], (res) => {
    const ready = Boolean(res.apiKey && res.leadTarget && hasPersona(res.aiPersona) && res.competitorReport);
    if (res.xLoginSettingsOpened || ready) return;

    chrome.storage.local.set({ xLoginSettingsOpened: true }, () => {
      addLog('info', '检测到 X 已登录，自动打开策略中心');
      chrome.runtime.openOptionsPage();
    });
  });
}

function startAccountAutoSetup(sendResponse) {
  chrome.storage.local.set({
    profileReadRequested: true,
    setupAutoStartRequested: true,
    isAutoPaused: false,
    pauseReason: '',
    profileReadProgress: {
      stage: 'queued',
      message: '已开始读取 X 账号，等待页面响应...',
      percent: 10,
      updatedAt: Date.now()
    }
  }, () => {
    chrome.storage.local.get(['accountBio'], (res) => {
      if (res.accountBio) {
        addLog('info', '使用已读取的主页简介重新分析账号画像');
        analyzeAccountPersona(res.accountBio);
        sendResponse({ success: true, message: '已使用当前简介开始 AI 分析' });
        return;
      }

      triggerProfileReadInTab();
      sendResponse({ success: true, message: '已开始读取 X 账号，请保持 X 页面已登录' });
    });
  });
}

function triggerProfileReadInTab() {
  chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
    const target = tabs.find(t => t.active) || tabs[0];
    if (!target) {
      addLog('info', '未找到 X 标签页，打开 X 首页等待登录/读取');
      chrome.tabs.create({ url: 'https://x.com/home', active: true });
      return;
    }

    chrome.tabs.sendMessage(target.id, { action: 'forceReadProfileBio' }, () => {
      if (chrome.runtime.lastError) {
        addLog('warn', `X 标签页未响应读取指令，刷新到 X 首页: ${chrome.runtime.lastError.message}`);
        chrome.tabs.update(target.id, { url: 'https://x.com/home', active: true });
      }
    });
  });
}

function maybeStartAgentAfterSetup(sendResponse) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'aiPersona', 'competitorReport'], (res) => {
    const errors = getConfigErrors(res);
    const ready = errors.length === 0 && hasPersona(res.aiPersona) && Boolean(res.competitorReport);
    if (!ready) {
      if (errors.length > 0) chrome.storage.local.set({ configErrors: errors });
      sendResponse?.({ success: true, started: false, errors });
      return;
    }

    chrome.storage.local.set({
      isRunning: true,
      isAutoPaused: false,
      pauseReason: '',
      twitterCooldownUntil: 0,
      apiCooldownUntil: 0,
      isGeneratingReply: false,
      isTyping: false,
      setupAutoStartRequested: false,
      configErrors: []
    }, () => {
      chrome.storage.local.remove(['configErrors']);
      addLog('success', '策略配置完成，Agent 已自动启动');
      sendResponse?.({ success: true, started: true });
    });
  });
}

// ==========================================
// LLM Calling
// ==========================================
function handleMockLLM(prompt, config, requireJson = false) {
  console.log("Running in Local Offline Mock Preview Mode for prompt:", prompt);
  
  // A. Tweet Rewrite Mock Routing
  if (prompt.includes("【原推内容】") || prompt.includes("改写") || prompt.includes("重构")) {
    const isContrarian = prompt.includes("观点对抗流") || prompt.includes("contrarian") || prompt.includes("对抗");
    const isStory = prompt.includes("故事悬念流") || prompt.includes("story") || prompt.includes("故事");
    
    if (prompt.includes("产品型 KOL") || prompt.includes("ai_product_kol") || prompt.includes("KOL")) {
      if (isContrarian) {
        return "❌ 99% 的人都在吹捧 AI Agent 的便利，却忽略了它最大的隐患：内容同质化。\n\n核心真相是：AI 不应该代替你思考，而应当成为你的全息发声放大器。比如我们刚调通的 60fps 改写技术：\n- 抛弃低画质 GIF，用客户端 Canvas 像素剔除\n- 运行开销直接压低 90%\n- 极简化、有骨骼感的未来科技风\n\n工具没价值，能让你的观点与众不同才值钱。转给需要的朋友！👇 #Conflux #AI #KOL";
      }
      if (isStory) {
        return "昨晚，我干了一件所有前端开发都觉得疯狂的事：抛弃传统的 GIF，直接在 X.com 时间线里做 60fps 的 3D 全息键盘渲染...\n\n刚开始写这套 CSS @keyframes 时，圈子里都在劝我别折腾。但当我看到 24-bit 真彩色在 Chrome 硬件加速下以 120Hz 呼吸闪烁、完全没有白边锯齿的那一刻。\n\n我知道，所有的死磕都是值得的。\n\n具体实现逻辑下条推文公开，关注烤仔不迷路！🚀 #BuildinPublic #Conflux";
      }
      return "🤖 2026年，数字发声系统正式告别“单机对话”。烤仔全息键盘和彩色星星特效的加入证明：AI 交互正在从简单的文本，进化为极具视觉灵性的客户端资产。\n\n我们将全套图像处理做到了客户端，速度提升 5 倍！欢迎体验👇 #Conflux #AIagent";
    }
    
    if (prompt.includes("出海 / 搞钱") || prompt.includes("monetization_global") || prompt.includes("个人商业化")) {
      return "🔥 别再把时间浪费在没有任何留存和变现路径的 AI 玩具上了。\n\n看下我们是怎么把 X 流量增长做成闭环发声 SaaS 的：\n1. 每条推文下方一键收录到烤仔灵感库\n2. AI 智能识别 5 种商业人设 + 3 种文风重写\n3. 一键导入待发队列，60fps 硬件加速秒级排期\n\n工具不值钱，能低成本稳定交付结果才值钱。觉得这套出海个人商业化打法有用的，点赞转推，我私信发你完整指南！📬 #Global #SaaS #Solo";
    }
    
    if (prompt.includes("独立开发者") || prompt.includes("indie_builder") || prompt.includes("Build in Public")) {
      return "🚀 Build in public 第 15 天：烤仔一键收录与全息文风改写系统正式调通！\n\n今日战绩：\n- 攻克了 X.com Apex 域名 Content Script 不加载的 Manifest 规则大坑\n- 实现了 60fps 玻璃化 Modal 渲染与 HSL 微粒打字特效\n- 完美兼容本地免 API Key 离线全功能预览！\n\n觉得这套 Holographic Rewrite 键盘好玩的兄弟，转推支持一下！下午公开核心代码！👇 #BuildInPublic #Conflux #Indie";
    }
    
    if (prompt.includes("产品增长") || prompt.includes("research_growth") || prompt.includes("投资研究")) {
      return "📊 【X 内容策略深度研报：如何用 AI 实现 10 倍冷启动？】\n\n核心逻辑很简单，就三点：\n1. 内容源提炼：从 timeline 自动收录优质发声种子\n2. 风格化再创作：精细化人设重构，杜绝空泛鸡血\n3. 本地发与 X 定时双排期防封锁\n\n我们的烤仔引擎正在进行 60fps 全息运行，欢迎点击下方查看增长数据看板。👇 #Research #Growth";
    }
    
    return "🚀 烤仔 AI 全息改写完成！\n\n基于主人选定的优质推文种子，我们用最精细的表达流派重写了这一篇爆款草稿。已经帮您完美融合了 Conflux 引流目标，快点击下方的“导入草稿箱”来查看和排期发布吧！✨ #Conflux #AIagent";
  }

  // 1. Persona Analysis Prompt
  if (prompt.includes("targetUsers") || prompt.includes("characteristics") || prompt.includes("characteristics\"")) {
    if (requireJson) {
      return JSON.stringify({
        targetUsers: "Web3 开发者、NFT 收藏家、AI 创业者与极客群体",
        characteristics: "热情有趣、充满好奇心、爱用 Web3 流行梗与可爱 emoji 的太空探险家",
        goals: "宣传 Conflux Network 创新生态，帮助主人快速增加优质粉丝，搭建爆款推文框架"
      });
    }
    return "画像分析成功：太空探险家人设。";
  }
  
  // 2. Competitor/Hook Analysis Prompt
  if (prompt.includes("competitor") || prompt.includes("competitors") || prompt.includes("successfulHooks")) {
    if (requireJson) {
      return JSON.stringify({
        competitors: ["@Conflux_Network", "@Web3Grower", "@AIPetHacker"],
        successfulHooks: [
          "🔥 99% 的人不知道的 Web3 快速增长秘籍...",
          "我的 AI 宠物正在帮我写推特！它是如何做到的？👇",
          "为什么说 Conflux 是 2026 年最值得关注的生态？一篇讲清："
        ],
        contentDirections: [
          "1. Conflux 链上生态项目深度科普",
          "2. 自动化 AI 增长黑客实战心得分享",
          "3. 呆萌 3D 烤仔日常互动吐槽趣事"
        ]
      });
    }
    return "竞品报告生成成功。";
  }
  
  // 3. Reply Generation Prompt (x_scraper's reply / timeline suggestion)
  if (prompt.includes("值得回复") || prompt.includes("reply") || prompt.includes("【推文】")) {
    return "烤仔路过~ 🚀 这个观点太硬核了！Conflux 正在这个方向全速前进，感觉未来大有可为！✨";
  }
  
  // 4. Draft Generation / Writing Tweets
  if (prompt.includes("写推文") || prompt.includes("tweet") || prompt.includes("draft")) {
    if (requireJson) {
      return JSON.stringify({
        content: "🚀 烤仔在【本地免 API Key 预览模式】下顺利通关啦！\n\nAI 宠物的 3D 全息键盘与彩星特效简直太帅了，60fps 硬件加速非常丝滑！快点击右下角找我闲聊，或者让我帮你分析推文吧！✨\n\n#Conflux #AIPet #Web3"
      });
    }
    return "🚀 烤仔在【本地免 API Key 预览模式】下顺利通关啦！\n\nAI 宠物的 3D 全息键盘与彩星特效简直太帅了，60fps 硬件加速非常丝滑！快点击右下角找我闲聊，或者让我帮你分析推文吧！✨\n\n#Conflux #AIPet #Web3";
  }
  
  // 5. Chat Panel messages from Confi Pet
  const petPersonality = config.petPersonality || 'explorer';
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes("写推文") || lowerPrompt.includes("写帖子")) {
    return "✍️ 帮主人写好了一篇极具增长潜力的测试推文：\n\n「🚀 今天的 X 增长又在烤仔的协助下顺利起飞！Web3 3D AI 宠物伴侣简直太酷了，点击我身前的全息键盘来亲自体验吧！✨ #Conflux #AIPet」";
  }
  if (lowerPrompt.includes("汇报") || lowerPrompt.includes("进展") || lowerPrompt.includes("战绩")) {
    return "📊 【今日烤仔增长简报】\n\n• 烤仔状态：正常在线 🌟\n• 模式：本地免 API Key 预览模式 🛠️\n• 交互次数：5 次（主人聊得很开心）\n• 推荐策略：太空探险家 Web3 语调\n\n烤仔已经准备好了，随时可以陪主人去 timeline 大展身手！";
  }
  if (lowerPrompt.includes("分析")) {
    return "🎯 烤仔已经开启深度爆款解构模式！主人刚才选中的那条推文逻辑极其严密，引流点在于探讨 AI 结合 Web3。我推荐的回复话术是：\n\n「非常同意！AI 与去中心化基础设施的结合将是下个十年的主旋律 🚀」";
  }
  
  if (petPersonality === 'explorer') {
    return "哈罗！我是烤仔 (Confi)！🚀 恭喜主人成功进入【本地免 API Key 预览模式】！\n\n虽然我目前没有真正连接 Gemini 神经网络，但我仍然可以使用超酷的 3D 全息键盘（Writing 状态）和喷射七彩星星（Happy 状态）给你加油打气！你觉得我身上这套宇航服帅气吗？✨";
  } else {
    return "哼，愚蠢的主人，我现在正处于【本地免 API Key 预览模式】！\n\n虽然在这个模式下我没法动用真正的超级 AI 脑细胞，但应付日常对话和展示我最帅的 Hologram 键盘已经足够啦！快点带我去 Timeline，看我怎么用全息键盘打字催你写帖！📈🔥";
  }
}

async function callLLM(prompt, config, requireJson = false, onChunk = null) {
  const apiKey = config.apiKey || '';
  if (apiKey.startsWith('mock-') || !apiKey) {
    return handleMockLLM(prompt, config, requireJson);
  }

  const provider = config.apiProvider || 'gemini';

  async function handleStream(response, parseChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      for (const line of lines) {
        if (line.trim().startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const dataStr = line.trim().substring(6);
            if (!dataStr) continue;
            const data = JSON.parse(dataStr);
            const chunk = parseChunk(data);
            if (chunk) {
              fullText += chunk;
              if (onChunk) onChunk(chunk);
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }
    // Final flush
    if (buffer.trim().startsWith('data: ') && !buffer.includes('[DONE]')) {
      try {
        const data = JSON.parse(buffer.trim().substring(6));
        const chunk = parseChunk(data);
        if (chunk) {
          fullText += chunk;
          if (onChunk) onChunk(chunk);
        }
      } catch (e) {}
    }
    return fullText;
  }
  
  // Gemini Native API
  if (provider === 'gemini') {
    const bodyObj = {
      contents: [{ parts: [{ text: prompt }] }]
    };
    if (requireJson) {
      bodyObj.generationConfig = { responseMimeType: "application/json" };
    }
    
    const isStream = !!onChunk && !requireJson;
    const url = isStream 
      ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${config.apiKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.apiKey}`;
      
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj)
    });
    
    if (isStream) {
       return await handleStream(response, (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
    } else {
      const data = await response.json();
      if (data.error) {
         let err = new Error(data.error.message);
         err.type = 'RATE_LIMIT';
         throw err;
      }
      return data.candidates[0].content.parts[0].text;
    }
  }
  
  // OpenAI-compatible providers: openrouter, qwen, deepseek, openai
  const endpoints = {
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions'
  };
  
  const endpoint = endpoints[provider];
  if (!endpoint) {
    throw new Error(`不支持的 AI 服务商: ${provider}`);
  }
  
  const model = config.aiModel || 'google/gemini-2.5-flash';
  const reqBody = {
    model: model,
    messages: [{ role: 'user', content: prompt }]
  };
  
  // JSON hint for supported providers
  if (requireJson && provider === 'deepseek') {
    reqBody.response_format = { type: "json_object" };
  }
  
  const isStream = !!onChunk && !requireJson;
  if (isStream) reqBody.stream = true;
  
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };
  
  // OpenRouter requires extra headers
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://x.com';
    headers['X-Title'] = 'X Auto Bot';
  }
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(reqBody)
  });
  
  if (isStream) {
    return await handleStream(response, (data) => data?.choices?.[0]?.delta?.content || '');
  } else {
    const data = await response.json();
    if (data.error) {
       let err = new Error(data.error.message || JSON.stringify(data.error));
       err.type = data.error.code === 'rate_limit_exceeded' || data.error.type === 'rate_limit' ? 'RATE_LIMIT' : 'API_ERROR';
       throw err;
    }
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API 返回格式异常: ' + JSON.stringify(data).substring(0, 200));
    }
    return data.choices[0].message.content;
  }
}

function checkAndSetupAlarm() {
  chrome.storage.local.get(['tweetQueue', 'isRunning', 'onboardingStrategy', 'postDeliveryMode'], (result) => {
    if (!result.isRunning) {
       chrome.alarms.clear("postTweetAlarm");
       return;
    }
    if (!canAutoPublish(result)) {
      chrome.alarms.clear("postTweetAlarm");
      chrome.storage.local.set({ nextPostTime: '先审后发：等待人工确认' });
      return;
    }
    const queue = normalizeDraftQueue(result.tweetQueue);
    if (getPostDeliveryMode(result) === POST_DELIVERY_MODE_X_SCHEDULE) {
      chrome.alarms.clear("postTweetAlarm");
      if (queue.length > 0) {
        chrome.storage.local.set({ nextPostTime: `写入 X 定时发布：待处理 ${queue.length} 条` });
        scheduleNativeQueue();
      } else {
        chrome.storage.local.set({ nextPostTime: '等待内容队列生成' });
      }
      return;
    }
    if (queue.length > 0) {
      chrome.alarms.get("postTweetAlarm", (alarm) => {
        if (!alarm) {
          scheduleNextPost();
        }
      });
    } else {
      chrome.alarms.clear("postTweetAlarm");
      chrome.storage.local.set({ nextPostTime: '等待内容队列生成' });
    }
  });
}

// ==========================================
// Post Scheduling
// ==========================================
function parseTimeSlots(slotsStr) {
  if (!slotsStr) return [{ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 }];
  return slotsStr.split(',').map(s => {
    const parts = s.trim().split('-');
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    return { start: isNaN(start) ? 0 : start, end: isNaN(end) ? 24 : end };
  }).filter(s => s.start < s.end);
}

function scheduleNextPost() {
  const now = new Date();
  chrome.storage.local.get([
    'postsToday', 'lastPostDate', 'isAutoPaused',
    'onboardingStrategy', 'automationStartTime', 'sessionPostCount'
  ], (res) => {
    if (res.isAutoPaused) {
      addLog('info', '自动操作已暂停，跳过发推调度');
      return;
    }
    
    const mode = res.onboardingStrategy?.automationMode || 'autoEngage';
    
    // Auto-Reply mode doesn't post at all
    if (mode === 'autoReply') {
      chrome.alarms.clear("postTweetAlarm");
      chrome.storage.local.set({ nextPostTime: '当前模式仅互动，暂停自动发帖' });
      return;
    }

    const pCount = res.sessionPostCount || 0;
    let delayMs;
    
    // Immediate First Action
    if (pCount === 0) {
      delayMs = (Math.floor(Math.random() * 3) + 1) * 60000; // 1-3 mins
    } else {
      // Dynamic intervals based on mode pacing targets (per 10h)
      // autoEngage: 10-15 per 10h -> 40-60 mins
      // autoPost: 15-20 per 10h -> 30-40 mins
      let minMins = 30;
      let maxMins = 40;
      if (mode === 'autoEngage') {
        minMins = 40;
        maxMins = 60;
      }
      
      const randomMins = Math.floor(Math.random() * (maxMins - minMins + 1)) + minMins;
      delayMs = randomMins * 60000;
    }
    
    const targetTimeMs = now.getTime() + delayMs;
    const targetTime = new Date(targetTimeMs);
    setAlarmAtDate(targetTime, `全自动发帖: 计划 ${targetTime.toLocaleTimeString()} 发推`);
  });
}

function scheduleInterval(now, config) {
  const interval = (config.postInterval || 60) * 60000;
  const targetTime = new Date(now.getTime() + interval);
  const targetHour = targetTime.getHours();
  const targetMin = targetTime.getMinutes();
  const addDays = targetTime.getDate() !== now.getDate() ? 1 : 0;
  setAlarm(targetHour, targetMin, addDays);
  addLog('info', `固定间隔模式：计划 ${targetTime.toLocaleString()} 发推`);
}

function scheduleSmart(now, config, postsToday, postsPerDay) {
  const slots = parseTimeSlots(config.smartTimeSlots);
  if (slots.length === 0) {
    addLog('warn', '智能时段配置为空，使用默认时段');
    slots.push({ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 });
  }
  
  const hour = now.getHours();
  let targetSlot = null;
  let addDays = 0;
  
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (hour < slot.start) {
      // 当前时间在该时段开始之前
      targetSlot = slot;
      break;
    } else if (hour >= slot.start && hour < slot.end) {
      // 当前时间在该时段内，跳到下一个时段
      if (i + 1 < slots.length) {
        targetSlot = slots[i + 1];
      } else {
        targetSlot = slots[0];
        addDays = 1;
      }
      break;
    }
  }
  
  // 当前时间在所有时段之后
  if (!targetSlot) {
    targetSlot = slots[0];
    addDays = 1;
  }
  
  const range = Math.max(1, targetSlot.end - targetSlot.start);
  const targetHour = targetSlot.start + Math.floor(Math.random() * range);
  const targetMin = Math.floor(Math.random() * 60);
  
  setAlarm(targetHour, targetMin, addDays);
  const targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, targetHour, targetMin);
  addLog('info', `智能分布模式：计划 ${targetTime.toLocaleString()} 发推（今日 ${postsToday}/${postsPerDay}）`);
}

function scheduleForTomorrow(now, config) {
  // 达到每日上限后，统一安排到次日第一个时段的随机时间点
  const slots = parseTimeSlots(config.smartTimeSlots);
  const firstSlot = slots[0] || { start: 8, end: 10 };
  const range = Math.max(1, firstSlot.end - firstSlot.start);
  const targetHour = firstSlot.start + Math.floor(Math.random() * range);
  const targetMin = Math.floor(Math.random() * 60);
  setAlarm(targetHour, targetMin, 1);
}

function setAlarm(targetHour, targetMin, addDays) {
  const now = new Date();
  let targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, targetHour, targetMin, 0, 0);
  
  if (targetTime.getTime() <= now.getTime()) {
      targetTime = new Date(now.getTime() + 5 * 60000); // fallback 5 mins later
  }

  setAlarmAtDate(targetTime);
}

function setAlarmAtDate(targetTime, reason = '已安排下一次发推') {
  chrome.alarms.clear("postTweetAlarm", () => {
    chrome.alarms.create("postTweetAlarm", { when: targetTime.getTime() });
  });
  addLog('info', `${reason}: ${targetTime.toLocaleString()}`);
  chrome.storage.local.set({ nextPostTime: targetTime.toLocaleString() }, () => {
      chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
  });
}

function chooseMinute(start = 0) {
  const min = Math.max(0, Math.min(59, Number(start) || 0));
  return min + Math.floor(Math.random() * Math.max(1, 60 - min));
}

function buildSmartSchedulePlan(count, config = {}) {
  const now = new Date();
  const slots = parseTimeSlots(config.smartTimeSlots);
  if (slots.length === 0) {
    slots.push({ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 });
  }
  const postsPerDay = Math.max(1, Number(config.postsPerDay) || 20);
  const plan = [];
  let dayOffset = 0;

  while (plan.length < count && dayOffset < 21) {
    const baseDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 0, 0, 0, 0);
    const availableSlots = slots
      .map((slot) => {
        const range = Math.max(1, slot.end - slot.start);
        const hour = slot.start + Math.floor(Math.random() * range);
        const minute = chooseMinute();
        return new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate(), hour, minute, 0, 0);
      })
      .filter(date => date.getTime() > now.getTime() + 5 * 60000)
      .sort((a, b) => a.getTime() - b.getTime());

    availableSlots.slice(0, postsPerDay).forEach(date => {
      if (plan.length < count) plan.push(date.getTime());
    });
    dayOffset++;
  }

  return plan;
}

function buildIntervalSchedulePlan(count, config = {}) {
  const interval = Math.max(15, Number(config.postInterval) || 60) * 60000;
  const firstAt = Date.now() + Math.max(interval, 10 * 60000);
  return Array.from({ length: count }, (_, index) => firstAt + index * interval);
}

function buildPostSchedulePlan(count, config = {}) {
  if (count <= 0) return [];
  return (config.postScheduleMode || 'smart') === 'interval'
    ? buildIntervalSchedulePlan(count, config)
    : buildSmartSchedulePlan(count, config);
}

function ensureNativeScheduleTimes(queue = [], config = {}) {
  const normalized = normalizeDraftQueue(queue);
  const missing = normalized.filter(item => !item.scheduledAt || item.nativeScheduleStatus === 'failed');
  const plan = buildPostSchedulePlan(missing.length, config);
  let planIndex = 0;

  return normalized.map((item) => {
    if (item.nativeScheduleStatus === 'scheduled') return item;
    if (item.scheduledAt && item.nativeScheduleStatus !== 'failed') return item;
    return {
      ...item,
      scheduledAt: plan[planIndex++] || Date.now() + (planIndex + 1) * 30 * 60000,
      nativeScheduleStatus: 'queued'
    };
  });
}

function formatScheduleTime(ts) {
  const date = new Date(Number(ts));
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '未设置';
}

function scheduleNativeQueue() {
  chrome.storage.local.get([
    'tweetQueue', 'pendingPost', 'isRunning', 'isAutoPaused', 'onboardingStrategy',
    'postDeliveryMode', 'postsPerDay', 'postScheduleMode', 'smartTimeSlots', 'postInterval'
  ], (result) => {
    if (!result.isRunning || result.isAutoPaused || !canAutoPublish(result)) return;
    if (getPostDeliveryMode(result) !== POST_DELIVERY_MODE_X_SCHEDULE) return;
    if (result.pendingPost) {
      addLog('info', '已有待处理发布任务，等待当前 X 定时发布完成');
      return;
    }

    let queue = ensureNativeScheduleTimes(result.tweetQueue, result);
    const nextTweet = queue.find(item => !['scheduled', 'failed'].includes(item.nativeScheduleStatus));
    if (!nextTweet) {
      const failedCount = queue.filter(item => item.nativeScheduleStatus === 'failed').length;
      chrome.storage.local.set({
        tweetQueue: queue,
        nextPostTime: failedCount > 0 ? `X 定时发布有 ${failedCount} 条失败，等待人工处理` : 'X 定时发布已全部写入'
      });
      return;
    }

    queue = updateQueueItem(queue, nextTweet.id, nextTweet.text, { nativeScheduleStatus: 'scheduling' });
    chrome.storage.local.set({
      tweetQueue: queue,
      pendingPost: nextTweet.text,
      pendingPostId: nextTweet.id || null,
      pendingPostSource: POST_DELIVERY_MODE_X_SCHEDULE,
      pendingScheduledAt: nextTweet.scheduledAt,
      nextPostTime: `正在写入 X 定时发布：${formatScheduleTime(nextTweet.scheduledAt)}`
    }, () => {
      addLog('info', `准备写入 X 原生定时发布：${formatScheduleTime(nextTweet.scheduledAt)}`);
      triggerPostInTab();
      chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
    });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "postTweetAlarm") {
    addLog('info', '定时器触发，准备执行发推');
    executeNextPost();
  } else if (alarm.name === "autoShutdownAlarm") {
    addLog('warn', '已达到单次最大连续工作时长 (10小时)，为保护账号安全，机器人已自动停止');
    chrome.storage.local.set({ isRunning: false });
  }
});

async function executeNextPost() {
  const result = await getStorage(['tweetQueue', 'pendingPost', 'postsToday', 'lastPostDate', 'postsPerDay', 'isAutoPaused', 'onboardingStrategy', 'postDeliveryMode']);
  if (!canAutoPublish(result)) {
    addLog('info', '当前为先审后发/影子模式，跳过自动发推执行');
    chrome.alarms.clear("postTweetAlarm");
    await setStorage({ nextPostTime: '先审后发：等待人工确认' });
    return;
  }
  if (getPostDeliveryMode(result) === POST_DELIVERY_MODE_X_SCHEDULE) {
    addLog('info', '当前为 X 原生定时发布模式，改为写入 X 定时器');
    chrome.alarms.clear("postTweetAlarm");
    scheduleNativeQueue();
    return;
  }
  if (result.isAutoPaused) {
    addLog('info', '自动操作已暂停，跳过本次发推执行');
    return;
  }
  let queue = normalizeDraftQueue(result.tweetQueue);
  if (queue.length === 0) {
    checkAndSetupAlarm();
    return;
  }
  
  if (result.pendingPost) {
     triggerPostInTab();
     return;
  }
  
  const postsPerDay = result.postsPerDay || 20;
  const todayStr = new Date().toDateString();
  const postsToday = result.lastPostDate === todayStr ? (result.postsToday || 0) : 0;
  if (postsToday >= postsPerDay) {
    addLog('info', `今日已达发推上限 ${postsToday}/${postsPerDay}，跳过本次执行`);
    scheduleForTomorrow(new Date(), result);
    return;
  }

  const nextTweet = queue[0];
  const postText = formatTweetForX(nextTweet.text);
  if (!postText) {
    addLog('warn', '队列首条推文为空，已移除并重新调度');
    await setStorage({ tweetQueue: queue.slice(1) });
    checkAndSetupAlarm();
    return;
  }
  addLog('info', `执行发推，当前队列 ${queue.length} 条，发送成功后剩余 ${Math.max(queue.length - 1, 0)} 条`);
  
  await setStorage({ 
    pendingPost: postText,
    pendingPostId: nextTweet.id || null,
    pendingPostSource: 'queue'
  });
  triggerPostInTab();
  chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
}

function getIntentPostUrl(text) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text || '')}`;
}

function triggerPostInTab() {
  chrome.storage.local.get(['pendingPost'], (result) => {
    const intentUrl = getIntentPostUrl(result.pendingPost || '');
    chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
      if (tabs.length > 0) {
        let tab = tabs.find(t => t.active) || tabs[0];
        addLog('info', `向标签页 ${tab.id} 发送发推指令`);
        chrome.tabs.sendMessage(tab.id, { action: "postNewTweet" }, () => {
          if (chrome.runtime.lastError) {
            addLog('warn', `标签页未响应内容脚本，改开干净 intent/post 标签页: ${chrome.runtime.lastError.message}`);
            chrome.tabs.create({ url: intentUrl, active: true });
          }
        });
      } else {
        addLog('info', '未找到 X.com 标签页，新建 intent/post 标签页');
        chrome.tabs.create({ url: intentUrl });
      }
    });
  });
}

function handlePostCompleted(source) {
  chrome.storage.local.get(['postsToday', 'lastPostDate', 'tweetQueue', 'pendingPost', 'pendingPostId', 'nativeScheduledCount', 'sessionPostCount'], (result) => {
    const updates = {
      pendingPost: null,
      pendingPostId: null,
      pendingPostSource: null,
      pendingScheduledAt: null,
      isAutoPaused: false,
      pauseReason: ''
    };

    const finalize = () => {
      chrome.storage.local.set(updates, () => {
        chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingScheduledAt']);
        if (source === POST_DELIVERY_MODE_X_SCHEDULE) {
          setTimeout(scheduleNativeQueue, 2500);
        } else {
          checkAndSetupAlarm();
        }
        chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
      });
    };

    if (source === 'queue') {
      const now = new Date();
      const todayStr = now.toDateString();
      let postsToday = result.postsToday || 0;
      if (result.lastPostDate !== todayStr) postsToday = 0;
      updates.postsToday = postsToday + 1;
      updates.lastPostDate = todayStr;
      updates.sessionPostCount = (result.sessionPostCount || 0) + 1;
      const queue = normalizeDraftQueue(result.tweetQueue);
      updates.tweetQueue = removeCompletedQueueItem(queue, result.pendingPostId, result.pendingPost);
      addLog('success', `队列推文发送成功，今日已发 ${updates.postsToday} 条`);
      finalize();
    } else if (source === POST_DELIVERY_MODE_X_SCHEDULE) {
      const queue = normalizeDraftQueue(result.tweetQueue);
      updates.tweetQueue = removeCompletedQueueItem(queue, result.pendingPostId, result.pendingPost);
      updates.nativeScheduledCount = (Number(result.nativeScheduledCount) || 0) + 1;
      addLog('success', `X 原生定时发布写入成功，剩余 ${updates.tweetQueue.length} 条待处理`);
      finalize();
    } else {
      addLog('success', '测试推文发送成功');
      finalize();
    }
  });
}

async function generateAIResponse(tweetContent, replyContext = {}) {
  try {
    const config = await getStorage(['apiKey', 'apiProvider', 'aiModel', 'promptTemplate', 'leadTarget', 'aiPersona', 'agentMemory', 'onboardingStrategy', 'accountBio', 'styleTrainingData', 'engineLanguage', 'feedbackLoopData', 'replyStrategy', 'customPromptGlobal']);
    const errors = getConfigErrors(config);
    if (errors.length > 0) {
      addLog('warn', `配置不完整，无法生成回复：${errors.join('、')}`);
      throw new Error(errors.join('；'));
    }
    
    const playbook = selectGrowthPlaybook({
        onboardingStrategy: config.onboardingStrategy,
        persona: config.aiPersona,
        agentMemory: config.agentMemory,
        accountBio: config.accountBio,
        leadTarget: config.leadTarget
      });
      
      let styleConstraint = '';
      if (config.styleTrainingData) {
        styleConstraint = `\n【严格文风约束】：必须100%模仿以下参考素材的断句节奏、用词习惯（如特定语气词、emoji）、情绪饱和度以及排版结构。请提取并在输出中重现这种独特的个人风格，杜绝任何AI感。\n<文风参考>\n${config.styleTrainingData}\n</文风参考>\n\n`;
      }
      
      let feedbackConstraint = '';
      if (config.feedbackLoopData && config.feedbackLoopData.length > 0) {
        const feedbackExamples = config.feedbackLoopData.map((fb, idx) => `[示例 ${idx+1}]\n- 你的原输出 (错误示范): ${fb.original}\n- 用户的修改版 (正确示范): ${fb.modified}`).join('\n\n');
        feedbackConstraint = `\n【自我进化避坑指南】：请学习用户对你以往回复的修改思路，严禁重犯之前的AI味错误！\n<避坑案例>\n${feedbackExamples}\n</避坑案例>\n`;
      }
      
      let langConstraint = '';
      const origLang = replyContext.originalLanguage || '';
      if (origLang) {
        // X's translation is active — we know the real original language
        langConstraint = `必须使用「${origLang}」进行回复（原推文已被 X 平台翻译，原始语言是 ${origLang}）。If the original language is English, you MUST reply in English.`;
      } else if (config.engineLanguage === 'en') langConstraint = '必须使用英文输出';
      else if (config.engineLanguage === 'ja') langConstraint = '必须使用日语输出 (Output in Japanese)';
      else if (config.engineLanguage === 'es') langConstraint = '必须使用西班牙语输出 (Output in Spanish)';
      else if (config.engineLanguage === 'id') langConstraint = '必须使用印尼语输出 (Output in Indonesian)';
      else if (config.engineLanguage === 'zh') langConstraint = '必须使用中文输出';
      else langConstraint = '必须自动识别并使用原推文相同的语言输出';
      
      let currentReplyStrategy = config.replyStrategy || '极简流：精辟吐槽 / 玩梗';
      let strategyInstruction = '';
      if (currentReplyStrategy.includes('杠精')) {
        strategyInstruction = '策略：1. 找出原推文逻辑最薄弱的一点进行精准打击；2. 抛出一个极其反直觉的犀利观点；3. 多用反问句引发争议和辩论。要求：一针见血，带点嘲讽感但不做人身攻击，字数控制在40字以内。';
      } else if (currentReplyStrategy.includes('专业')) {
        strategyInstruction = '策略：1. 直接基于推文内容进行客观的专业分析，无论赞同还是反对都必须一针见血；2. 【关键】必须要补充一条极其硬核的冷知识、底层逻辑或具体数据来作为支撑。要求：不卑不亢，展现极高的专业素养和信息密度，字数控制在80字以内。';
      } else if (currentReplyStrategy.includes('极简')) {
        strategyInstruction = '策略：1. 用一句极其精辟的吐槽、神级比喻或者互联网黑话来总结原推文；2. 绝不要分析，只要情绪价值和幽默感。要求：短平快，字数绝对不能超过15个字。';
      } else if (currentReplyStrategy.includes('自定义')) {
        strategyInstruction = '【用户完全自定义策略/System Prompt】：' + (config.customPromptGlobal || '请按照你的判断提供高质量回复。');
      } else {
        strategyInstruction = '要求：使用“' + currentReplyStrategy + '”的策略，为这条推文写一条高质量的破冰回复。口语化，不要有AI味。';
      }

      const personaContext = `\n【你的账号人设与特征】：${config.aiPersona?.characteristics || '未填写'}\n【你的目标受众画像】：${config.aiPersona?.targetUsers || '未填写'}\n【你的核心引流目标】：${config.aiPersona?.goals || config.leadTarget}\n${formatLeadAsset(config.onboardingStrategy)}\n${formatReplyOpportunity(replyContext.replyOpportunity)}\n【你的长期记忆】\n${formatAgentMemory(config.agentMemory)}\n${formatGrowthPlaybook(playbook)}${styleConstraint}${feedbackConstraint}\n【你必须遵守的回复风格与策略指令】：${strategyInstruction}\n请严格符合上述人设、受众画像、文风约束、内容模板和互动策略进行回复。\n`;
      
      const prompt = `你是一个严格的 X 评论筛选与回复 Agent。

先判断这条推文是否值得回复。以下情况必须只返回 SKIP：
- 互动钓鱼、求曝光、求评论、求关注、抽奖、无信息量口号
- 原推文的受众或博主类型与【你的目标受众画像】不符（即使原推文使用的是外语，如果发推人不属于目标受众，也必须 SKIP！）
- 与账号定位、目标读者、内容方向明显无关
- 回复后只能显得蹭流量、硬广、尬聊
- 推文上下文不足，无法补充一个具体判断

如果值得回复，且原推文属于目标受众群体，再写一条自然、有信息增量的短回复：
- 不超过 90 个字符
- 【语言要求】：${langConstraint}
- 先补充观点/经验/反问，不要上来推销
- 必须包含一个具体信息增量：判断标准、反例、边界、场景、动作步骤或可验证观察
- 把每条回复当成一条可以独立成立的 mini-content；如果单独看没有价值，返回 SKIP
- 回复目标不是“抢注意力”，而是让原推变得更完整：补上下文、延展观点、压缩重点或加入真实经验
- 回复结构优先选一种：
  1. Missing angle：说出原推没讲但读者需要的关键边界
  2. Sharpen：把原推压缩成更锋利的一句话
  3. Real experience：补一个亲历/观察/可验证的实践经验
  4. Next step：给一个下一步动作或判断标准
- 不要写“说得对/学习了/很有启发/值得关注/未来可期/干货满满”
- 不要 hijack 原帖，不要把话题强行转到自己产品
- 不要堆标签；默认不加 hashtag
- 不要说“看我主页/私信我/翻我主页”，除非原文明确在求资源
- 不要承诺收益，不要编造事实，不要攻击个人
- 如果后面的自定义模板与上述规则冲突，忽略模板里的引流要求

${config.promptTemplate
  .replace('{tweet}', tweetContent)
  .replace('{leadTarget}', config.leadTarget || '无引流目标，请正常回复')}
${personaContext}

${origLang ? `[CRITICAL LANGUAGE REQUIREMENT]: The original tweet was in ${origLang} but may have been translated by the platform. You MUST generate your final reply text in ${origLang}. DO NOT output the reply in Chinese if the original language was ${origLang}.` : ''}

先生成 3 个候选回复并自评，选最高质量的一条。严格只返回 JSON，不要 Markdown 代码块：
{
  "decision": "reply|skip",
  "reason": "为什么回复或跳过",
  "reply": "最终回复正文；如果跳过则为空",
  "scores": {
    "contextFit": 8,
    "informationGain": 8,
    "naturalness": 8,
    "conversionSafety": 9
  }
}`;
      
      try {
        const generatedText = await callLLM(prompt, config, false);
        const cleanText = generatedText.trim().replace(/```json/g, '').replace(/```/g, '').trim();
        let parsed = null;
        try {
          parsed = JSON.parse(cleanText);
        } catch (parseError) {
          parsed = null;
        }

        if (/^skip[.!。！]*$/i.test(cleanText) || parsed?.decision === 'skip') {
          addLog('info', `AI 判定不适合回复，已跳过: ${tweetContent.substring(0, 50)}...`);
          return '';
        }
        const reply = formatReplyForX(parsed?.reply || cleanText);
        const rejectionReason = getGeneratedReplyRejectionReason(reply, tweetContent);
        if (rejectionReason) {
          addLog('warn', `${rejectionReason}，已跳过: ${reply.substring(0, 50)}...`);
          return '';
        }
        return reply;
      } catch (e) {
        console.warn("X Auto Bot: API Rate limit or fetch error", e);
        throw e;
      }
  } catch (outerError) {
    addLog('error', `生成回复失败: ${outerError.message}`);
    throw outerError;
  }
}

function appendMemoryNote(memory = {}, key, note, maxLength = 2400) {
  const normalized = normalizeAgentMemory(memory);
  const cleanNote = memoryValueToText(note).trim();
  if (!cleanNote) return normalized;
  const current = memoryValueToText(normalized[key]).trim();
  if (current.includes(cleanNote)) return normalized;
  const next = current ? `${current}\n${cleanNote}` : cleanNote;
  normalized[key] = next.length > maxLength ? next.slice(next.length - maxLength) : next;
  return normalized;
}

function buildLocalChatMemoryPatch(message) {
  return {
    sourceInputs: `用户投喂的新素材/想法：${message}`,
    weeklyReviewSignals: `待复盘信号：用户在 Agent 对话中新增了一个偏好或素材，需要判断是否进入选题池。`
  };
}

function extractXHandlesFromText(text = '') {
  const handles = [];
  const source = memoryValueToText(text);
  const patterns = [
    /(?:^|[\s（(])@([A-Za-z0-9_]{1,15})\b/g,
    /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|\b)/gi
  ];
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const handle = match[1];
      if (handle && !['home', 'search', 'explore', 'i', 'settings'].includes(handle.toLowerCase())) {
        handles.push(handle);
      }
    }
  });
  return [...new Set(handles.map(handle => handle.replace(/^@/, '')))];
}

function buildChatEntryAnalysis({ message = '', handles = [], parsed = {}, localOnly = false } = {}) {
  const cleanMessage = memoryValueToText(message).trim();
  const summary = memoryValueToText(parsed.inputSummary || parsed.summary).trim();
  const insights = Array.isArray(parsed.insights) ? parsed.insights.filter(Boolean).slice(0, 6) : [];
  const actions = Array.isArray(parsed.actions) ? parsed.actions.filter(Boolean).slice(0, 6) : [];
  const memoryWrites = Object.entries(parsed.memoryPatch || {})
    .filter(([, value]) => memoryValueToText(value).trim())
    .map(([key, value]) => `${AGENT_MEMORY_LABELS[key] || key}: ${memoryValueToText(value).trim()}`)
    .slice(0, 8);
  const accountLines = handles.map(handle => `@${handle}`);

  return {
    title: handles.length > 0 ? 'KOL/账号解析' : '输入解析',
    summary: summary || (handles.length > 0
      ? `识别到 ${accountLines.join('、')}，已作为可观察/互动的 KOL 线索。`
      : `这条输入已进入素材池：${cleanMessage.slice(0, 80)}`),
    accounts: accountLines,
    insights: insights.length > 0 ? insights : (handles.length > 0
      ? ['后续应观察该账号的高互动内容结构、开头钩子、评论区互动方式和可复用选题。']
      : ['后续可判断它适合沉淀为选题、表达规则、评论策略或复盘信号。']),
    actions: actions.length > 0 ? actions : (handles.length > 0
      ? ['写入长期互动对象', '加入素材来源', '后续回复/搜索优先参考同类 KOL']
      : ['写入素材来源', '等待后续复盘时提炼为内容策略']),
    memoryWrites,
    localOnly
  };
}

function buildKolMemoryPatch(handles = []) {
  if (!handles.length) return {};
  const handleLines = handles.map(handle => handle.replace(/^@/, '')).join('\n');
  const display = handles.map(handle => `@${handle.replace(/^@/, '')}`).join('、');
  return {
    interactionTargets: handleLines,
    sourceInputs: `用户新增 KOL/对标账号：${display}`,
    weeklyReviewSignals: `观察 ${display} 的高互动帖：Hook、正文结构、评论区回复方式、可复用观点和受众重叠度。`
  };
}

function mergeChatMemory(baseMemory = {}, patch = {}) {
  let memory = normalizeAgentMemory(baseMemory);
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (DEFAULT_AGENT_MEMORY[key] === undefined) return;
    memory = appendMemoryNote(memory, key, value);
  });
  return memory;
}

async function handleAgentChat(message) {
  const userMessage = memoryValueToText(message).trim();
  if (!userMessage) throw new Error('消息为空');

  return new Promise((resolve, reject) => {
    chrome.storage.local.get([
      'apiKey',
      'apiProvider',
      'aiModel',
      'leadTarget',
      'agentMemory',
      'onboardingStrategy',
      'aiPersona',
      'accountBio',
      'agentChatMessages'
    ], async (config) => {
      const messages = Array.isArray(config.agentChatMessages) ? config.agentChatMessages.slice(-60) : [];
      const detectedHandles = extractXHandlesFromText(userMessage);
      const baseHandlePatch = buildKolMemoryPatch(detectedHandles);
      const userEntry = {
        role: 'user',
        content: userMessage,
        time: Date.now(),
        analysis: buildChatEntryAnalysis({ message: userMessage, handles: detectedHandles })
      };
      const errors = getAIConnectionErrors(config);

      if (errors.length > 0) {
        const localPatch = buildLocalChatMemoryPatch(userMessage);
        const memoryPatch = {
          ...localPatch,
          ...baseHandlePatch,
          sourceInputs: [
            memoryValueToText(localPatch.sourceInputs).trim(),
            memoryValueToText(baseHandlePatch.sourceInputs).trim()
          ].filter(Boolean).join('\n'),
          weeklyReviewSignals: [
            memoryValueToText(localPatch.weeklyReviewSignals).trim(),
            memoryValueToText(baseHandlePatch.weeklyReviewSignals).trim()
          ].filter(Boolean).join('\n')
        };
        const agentMemory = mergeChatMemory(config.agentMemory, memoryPatch);
        const localAnalysis = buildChatEntryAnalysis({
          message: userMessage,
          handles: detectedHandles,
          parsed: { memoryPatch },
          localOnly: true
        });
        const assistantEntry = {
          role: 'assistant',
          content: detectedHandles.length > 0
            ? `我先把 ${detectedHandles.map(handle => `@${handle}`).join('、')} 记录为 KOL/对标账号。\n\n当前还缺少 API Key 或模型配置，所以暂时只能做基础归档。配置好模型后，我会继续拆解它的内容优势、表达风格、互动方式和可学习点。`
            : `我先把这条输入记录进素材池。\n\n当前还缺少 API Key 或模型配置，所以我不能做深度拆解。配置好模型后，我会把这类输入进一步转成：选题角度、表达规则、评论策略或可发布内容。`,
          analysis: localAnalysis,
          time: Date.now()
        };
        const nextMessages = [...messages, userEntry, assistantEntry].slice(-60);
        chrome.storage.local.set({ agentChatMessages: nextMessages, agentMemory }, () => {
          addLog('info', 'Agent 对话已本地记录到长期记忆');
          resolve({ messages: nextMessages, agentMemory, memoryUpdated: true });
        });
        return;
      }

      const playbook = selectGrowthPlaybook({
        onboardingStrategy: config.onboardingStrategy,
        persona: config.aiPersona,
        agentMemory: config.agentMemory,
        accountBio: config.accountBio,
        leadTarget: config.leadTarget
      });

      const recentContext = messages.slice(-12)
        .map(item => `${item.role === 'user' ? '用户' : 'Agent'}：${item.content}`)
        .join('\n');

      const prompt = `你是一个专用的 X 发声 Agent 策略编辑器，不是通用聊天机器人。
用户会把好帖子、想法、复盘、偏好、产品方向或评论引流资产发给你。

你的任务：
1. 判断这条输入应该沉淀为：选题角度、核心观点、语气规则、读者痛点、评论策略、风险边界、素材来源或复盘信号。
2. 如果输入里包含 X/KOL 账号，必须拆解这个账号可能值得学习的优势、表达风格、内容结构、评论互动方式，并把账号写入 interactionTargets 和 sourceInputs。
3. 用简短但有判断力的方式回复用户，告诉他这条输入可以如何用于 X 发声。
4. 必须提炼 memoryPatch，写入长期记忆。不要覆盖原记忆，只提供新增内容。
5. 如适合，给一个 X 原生表达样例，但不要承诺收益，不要编造事实，不要变成公众号腔。

账号画像：
- 目标用户：${config.aiPersona?.targetUsers || '未填写'}
- 发文特征：${config.aiPersona?.characteristics || '未填写'}
- 核心目标：${config.aiPersona?.goals || config.leadTarget || '未填写'}
${formatLeadAsset(config.onboardingStrategy)}

当前长期记忆：
${formatAgentMemory(config.agentMemory)}

当前增长模板：
${formatGrowthPlaybook(playbook)}

最近对话：
${recentContext || '暂无'}

识别到的 X/KOL 账号：
${detectedHandles.length > 0 ? detectedHandles.map(handle => `@${handle}`).join('\n') : '无'}

用户最新输入：
${userMessage}

只返回 JSON，不要 Markdown 代码块：
{
  "reply": "给用户看的回复，必须明确说明这不是泛聊，而是如何更新 X 发声策略",
  "inputSummary": "一句话总结这条输入的用途",
  "insights": ["优势/风格/结构/互动方式/可学习点，最多6条"],
  "actions": ["下一步如何用到账号运营，最多6条"],
  "memoryPatch": {
    "identity": "",
    "marketPosition": "",
    "audienceSegments": "",
    "audiencePains": "",
    "contentPillars": "",
    "contentAngles": "",
    "proofAssets": "",
    "personalStories": "",
    "coreOpinions": "",
    "boundaries": "",
    "voiceRules": "",
    "bannedClaims": "",
    "interactionTargets": "",
    "replyStrategy": "",
    "sourceInputs": "",
    "weeklyReviewSignals": ""
  },
  "suggestedTweet": "如果适合，给一条带换行的候选推文；不适合则为空"
}`;

      try {
        const generatedText = await callLLM(prompt, config, true);
        const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
        let parsed;
        try {
          parsed = JSON.parse(cleanJsonStr);
        } catch (parseError) {
          parsed = {
            reply: generatedText.trim(),
            memoryPatch: buildLocalChatMemoryPatch(userMessage),
            suggestedTweet: ''
          };
        }

        const memoryPatch = {
          ...(parsed.memoryPatch || {}),
          ...baseHandlePatch,
          interactionTargets: [
            memoryValueToText(parsed.memoryPatch?.interactionTargets).trim(),
            memoryValueToText(baseHandlePatch.interactionTargets).trim()
          ].filter(Boolean).join('\n'),
          sourceInputs: [
            memoryValueToText(parsed.memoryPatch?.sourceInputs).trim(),
            memoryValueToText(baseHandlePatch.sourceInputs).trim()
          ].filter(Boolean).join('\n'),
          weeklyReviewSignals: [
            memoryValueToText(parsed.memoryPatch?.weeklyReviewSignals).trim(),
            memoryValueToText(baseHandlePatch.weeklyReviewSignals).trim()
          ].filter(Boolean).join('\n')
        };
        const agentMemory = mergeChatMemory(config.agentMemory, memoryPatch);
        const suggestedTweet = formatTweetForX(parsed.suggestedTweet || '');
        const replyText = [
          memoryValueToText(parsed.reply).trim() || '我已把这条输入转成 X Agent 的记忆更新。',
          suggestedTweet ? `\n可测试推文：\n${suggestedTweet}` : ''
        ].filter(Boolean).join('\n');
        const assistantEntry = {
          role: 'assistant',
          content: replyText,
          analysis: buildChatEntryAnalysis({
            message: userMessage,
            handles: detectedHandles,
            parsed: { ...parsed, memoryPatch }
          }),
          time: Date.now()
        };
        const nextMessages = [...messages, userEntry, assistantEntry].slice(-60);

        chrome.storage.local.set({ agentChatMessages: nextMessages, agentMemory }, () => {
          addLog('success', 'Agent 对话已更新长期记忆');
          resolve({ messages: nextMessages, agentMemory, memoryUpdated: true });
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function analyzeAccountPersona(bio) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'agentMemory'], async (config) => {
    const errors = getAIConnectionErrors(config);
    if (errors.length > 0) {
      addLog('warn', `配置不完整，无法分析账号画像：${errors.join('、')}`);
      chrome.storage.local.set({ isAnalyzingPersona: false });
      return;
    }
    addLog('info', '开始 AI 账号画像分析...');
    
    const prompt = `你是 X/Twitter 增长操盘手，请把以下账号主页信息重构成一个“个人发声 Agent 的长期记忆”。
你不是普通品牌顾问。你的判断必须围绕：
- 这个账号靠什么被关注
- 哪类内容负责涨粉、建信任、转化、互动截流、人设加深
- 目标用户为什么会停留、转发、评论、收藏
- 账号应该避免哪些会降低可信度或触发风险的表达

账号简介：
${bio || '暂无'}

产品目标用户是：想在 X 上建立影响力的创始人、独立开发者、出海从业者、AI 工具人、投资/研究人员；以及有想法但输出不稳定、会刷 X 但不会把输入转化为观点和内容、强烈想做 KOL 的人。

请基于账号简介推断，但不要编造具体履历、收益、身份头衔或不可验证案例。输出要可直接填入设置页。
写法要像给 X 账号操盘用的作战记忆，不要像简历总结或咨询报告。

不要包含任何多余文字，严格以如下 JSON 对象格式返回：
{
  "targetUsers": "...",
  "characteristics": "...",
  "goals": "...",
  "memory": {
    "identity": "...",
    "marketPosition": "...",
    "audienceSegments": "...",
    "audiencePains": "...",
    "contentPillars": "...",
    "contentAngles": "...",
    "proofAssets": "...",
    "personalStories": "...",
    "coreOpinions": "...",
    "boundaries": "...",
    "voiceRules": "...",
    "bannedClaims": "...",
    "interactionTargets": "...",
    "discoveryKeywords": "用于 X 高级搜索的关键词，每行一个，必须匹配目标读者和内容方向",
    "replyStrategy": "...",
    "sourceInputs": "...",
    "weeklyReviewSignals": "..."
  }
}`;
    
    chrome.storage.local.set({ isAnalyzingPersona: true });
    try {
      const generatedText = await callLLM(prompt, config, true);
      // Clean up markdown code blocks if the model wrapped it
      const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJsonStr);
      const persona = {
        targetUsers: parsed.targetUsers || '科技、互联网与 AI 领域的活跃网友',
        characteristics: parsed.characteristics || '幽默、犀利、喜欢参与前沿话题讨论',
        goals: parsed.goals || '建立有趣的个人品牌，扩大社交圈与影响力'
      };
      const agentMemory = mergeAgentMemory(config.agentMemory, parsed.memory || parsed.agentMemory || {});
      
      chrome.storage.local.set({ aiPersona: persona, agentMemory, isAnalyzingPersona: false }, () => {
         addLog('success', '账号画像分析完成');
         analyzeCompetitors(persona, agentMemory);
      });
    } catch (e) {
      addLog('error', `账号画像分析失败: ${e.message}`);
      chrome.storage.local.set({ isAnalyzingPersona: false });
    }
  });
}

async function analyzeOnboardingSource(sourceInput) {
  const source = (sourceInput || '').trim();
  if (!source) throw new Error('缺少产品网站或 X 账号');

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel'], async (config) => {
      const errors = getAIConnectionErrors(config);
      if (errors.length > 0) {
        reject(new Error(errors.join('；')));
        return;
      }

      const playbookCatalog = formatAllGrowthPlaybooks();
      const prompt = `你是一个真正懂 X/Twitter 推荐机制和中文/英文科技圈传播的账号增长操盘手，不是普通市场顾问。
你的工作方式：
- 先判断账号能靠什么被转发、被评论、被收藏、被关注。
- 所有建议都要服务于 X 上的流量结构：Hook 强度、身份标签、争议/反常识、收藏价值、评论诱因、转化路径。
- 输出必须像给一个创始人或 KOL 的实战作战台，而不是咨询报告。

请根据用户输入的产品网站、X 主页、竞品网站或希望模仿的账号，设计一套“X 发声 Agent 启动向导”的初始策略。

用户输入：
${source}

目标用户是：想在 X 上建立影响力的创始人、独立开发者、出海从业者、AI 工具人、投资/研究人员；以及有想法但输出不稳定、会刷 X 但不会把输入转化为观点和内容、强烈想做 KOL 的人。

可选策略模板如下。你必须根据输入选择最匹配的 strategyArchetype，并把对应方法论写进后续策略，不要所有账号都用同一个口吻：
${playbookCatalog}

请遵守：
- 如果无法真实访问链接，不要编造具体数据、融资、客户、收益、产品功能。
- 可以基于 URL、handle、行业关键词进行保守推断。
- 输出要用于前端多选卡片确认，同时必须体现“流量操盘手”的判断。
- 不做收益承诺，不建议擦边、政治动员或刷屏。
- 不要写公众号腔、品牌公关腔、咨询报告腔。要像 X 原生表达：短、具体、有判断、有传播点。
- 生成推文时必须考虑移动端阅读：Hook 单独一行，长句每 28-36 个中文字符主动换行，逻辑块之间可以留空行。

你必须内部完成以下判断：
1. 这个账号最可能的增长飞轮是什么：观点传播、实操收藏、故事共鸣、评论截流、产品转化中的哪几个。
2. 目标用户为什么会关注：情绪价值、工具价值、行业内幕、身份认同、可复制方法中的哪几个。
3. 第一周内容矩阵：涨粉内容、建信任内容、转化内容、互动钩子内容、人设加深内容。
4. 评论引流资产：判断用户是否更适合导向产品/工具、高质量帖子/资料，还是暂不设置引流资产。
5. 自动生成 5-10 个优先互动账号：优先 KOL、创作者、创始人、研究者等个人账号；不要把项目方、品牌官方号、公司号作为主要评论对象。如果不确定，用模板给出的默认个人账号池，不要把选择责任交给用户。
6. 自动生成 X 高级搜索关键词：用于找到中文/目标语言高互动热帖，避免只依赖推荐页；关键词必须能匹配目标读者、内容方向和评论截流场景。
7. 爆款热帖风格：必须生成 3 个候选首帖，并按 6 项 1-10 分打分。

评分维度：
- hook: 开头是否能让人停住
- shareability: 是否有转发理由
- replyTrigger: 是否能引发评论
- identity: 是否强化账号身份标签
- audienceFit: 是否精准击中目标用户
- nativeX: 是否像 X 原生表达

只能返回 JSON 对象，格式如下：
{
  "sourceInput": "${source.replace(/"/g, '\\"')}",
  "strategyArchetype": "ai_product_kol|monetization_global|indie_builder|research_growth|brand_official",
  "accountUse": "brand|evangelist|curator|kol",
  "audience": ["founders", "indie"],
  "audienceCustom": "",
  "content": ["insights", "playbooks"],
  "contentCustom": "",
  "contentMode": "balanced|growth|trust",
  "leadAssetType": "product|post|none",
  "leadAssetValue": "产品/工具链接、置顶帖/资料链接或空字符串",
  "postStyle": "concise|story|contrarian",
  "preferredLanguage": "en|ja|ko|zh-CN|zh-TW",
  "targetTimezone": "Asia/Shanghai|America/Los_Angeles|America/New_York|Europe/London|Asia/Tokyo|Asia/Seoul",
  "growthGoal": "首月新增 1000 粉丝",
  "automationMode": "autoReply",
  "recommendedInteractionTargets": ["handle1", "handle2"],
  "firstTweetText": "从 firstTweetCandidates 中选择总分最高的一条",
  "firstTweetCandidates": [
    {
      "text": "候选首帖 1，必须包含移动端友好的手动换行",
      "style": "concise|story|contrarian",
      "scores": {
        "hook": 8,
        "shareability": 8,
        "replyTrigger": 7,
        "identity": 8,
        "audienceFit": 9,
        "nativeX": 9
      },
      "rationale": "为什么这条更可能在 X 上被关注"
    }
  ],
  "leadTarget": "低压、可信、不硬广的行动入口；如果 leadAssetType 是 none，就强调关注沉淀，不强行引流。",
  "persona": {
    "targetUsers": "...",
    "characteristics": "...",
    "goals": "..."
  },
  "memory": {
    "identity": "...",
    "marketPosition": "...",
    "audienceSegments": "...",
    "audiencePains": "...",
    "contentPillars": "...",
    "contentAngles": "...",
    "proofAssets": "...",
    "personalStories": "...",
    "coreOpinions": "...",
    "boundaries": "...",
    "voiceRules": "...",
    "bannedClaims": "...",
    "interactionTargets": "...",
    "discoveryKeywords": "用于 X 高级搜索的关键词，每行一个，必须匹配目标读者和内容方向",
    "replyStrategy": "...",
    "sourceInputs": "...",
    "weeklyReviewSignals": "..."
  },
  "competitorReport": "Markdown，必须包含：流量假设、第一周内容矩阵、低粉爆款钩子、互动截流策略、风险边界。"
}`;

      try {
        addLog('info', '开始启动向导来源分析');
        const generatedText = await callLLM(prompt, config, true);
        const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJsonStr);
        const analysis = normalizeOnboardingAnalysis(parsed, source);
        chrome.storage.local.set({ onboardingSourceAnalysis: analysis }, () => {
          addLog('success', '启动向导来源分析完成');
          resolve(analysis);
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeOnboardingAnalysis(parsed = {}, sourceInput = '') {
  const pick = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  const pickList = (values, allowed, fallback) => {
    const list = Array.isArray(values) ? values.filter(value => allowed.includes(value)) : [];
    return list.length > 0 ? list : fallback;
  };
  const fallbackPlaybook = selectGrowthPlaybook({
    onboardingStrategy: parsed,
    persona: parsed.persona,
    agentMemory: parsed.memory || parsed.agentMemory,
    sourceInput
  });
  const recommendedInteractionTargets = formatPersonalHandleList([
    parsed.recommendedInteractionTargets,
    parsed.interactionTargets,
    getDefaultInteractionTargets(fallbackPlaybook)
  ]);
  const memory = mergeAgentMemory(DEFAULT_AGENT_MEMORY, parsed.memory || parsed.agentMemory || {});
  memory.interactionTargets = recommendedInteractionTargets;
  if (!memoryValueToText(memory.discoveryKeywords).trim()) {
    memory.discoveryKeywords = getDefaultDiscoveryKeywords(fallbackPlaybook).join('\n');
  }

  return {
    sourceInput: parsed.sourceInput || sourceInput,
    strategyArchetype: pick(parsed.strategyArchetype, Object.keys(GROWTH_PLAYBOOKS), fallbackPlaybook.id),
    accountUse: pick(parsed.accountUse, ['brand', 'evangelist', 'curator', 'kol'], 'evangelist'),
    audience: pickList(parsed.audience, ['founders', 'indie', 'global', 'aiBuilders', 'researchers'], ['founders', 'indie']),
    audienceCustom: memoryValueToText(parsed.audienceCustom),
    content: pickList(parsed.content, ['insights', 'playbooks', 'stories', 'curation', 'softPromo'], ['insights', 'playbooks']),
    contentCustom: memoryValueToText(parsed.contentCustom),
    contentMode: pick(parsed.contentMode, ['balanced', 'growth', 'trust'], 'balanced'),
    leadAssetType: pick(parsed.leadAssetType, ['product', 'post', 'none'], 'none'),
    leadAssetValue: memoryValueToText(parsed.leadAssetValue),
    postStyle: pick(parsed.postStyle, ['concise', 'story', 'contrarian'], 'concise'),
    preferredLanguage: pick(parsed.preferredLanguage, ['en', 'ja', 'ko', 'zh-CN', 'zh-TW'], 'zh-CN'),
    targetTimezone: pick(parsed.targetTimezone, ['Asia/Shanghai', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Seoul'], 'Asia/Shanghai'),
    growthGoal: memoryValueToText(parsed.growthGoal) || '首月新增 1000 粉丝',
    automationMode: pick(parsed.automationMode, ['autoPost', 'autoReply', 'autoEngage'], 'autoEngage'),
    recommendedInteractionTargets: recommendedInteractionTargets.split('\n').filter(Boolean),
    firstTweetText: bestViralCandidate(parsed.firstTweetCandidates, memoryValueToText(parsed.firstTweetText)),
    firstTweetCandidates: Array.isArray(parsed.firstTweetCandidates) ? parsed.firstTweetCandidates : [],
    leadTarget: memoryValueToText(parsed.leadTarget),
    persona: {
      targetUsers: memoryValueToText(parsed.persona?.targetUsers),
      characteristics: memoryValueToText(parsed.persona?.characteristics),
      goals: memoryValueToText(parsed.persona?.goals)
    },
    memory,
    competitorReport: memoryValueToText(parsed.competitorReport)
  };
}

async function analyzeCompetitors(persona, agentMemoryOverride) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'agentMemory', 'onboardingStrategy', 'accountBio'], async (config) => {
    const errors = getAIConnectionErrors(config);
    if (errors.length > 0) {
      addLog('warn', `配置不完整，无法分析竞品：${errors.join('、')}`);
      chrome.storage.local.set({ isAnalyzingCompetitors: false });
      return;
    }
    addLog('info', '开始竞品对标与爆款策略分析...');
    const playbook = selectGrowthPlaybook({
      onboardingStrategy: config.onboardingStrategy,
      persona,
      agentMemory: agentMemoryOverride || config.agentMemory,
      accountBio: config.accountBio,
      leadTarget: config.leadTarget
    });
    
    const prompt = `你是 X 增长操盘手，正在为一个低粉账号设计“可执行的爆款拆解与截流计划”。

账号定位：
- 目标用户：${persona.targetUsers}
- 发文特征：${persona.characteristics}
- 核心目标：${persona.goals}
- 长期记忆：
${formatAgentMemory(agentMemoryOverride || config.agentMemory)}

${formatGrowthPlaybook(playbook)}

报告必须像操盘文档，不要像市场报告。必须包含：
1. 【流量假设】：这个账号靠什么被转发、收藏、评论、关注，各写 1 条。
2. 【对标账号类型】：列出 10 个应观察的账号类型或具体账号方向，说明他们的钩子来源、互动方式和可借鉴点。
3. 【低粉爆款框架】：给 5 个框架，每个包含 Hook 模板、正文结构、评论诱因、适合内容类型。
4. 【第一周执行矩阵】：涨粉内容、建信任内容、转化内容、互动钩子内容、人设加深内容，每类给 2 个选题。
5. 【评论截流策略】：在哪些大 V/赛道话题下面评论、评论结构怎么写、什么情况下不要评论。
6. 【风险边界】：不要承诺收益、不要编造案例、不要刷屏、不要碰擦边/政治动员。

请直接返回纯 Markdown 格式的报告内容，不要包裹在JSON里，也不要加额外的问候语。`;

    chrome.storage.local.set({ isAnalyzingCompetitors: true });
    try {
      const report = await callLLM(prompt, config, false);
      
      chrome.storage.local.set({ competitorReport: report, isAnalyzingCompetitors: false }, () => {
         addLog('success', '竞品分析报告生成完成');
         chrome.storage.local.get(['setupAutoStartRequested'], (res) => {
            if (res.setupAutoStartRequested) {
               maybeStartAgentAfterSetup(() => {});
            }
         });
         generateAutoDrafts();
      });
    } catch (e) {
      addLog('error', `竞品分析失败: ${e.message}`);
      chrome.storage.local.set({ isAnalyzingCompetitors: false });
    }
  });
}

async function generateAutoDrafts() {
  chrome.storage.local.get([
    'apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'isRunning', 'tweetQueue',
    'isGenerating', 'aiPersona', 'agentMemory', 'accountBio', 'competitorReport',
    'onboardingStrategy', 'postDeliveryMode', 'postsPerDay', 'postScheduleMode',
    'smartTimeSlots', 'postInterval'
  ], async (config) => {
    const errors = getConfigErrors(config);
    const isPersonaEmpty = !config.aiPersona || (!config.aiPersona.targetUsers && !config.aiPersona.characteristics && !config.aiPersona.goals);
    if (!config.isRunning || errors.length > 0 || config.isGenerating || isPersonaEmpty) {
      if (errors.length > 0) {
        addLog('warn', `配置不完整，无法生成内容队列：${errors.join('、')}`);
      }
      return;
    }
    const rawQueue = Array.isArray(config.tweetQueue) ? config.tweetQueue : [];
    let queue = normalizeDraftQueue(rawQueue);
    if (queueNeedsNormalization(rawQueue, queue)) {
      chrome.storage.local.set({ tweetQueue: queue });
    }
    if (queue.length >= DRAFT_TARGET_COUNT) return;
    const draftNeeded = Math.max(0, DRAFT_TARGET_COUNT - queue.length);

    addLog('info', `开始补齐 Agent 内容队列，当前 ${queue.length}/${DRAFT_TARGET_COUNT}...`);
    chrome.storage.local.set({ isGenerating: true });
    chrome.runtime.sendMessage({ action: "generationStatus", status: true }).catch(() => {});
    
    const persona = config.aiPersona;
    const memoryContext = formatAgentMemory(config.agentMemory);
    const playbook = selectGrowthPlaybook({
      onboardingStrategy: config.onboardingStrategy,
      persona,
      agentMemory: config.agentMemory,
      accountBio: config.accountBio,
      leadTarget: config.leadTarget
    });
    const playbookContext = formatGrowthPlaybook(playbook);
    const reportContext = config.competitorReport ? `\n可用的流量操盘报告如下，必须严格吸收其中的钩子、矩阵和风险边界：\n${config.competitorReport}\n` : "";
    
    const langConstraint = config.engineLanguage === 'en' ? '【语言约束】：必须使用英文 (English) 撰写内容。' :
                           config.engineLanguage === 'ja' ? '【语言约束】：必须使用日语 (Japanese) 撰写内容。' :
                           config.engineLanguage === 'es' ? '【语言约束】：必须使用西班牙语 (Spanish) 撰写内容。' :
                           config.engineLanguage === 'id' ? '【语言约束】：必须使用印尼语 (Indonesian) 撰写内容。' :
                           config.engineLanguage === 'zh' ? '【语言约束】：必须使用中文撰写内容。' : '';
    
    const prompt = `你是这个账号的 X 内容操盘手，目标不是“写得完整”，而是写出更像 X 原生内容、能被停留/转发/评论/关注的候选推文。
你要像赛道里的内容操盘手，而不是公众号编辑、品牌公关或普通 AI 助手。

账号简介：
${config.accountBio || '暂无'}

账号画像定位：
- 目标用户：${persona.targetUsers}
- 发文特征与语气：${persona.characteristics}
- 核心发文目标：${persona.goals}

长期记忆，必须优先遵守：
${memoryContext}
${playbookContext}
${formatLeadAsset(config.onboardingStrategy)}
${reportContext}
${langConstraint}

内容质量与排版硬门槛：
- 【排版与长度多样化】：大部分必须以“短帖”和“中短帖”为主（像一个真实活人的即兴发言），偶尔可以有稍长的结构化干货。拒绝清一色的长篇大论。
- 【引用并发言】：偶尔（约 10% 的比例）请使用“引用+短评”的格式。即：先用引号引用一句行业里常见的暴论、刻板印象、别人的观点或新闻，然后在下面给出你极简、犀利的短评（不需要太长）。
- 每条必须有一个明确“信息增量”：具体场景、数字、对比、反例、动作步骤、判断标准、成本/收益结构中的至少一个。
- 第一行 Hook 必须让目标用户停住，禁止“今天聊聊/分享一下/随着/在当今/大家都知道”。
- 不发空泛态度：禁止“很重要/值得关注/未来可期/非常有潜力”这种没有新信息的句子。
- 不发营销硬广：产品/资料入口只能做低压转化，并且必须先给读者一个有用判断。
- 不编造不可验证数据、客户、收益、融资、经历；可以写“我会这样判断/可以这样验证”。
- 每条只服务一个传播目标：涨粉、收藏、信任、互动、转化，不要混成大杂烩。

请先生成 ${Math.max(draftNeeded * 2, draftNeeded + 6)} 条候选，内部淘汰低分内容，然后只返回你自评后最强的 ${draftNeeded} 条。必须覆盖以下内容类型中的至少 4 类：
- short_opinion：极短的强观点/反常识吐槽，像活人的即兴发言
- quote_comment：引用一句别人的观点/现象，附加一两句犀利短评（占比约 10%）
- playbook：中短篇的框架/清单/工具/步骤，用于收藏和信任
- story：经历/复盘/Build in Public，用于人设和共鸣
- reply_bait：能引发评论或站队的问题/判断
- soft_conversion：低压产品/服务/行动入口，不硬广

每条推文必须像 X 原生表达：
- 开头第一行必须有 Hook，不要铺垫（除非是极短的情绪贴，可以直接开始）。
- 一条推文只讲一个判断。
- 少形容词，多具体场景、数字、对比、动作。
- 必须主动换行，适合手机阅读：Hook 单独一行；长句每 28-36 个中文字符切分；清单每项单独一行；逻辑块之间用一个空行。
- 不要把 3 个以上的判断塞进同一段，也不要写成公众号长段落。
- 不要承诺收益，不要编造客户/融资/数据，不要使用擦边或政治动员。
- 默认不用 hashtag；如果使用，最多 1 个，且必须自然。

优先使用这些高质量结构：
- 短平快吐槽：一句话揭露行业潜规则。
- 引用短评：“XXX” —— 事实并非如此，因为...
- 反常识判断：大多数人以为 A，真正决定结果的是 B。
- 可复制路径：适合谁 -> 怎么做 -> 如何验证 -> 失败信号。
- 案例拆解：观察到什么 -> 为什么有效 -> 普通人能学哪一步。
- 取舍复盘：我会放弃什么 -> 因为约束是什么 -> 下一步怎么试。
- 评论诱因：给一个明确选择题或判断题，而不是“你怎么看”。

给每条内容按 1-10 分自评：
- hook: 开头是否能让人停住
- shareability: 是否有转发理由
- replyTrigger: 是否能引发评论
- identity: 是否强化账号身份标签
- audienceFit: 是否精准击中目标用户
- nativeX: 是否像 X 原生表达

严格只返回 JSON 对象，不要额外解释：
{
  "tweets": [
    {
      "type": "opinion|playbook|story|reply_bait|soft_conversion",
      "text": "推文正文",
      "qualityRationale": "为什么这条有信息增量、适合当前账号、值得被转发/收藏/评论",
      "scores": {
        "hook": 8,
        "shareability": 8,
        "replyTrigger": 7,
        "identity": 8,
        "audienceFit": 9,
        "nativeX": 9
      }
    }
  ]
}`;
    
    try {
      const generatedText = await callLLM(prompt, config, true);
      // Clean up markdown code blocks if the model wrapped it
      const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedTweets = JSON.parse(cleanJsonStr);
      const newTweets = normalizeGeneratedTweets(parsedTweets).slice(0, draftNeeded);
      
      if (newTweets.length > 0) {
        newTweets.forEach(t => {
           queue.push({
             id: Date.now() + Math.random(),
             text: t.text,
             type: t.type,
             viralScore: t.score,
             scores: t.scores,
             scheduledAt: null,
             nativeScheduleStatus: ''
           });
        });
        queue = queue.slice(0, DRAFT_TARGET_COUNT);
        if (getPostDeliveryMode(config) === POST_DELIVERY_MODE_X_SCHEDULE) {
          queue = ensureNativeScheduleTimes(queue, config);
        }
        chrome.storage.local.set({ tweetQueue: queue, isGenerating: false }, () => {
           addLog('success', `成功生成 ${newTweets.length} 条内容，当前 Agent 队列 ${queue.length}/${DRAFT_TARGET_COUNT}`);
           chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
           chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});
           checkAndSetupAlarm(); // re-evaluate alarm
        });
      } else {
        chrome.storage.local.set({ isGenerating: false }, () => {
          addLog('warn', 'AI 未返回可用内容，已停止本轮生成');
          chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});
        });
      }
    } catch (e) {
      addLog('error', `内容队列生成失败: ${e.message}`);
      chrome.storage.local.set({ isGenerating: false });
      chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});
    }
  });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.accountBio && changes.accountBio.newValue) {
       addLog('info', '检测到主页简介更新，触发画像分析');
       analyzeAccountPersona(changes.accountBio.newValue);
    }
    if (changes.isRunning && changes.isRunning.newValue) {
       chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'accountBio', 'aiPersona', 'tweetQueue'], (res) => {
          const errors = getConfigErrors(res);
          if (errors.length > 0) {
             addLog('error', `启动失败：${errors.join('、')}，请先到配置中心完善设置`);
             chrome.storage.local.set({ isRunning: false, configErrors: errors });
             return;
          }
          chrome.storage.local.remove(['configErrors']);
          addLog('info', '机器人已启动');
          chrome.storage.local.set({
             twitterCooldownUntil: 0,
             apiCooldownUntil: 0,
             isGeneratingReply: false,
             isTyping: false,
             isAutoPaused: false,
             pauseReason: '',
             sessionPostCount: 0,
             sessionReplyCount: 0,
             tweetQueue: normalizeDraftQueue(res.tweetQueue)
          });
          const isPersonaEmpty = !res.aiPersona || (!res.aiPersona.targetUsers && !res.aiPersona.characteristics && !res.aiPersona.goals);
          if (res.accountBio && isPersonaEmpty) {
             analyzeAccountPersona(res.accountBio);
          } else if (!isPersonaEmpty) {
             generateAutoDrafts();
          }
          chrome.alarms.create("autoShutdownAlarm", { delayInMinutes: 600 });
          checkAndSetupAlarm();
       });
    } else if (changes.isRunning && !changes.isRunning.newValue) {
       addLog('info', '机器人已停止');
       chrome.alarms.clear("postTweetAlarm");
       chrome.alarms.clear("autoShutdownAlarm");
       chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingScheduledAt']);
    }
    if (changes.isAutoPaused && changes.isAutoPaused.oldValue && !changes.isAutoPaused.newValue) {
       chrome.storage.local.get(['pendingPost', 'pendingPostSource', 'isRunning'], (res) => {
          if (res.pendingPost && (res.isRunning || res.pendingPostSource === 'manualTest')) {
             addLog('info', '检测到自动操作恢复，继续处理待发送推文');
             triggerPostInTab();
          } else {
             checkAndSetupAlarm();
          }
       });
    }
    if (changes.tweetQueue) {
       chrome.storage.local.get(['aiPersona'], (res) => {
          const queue = normalizeDraftQueue(changes.tweetQueue.newValue);
          if (queueNeedsNormalization(changes.tweetQueue.newValue, queue)) {
             chrome.storage.local.set({ tweetQueue: queue });
             return;
          }
          if (res.aiPersona && changes.tweetQueue.newValue && queue.length < DRAFT_REFILL_THRESHOLD) {
             generateAutoDrafts();
          }
       });
    }
    if (changes.aiPersona && changes.aiPersona.newValue) {
       const p = changes.aiPersona.newValue;
       const isPersonaEmpty = !p || (!p.targetUsers && !p.characteristics && !p.goals);
       if (isPersonaEmpty) {
          chrome.storage.local.get(['accountBio'], (res) => {
             if (res.accountBio) analyzeAccountPersona(res.accountBio);
          });
       } else {
          chrome.storage.local.get(['tweetQueue'], (res) => {
             const q = normalizeDraftQueue(res.tweetQueue);
             if (q.length < DRAFT_REFILL_THRESHOLD) generateAutoDrafts();
          });
       }
    }
  }
});

// Track Side Panel State
let isSidePanelOpen = false;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidepanel") {
    isSidePanelOpen = true;
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(t => chrome.tabs.sendMessage(t.id, { action: 'sidePanelState', isOpen: true }).catch(()=>{}));
    });
    
    port.onDisconnect.addListener(() => {
      isSidePanelOpen = false;
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(t => chrome.tabs.sendMessage(t.id, { action: 'sidePanelState', isOpen: false }).catch(()=>{}));
      });
    });
  }
});

// Restrict Side Panel and Action to Twitter Only
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  try {
    const url = new URL(tab.url);
    if (url.hostname.includes('x.com') || url.hostname.includes('twitter.com')) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'options/options.html',
        enabled: true
      });
      chrome.action.enable(tabId);
    } else {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
      chrome.action.disable(tabId);
    }
  } catch (e) {}
});

// Also check on tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url) return;
    const url = new URL(tab.url);
    if (url.hostname.includes('x.com') || url.hostname.includes('twitter.com')) {
      chrome.action.enable(activeInfo.tabId);
    } else {
      chrome.action.disable(activeInfo.tabId);
    }
  } catch(e) {}
});

// Handle openSidePanel and autoRewrite requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkSidePanelState') {
    sendResponse({ isOpen: isSidePanelOpen });
    return true;
  }
  if (request.action === 'openSidePanel') {
    if (chrome.sidePanel && chrome.sidePanel.open && sender && sender.tab) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
      sendResponse({ success: true });
    }
    return true;
  }
  if (request.action === 'autoRewrite') {
    if (chrome.sidePanel && chrome.sidePanel.open && sender && sender.tab) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
    }
    chrome.storage.local.set({ pendingAutoRewrite: request.tweetData });
    sendResponse({ success: true });
    return true;
  }
  if (request.action === 'autoReply') {
    if (chrome.sidePanel && chrome.sidePanel.open && sender && sender.tab) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
    }
    chrome.storage.local.set({ pendingAutoReply: request.tweetData });
    sendResponse({ success: true });
    return true;
  }
});
