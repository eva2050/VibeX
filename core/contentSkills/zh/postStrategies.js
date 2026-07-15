const SUPPORTED_CHINESE_POST_FAMILIES = Object.freeze([
  'product_observation',
  'tool_experience',
  'build_in_public',
  'failure_retrospective',
  'industry_opinion',
  'workflow_framework'
]);

const STRATEGIES = Object.freeze({
  faithful_sharpening: Object.freeze({
    id: 'faithful_sharpening',
    label: '忠实强化',
    instruction: '保留原素材的对象、判断、确定性和信息边界，只优化首句、压缩冗余并整理自然节奏。'
  }),
  cognitive_reframe: Object.freeze({
    id: 'cognitive_reframe',
    label: '认知重构',
    instruction: '只从原素材已有关系中找到更值得强调的变量、限制或反差，不得另造结论。'
  }),
  concrete_scene: Object.freeze({
    id: 'concrete_scene',
    label: '具体场景',
    instruction: '优先使用原素材已经给出的动作、成本、工作流或产品行为承托观点；没有场景时不得编造。'
  }),
  structured_framework: Object.freeze({
    id: 'structured_framework',
    label: '实操框架',
    instruction: '保留原素材明确给出的步骤和顺序，压缩成可执行框架；不得补写原文没有的步骤。'
  }),
  progress_log: Object.freeze({
    id: 'progress_log',
    label: '进展日志',
    instruction: '围绕原素材已经发生的进展、取舍和结果写成自然进展记录；不得伪造数据或里程碑。'
  })
});

const FAMILY_RECIPES = Object.freeze({
  product_observation: '先写素材里的产品行为、使用断点或具体动作，再写它让你看到的问题；不要先宣布一个普遍道理。',
  tool_experience: '按“我做了什么—遇到什么—为什么留下或放弃”展开，只复用素材已经给出的体验。',
  build_in_public: '先交代这次具体改了什么和结果，再写这次取舍带来的判断；允许粗糙，不包装成成功学。',
  failure_retrospective: '先写发生了什么、哪里判断错了、造成什么结果，再写现在如何理解；不把一次经历升级成人人适用的定律。',
  industry_opinion: '先放出素材里的变化、约束或现象，再给带有边界的个人判断；保留“可能、未必、我觉得”等不确定性。',
  workflow_framework: '保留素材原有步骤和顺序，用“我怎么做”或直接动作说明，不增加步骤，也不承诺结果。'
});

const TERRITORY_PATTERN = /AI|人工智能|模型|智能体|agent|产品|工具|软件|SaaS|独立开发|开发者|创业|创作者|内容|工作流|workflow|用户|留存|增长|变现|商业化|交付|发布|上线|代码助手|知识库|Build\s*in\s*public/i;
const UNCERTAINTY_PATTERN = /怀疑|可能|也许|或许|大概|似乎|看起来|未必|不一定|越来越觉得|我觉得|我猜|恐怕|倾向于|是否|会不会/;
const EXPERIENCE_PATTERN = /(?:我|我们).{0,10}(?:试了|试过|用了|用过|连续做|做了|上线了|发布了|删掉|删除|改了|踩过|花了|换了|留下来|复盘了)/;
const COMPETITION_PATTERN = /押注|押中|赌|竞争|对手|阵营|三家|两家|牌局|资源分配/;
const STEP_PATTERN = /(?:两|三|四|五|六|\d+)步|第一步|第二步|第三步|先.{0,20}再.{0,20}(?:最后|然后)|(?:^|\n)\s*[1-4一二三四][.、）)]/m;

function normalizeInputText(input = {}) {
  return String(input?.text || input || '').replace(/\r/g, '').trim();
}

function extractNumbers(text = '') {
  return [...new Set(String(text).match(/\d+(?:\.\d+)?(?:%|％)?|[一二两三四五六七八九十百千万]+(?:年|天|小时|分钟|万|亿|%|％)/g) || [])];
}

function extractEntities(text = '') {
  const matches = String(text).match(/@[A-Za-z0-9_]{1,15}|https?:\/\/\S+|\b[A-Za-z][A-Za-z0-9_.+-]{2,}\b/g) || [];
  return [...new Set(matches.map(value => value.replace(/[),.，。]+$/, '')))];
}

function inferContentFamily(text = '') {
  if (/Build\s*in\s*public|第\s*\d+\s*天|开发进度|本周进展|(?:今天|这周|本周).{0,20}(?:上线|发布|新增|删掉|删除|修复|修了)/i.test(text)) {
    return 'build_in_public';
  }
  if (STEP_PATTERN.test(text) || /方法|框架|流程.{0,10}(?:简单|分为|：)|工作流.{0,10}(?:简单|：)|先.{0,25}再|只问(?:两|三|四|\d+)个问题|验证.{0,8}(?:只看|分为)/.test(text)) {
    return 'workflow_framework';
  }
  if (EXPERIENCE_PATTERN.test(text) && /AI|模型|产品|工具|软件|SaaS|应用|助手/i.test(text)) {
    return 'tool_experience';
  }
  if (/失败|踩.{0,2}坑|做错|没做成|冷启动.{0,8}(?:失败|没)|最大的问题|(?:这次|一次|项目|产品).{0,12}复盘|复盘这次|复盘证明|复盘.{0,12}(?:失败|问题|做错)|我们花了.{0,30}却/.test(text)) {
    return 'failure_retrospective';
  }
  if (/行业|趋势|接下来|未来|分水岭|市场|赛道|创业者|创业越来越|这一轮|下一轮|下一个阶段|下一个变化|独立开发.{0,12}门槛/.test(text)) {
    return 'industry_opinion';
  }
  return 'product_observation';
}

function getLengthBand(family = '') {
  if (family === 'workflow_framework') return { minRatio: 0.65, maxRatio: 1.55 };
  if (family === 'build_in_public' || family === 'failure_retrospective') return { minRatio: 0.6, maxRatio: 1.45 };
  return { minRatio: 0.55, maxRatio: 1.35 };
}

function diagnoseChinesePostInput(input = {}) {
  const sourceText = normalizeInputText(input);
  const supported = Boolean(sourceText && TERRITORY_PATTERN.test(sourceText));
  const family = supported ? inferContentFamily(sourceText) : 'unsupported';
  const certainty = UNCERTAINTY_PATTERN.test(sourceText) || /[？?]/.test(sourceText)
    ? 'uncertain'
    : 'assertive';
  const hasFirstPersonExperience = EXPERIENCE_PATTERN.test(sourceText);
  const hasCompetitionRelation = COMPETITION_PATTERN.test(sourceText);
  const forbiddenStructures = [
    ...(!hasFirstPersonExperience ? ['invented_experience'] : []),
    ...(certainty === 'uncertain' ? ['certainty_escalation'] : []),
    ...(!hasCompetitionRelation ? ['competition_bet'] : [])
  ];
  const recommendedStructures = family === 'workflow_framework'
    ? ['structured_framework']
    : family === 'build_in_public'
      ? ['progress_log']
      : ['tool_experience', 'failure_retrospective'].includes(family)
        ? ['concrete_scene']
        : family === 'industry_opinion'
          ? ['cognitive_reframe']
          : ['faithful_sharpening'];
  return Object.freeze({
    supported,
    family,
    sourceText,
    certainty,
    hasFirstPersonExperience,
    hasCompetitionRelation,
    entities: Object.freeze(extractEntities(sourceText)),
    numbers: Object.freeze(extractNumbers(sourceText)),
    concreteSignals: Object.freeze([
      ...(extractNumbers(sourceText).length ? ['number'] : []),
      ...(hasFirstPersonExperience ? ['supplied_experience'] : []),
      ...(STEP_PATTERN.test(sourceText) ? ['explicit_steps'] : [])
    ]),
    recommendedStructures: Object.freeze(recommendedStructures),
    forbiddenStructures: Object.freeze(forbiddenStructures),
    targetLength: Object.freeze(getLengthBand(family)),
    fallbackReason: supported ? '' : 'outside_supported_territory'
  });
}

function selectChinesePostStrategies(diagnosis = {}) {
  const ids = Array.isArray(diagnosis.recommendedStructures)
    ? diagnosis.recommendedStructures
    : [];
  const selectedId = [...new Set(ids)].find(id => STRATEGIES[id]) || 'faithful_sharpening';
  return [STRATEGIES[selectedId]];
}

function buildChineseCandidateInstruction(strategy = {}, diagnosis = {}) {
  const certaintyRule = diagnosis.certainty === 'uncertain'
    ? '原素材是怀疑、可能或未确认判断；不得把怀疑或可能改成确定事实。'
    : '保持原素材的确定性，不得额外夸大。';
  const experienceRule = diagnosis.hasFirstPersonExperience
    ? '只能使用原素材已经提供的第一人称经历。'
    : '原素材没有可用的第一人称经历，不得伪造“我做过/我用了/我发现”的故事。';
  return [
    `[中文 X Skill：${strategy.label || strategy.id || '候选策略'}]`,
    strategy.instruction || '',
    `内容类型：${diagnosis.family || 'unknown'}`,
    `成稿结构：${FAMILY_RECIPES[diagnosis.family] || FAMILY_RECIPES.product_observation}`,
    '先写素材里已经出现的具体信号：数字、人物、动作、产品行为、对话或过程。具体信号至少出现一个，然后再写判断。',
    '如果素材只有一个薄观点，就忠实写短，不要用空泛金句把它伪装成深度。',
    '素材提供第一人称时，写自己如何观察和行动，不要站在高处教别人怎么做；素材没有第一人称时，不得伪造。',
    certaintyRule,
    experienceRule,
    diagnosis.forbiddenStructures?.includes('competition_bet')
      ? '原素材没有牌局、竞争或资源分配关系，不得使用“押、赌、下半场、谁赢了”等结构。'
      : '',
    '像中文 X 用户自然说话。可以口语化、可以有不完美的停顿，但每一段都必须增加新信息。',
    '只返回一篇可以直接发布的正文，不给候选、不解释写作过程。'
  ].filter(Boolean).join('\n');
}

export {
  STRATEGIES,
  FAMILY_RECIPES,
  SUPPORTED_CHINESE_POST_FAMILIES,
  buildChineseCandidateInstruction,
  diagnoseChinesePostInput,
  extractEntities,
  extractNumbers,
  selectChinesePostStrategies
};
