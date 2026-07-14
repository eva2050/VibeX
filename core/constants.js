

const FIRST_AUTO_POST_DELAY_MS = 60 * 1000;

const REPLY_COOLDOWN_MS = 5 * 60 * 1000;

const REPLY_RETRY_LOCK_MS = 60 * 1000;

const DEFAULT_X_CLIENT_ID = 'bDZmWnRPUW8zLXVaNmh1ZVVwdHA6MTpjaQ';

function normalizeXClientId(clientId = '') {
  return String(clientId || '').trim() || DEFAULT_X_CLIENT_ID;
}



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

function selectGrowthPlaybook(context = {}) {
  const explicit = context.id
    || context.strategyArchetype
    || context.onboardingStrategy?.strategyArchetype;
  if (GROWTH_PLAYBOOKS[explicit]) return GROWTH_PLAYBOOKS[explicit];

  const signal = [
    context.sourceInput,
    context.accountBio,
    context.leadTarget,
    context.onboardingStrategy?.sourceInput,
    context.onboardingStrategy?.growthGoal,
    context.persona?.targetUsers,
    context.persona?.characteristics,
    context.persona?.goals,
    context.aiPersona?.targetUsers,
    context.aiPersona?.characteristics,
    context.aiPersona?.goals,
    context.agentMemory?.identity,
    context.agentMemory?.marketPosition,
    context.agentMemory?.audienceSegments,
    context.agentMemory?.audiencePains,
    context.agentMemory?.contentPillars,
    context.agentMemory?.contentAngles,
    context.agentMemory?.coreOpinions,
    context.agentMemory?.sourceInputs
  ].filter(Boolean).join('\n').toLowerCase();

  let best = GROWTH_PLAYBOOKS.indie_builder;
  let bestScore = -1;
  Object.values(GROWTH_PLAYBOOKS).forEach((playbook) => {
    const score = playbook.triggers.reduce((sum, trigger) => {
      return signal.includes(String(trigger).toLowerCase()) ? sum + 1 : sum;
    }, 0);
    if (score > bestScore) {
      best = playbook;
      bestScore = score;
    }
  });

  return bestScore > 0 ? best : GROWTH_PLAYBOOKS.indie_builder;
}

export { FIRST_AUTO_POST_DELAY_MS, REPLY_COOLDOWN_MS, REPLY_RETRY_LOCK_MS, DEFAULT_X_CLIENT_ID, normalizeXClientId, DEFAULT_AGENT_MEMORY, AGENT_MEMORY_LABELS, GROWTH_PLAYBOOKS, DEFAULT_INTERACTION_TARGETS, PROJECT_ACCOUNT_HANDLES, DEFAULT_DISCOVERY_KEYWORDS, selectGrowthPlaybook };
