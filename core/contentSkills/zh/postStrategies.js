import { getChinesePostPatternCard } from './postCorpus.js';

const SUPPORTED_CHINESE_POST_FAMILIES = Object.freeze([
  'product_observation',
  'tool_experience',
  'build_in_public',
  'failure_retrospective',
  'industry_opinion',
  'workflow_framework'
]);

const STRATEGIES = Object.freeze(Object.fromEntries([
  ['field_test', '实测记录'],
  ['product_feedback', '产品反馈'],
  ['data_snapshot', '数据快照'],
  ['sourced_update', '来源拆解'],
  ['scene_note', '现场片段'],
  ['short_judgment', '短判断']
].map(([id, label]) => [id, Object.freeze({
  id,
  label,
  instruction: getChinesePostPatternCard(id).instruction
})])));

const TERRITORY_PATTERN = /AI|人工智能|模型|智能体|agent|产品|工具|软件|SaaS|独立开发|开发者|创业|创作者|内容|工作流|workflow|用户|留存|增长|变现|商业化|交付|发布|上线|代码助手|知识库|Build\s*in\s*public|Codex|Claude|ChatGPT|GPT|PPT|HTML|SEO|Google/i;
const UNCERTAINTY_PATTERN = /怀疑|可能|也许|或许|大概|似乎|看起来|未必|不一定|越来越觉得|我觉得|我猜|恐怕|倾向于|是否|会不会/;
const EXPERIENCE_PATTERN = /(?:我|我们).{0,14}(?:试了|试过|测试|测了|用了|用过|跑了|连续做|做了|生成了|上线了|发布了|删掉|删除|改了|踩过|花了|换了|留下来|复盘了)/;
const TEST_PATTERN = /实测|测试|试了|试过|跑了|跑完|体验了|用了|用过|生成了|做了.{0,12}(?:页面|PPT|视频|图片|任务)/;
const RESULT_PATTERN = /完成|跑完|结果|提升|下降|节省|获得|注册|付费|失败|成功|稳定|不够稳|问题|短板|卡住|崩|不能|可以/;
const SOURCE_PATTERN = /来源|根据|官方|公告|发布了|对谈|访谈|诉状|报告|研究|测试显示|数据显示|https?:\/\//i;
const FEEDBACK_PATTERN = /界面|UI|按钮|面板|Panel|客户端|桌面版|入口|分栏|Tab|选项|流程|交互|预览|点击|挤得|找不到|不能直接|不透明|上下文.{0,8}(?:断|接不上)|重新解释/i;
const COMPETITION_PATTERN = /押注|押中|赌|竞争|对手|阵营|三家|两家|牌局|资源分配/;
const STEP_PATTERN = /(?:两|三|四|五|六|\d+)步|第一步|第二步|第三步|先.{0,20}再.{0,20}(?:最后|然后)|(?:^|\n)\s*[1-4一二三四][.、）)]/m;
const ABSTRACT_PATTERN = /时代|趋势|未来|底层|本质|真正的竞争|认知|格局|范式|拐点|红利|新世界|方法论/;
const TIME_PATTERN = /今天|昨天|本周|这周|刚才|最近|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}\s*年/;
const EXTERNAL_ATTRIBUTION_PATTERN = /https?:\/\/|来源[：:]|根据.{0,16}(?:公告|报告|研究|对谈)|(?:看到|转发|引用).{0,20}(?:说|写|提到)|@[A-Za-z0-9_]{1,15}/i;

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

function inferContentOwnership(input = {}, text = '') {
  if (['first_party', 'attributed_external', 'unknown'].includes(input?.ownership)) {
    return input.ownership;
  }
  return EXTERNAL_ATTRIBUTION_PATTERN.test(text) ? 'attributed_external' : 'first_party';
}

function extractCodeSwitches(text = '') {
  return [...new Set(String(text).match(/\b[A-Za-z][A-Za-z0-9]*\b/g) || [])];
}

function extractQuotedPhrases(text = '') {
  return [...new Set(
    [...String(text).matchAll(/[“"]([^”"]{1,20})[”"]/g)]
      .map(match => match[1].trim())
      .filter(Boolean)
  )];
}

function getCommonPrefix(left = '', right = '') {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) {
    index += 1;
  }
  return left.slice(0, index);
}

function extractRepeatedOpeners(text = '') {
  const lines = String(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const candidates = [];
  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      const prefix = getCommonPrefix(lines[left], lines[right]);
      if (/^[\u3400-\u9fff]{2,6}$/.test(prefix)) candidates.push(prefix);
    }
  }
  return [...new Set(candidates)]
    .filter(prefix => lines.filter(line => line.startsWith(prefix)).length >= 2)
    .filter(prefix => !candidates.some(other => other !== prefix && other.startsWith(prefix)))
    .sort((left, right) => right.length - left.length);
}

function detectSpeechMoves(text = '', humanTrace = {}) {
  const moves = [
    ...(humanTrace.repeatedOpeners?.length ? ['repeated_anaphora'] : []),
    ...(humanTrace.codeSwitches?.length ? ['code_switch'] : []),
    ...(/[？?]|真的.{0,8}(?:么|吗)|没毛病吧/.test(text) ? ['self_questioning'] : []),
    ...((text.match(/(?:^|\n)\s*(?:但|可是|不过)/g) || []).length ? ['reversal'] : []),
    ...(/哈哈|笑死|没毛病|懂不懂|反正|啊|吧|么/.test(text) ? ['colloquial_emotion'] : []),
    ...(/实际上|其实|反正|毕竟|少之又少/.test(text) ? ['reality_correction'] : []),
    ...(humanTrace.quotedPhrases?.length && /当年|曾经|也曾|记得|那座/.test(text) ? ['memory_anchor'] : [])
  ];
  return [...new Set(moves)];
}

function inferEmotionalTemperature(text = '', speechMoves = []) {
  if (/崩溃|愤怒|气死|狂喜|激动坏了/.test(text)) return 'high';
  if (speechMoves.length >= 4) return 'medium';
  if (speechMoves.length > 0) return 'low';
  return 'neutral';
}

function inferPublishReason(ownership = '', signalType = '', speechMoves = []) {
  if (ownership === 'first_party' && speechMoves.includes('self_questioning')) {
    return 'unresolved_personal_judgment';
  }
  if (ownership === 'attributed_external') return 'attributed_external_update';
  if (signalType === 'first_hand_test') return 'first_hand_test_result';
  if (signalType === 'first_hand_result') return 'first_hand_result';
  if (signalType === 'public_feedback') return 'concrete_product_friction';
  if (signalType === 'data_snapshot') return 'first_party_data_point';
  return 'personal_observation';
}

function inferContentFamily(text = '') {
  if (/Build\s*in\s*public|第\s*\d+\s*天|开发进度|本周进展|(?:今天|这周|本周).{0,20}(?:上线|发布|新增|删掉|删除|修复|修了)/i.test(text)) {
    return 'build_in_public';
  }
  if (STEP_PATTERN.test(text) || /方法|框架|流程.{0,10}(?:简单|分为|：)|工作流.{0,10}(?:简单|：)|先.{0,25}再|只问(?:两|三|四|\d+)个问题|验证.{0,8}(?:只看|分为)/.test(text)) {
    return 'workflow_framework';
  }
  if (EXPERIENCE_PATTERN.test(text) && /AI|模型|产品|工具|软件|SaaS|应用|助手|Codex|Claude|ChatGPT|Hy3/i.test(text)) {
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

function getLengthBand(family = '', sourceStrength = 'medium') {
  if (sourceStrength === 'weak') return { minRatio: 0.35, maxRatio: 1.1 };
  if (family === 'workflow_framework') return { minRatio: 0.6, maxRatio: 1.35 };
  if (family === 'build_in_public' || family === 'failure_retrospective') return { minRatio: 0.55, maxRatio: 1.3 };
  return { minRatio: 0.45, maxRatio: 1.25 };
}

function collectAvailableSignals(text = '') {
  const numbers = extractNumbers(text);
  const entities = extractEntities(text).filter(value => !/^https?:\/\//i.test(value));
  return [...new Set([
    ...(numbers.length ? ['number'] : []),
    ...(entities.length ? ['named_entity'] : []),
    ...(EXPERIENCE_PATTERN.test(text) ? ['first_person_action'] : []),
    ...(TEST_PATTERN.test(text) ? ['test_action'] : []),
    ...(RESULT_PATTERN.test(text) ? ['result_or_limit'] : []),
    ...(SOURCE_PATTERN.test(text) ? ['explicit_source'] : []),
    ...(FEEDBACK_PATTERN.test(text) ? ['product_detail'] : []),
    ...(STEP_PATTERN.test(text) ? ['explicit_steps'] : []),
    ...(TIME_PATTERN.test(text) ? ['time_marker'] : [])
  ])];
}

function inferSignalType(text = '', availableSignals = []) {
  const compactLength = String(text).replace(/\s+/g, '').length;
  if (compactLength <= 8) return 'thin_input';
  const has = value => availableSignals.includes(value);
  if (has('first_person_action') && has('test_action')) return 'first_hand_test';
  if (has('first_person_action') && (has('result_or_limit') || has('number'))) return 'first_hand_result';
  if (has('explicit_source')) return 'sourced_update';
  if (has('product_detail')) return 'public_feedback';
  if (has('number') && (/流量|注册|收入|费用|用户|成绩|调用|转化|增长|下降|提升|节省|每天|每月|小时|天/.test(text) || extractNumbers(text).length >= 2)) {
    return 'data_snapshot';
  }
  if (!ABSTRACT_PATTERN.test(text) && (has('named_entity') || has('result_or_limit') || text.length >= 28)) {
    return 'concrete_observation';
  }
  return 'abstract_opinion';
}

function inferSourceStrength(signalType = '', availableSignals = []) {
  if (['thin_input', 'abstract_opinion'].includes(signalType)) return 'weak';
  if (['first_hand_test', 'first_hand_result', 'sourced_update', 'data_snapshot'].includes(signalType)) {
    return availableSignals.length >= 2 ? 'strong' : 'medium';
  }
  return 'medium';
}

function getPatternCardId(signalType = '') {
  if (signalType === 'first_hand_test') return 'field_test';
  if (signalType === 'first_hand_result' || signalType === 'data_snapshot') return 'data_snapshot';
  if (signalType === 'sourced_update') return 'sourced_update';
  if (signalType === 'public_feedback') return 'product_feedback';
  if (signalType === 'concrete_observation') return 'scene_note';
  return 'short_judgment';
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
  const availableSignals = supported ? collectAvailableSignals(sourceText) : [];
  const signalType = supported ? inferSignalType(sourceText, availableSignals) : 'unsupported';
  const sourceStrength = supported ? inferSourceStrength(signalType, availableSignals) : 'weak';
  const patternCardId = availableSignals.includes('explicit_steps')
    ? 'short_judgment'
    : getPatternCardId(signalType);
  const forbiddenStructures = [
    ...(!hasFirstPersonExperience ? ['invented_experience'] : []),
    ...(certainty === 'uncertain' ? ['certainty_escalation'] : []),
    ...(!hasCompetitionRelation ? ['competition_bet'] : []),
    ...(!availableSignals.includes('explicit_steps') ? ['invented_steps'] : [])
  ];
  const entities = extractEntities(sourceText);
  const numbers = extractNumbers(sourceText);
  const ownership = inferContentOwnership(input, sourceText);
  const humanTrace = Object.freeze({
    repeatedOpeners: Object.freeze(extractRepeatedOpeners(sourceText)),
    codeSwitches: Object.freeze(extractCodeSwitches(sourceText)),
    quotedPhrases: Object.freeze(extractQuotedPhrases(sourceText))
  });
  const speechMoves = detectSpeechMoves(sourceText, humanTrace);
  const firstPartySignals = ownership === 'first_party'
    ? [...new Set([
        ...availableSignals,
        ...((certainty === 'uncertain' || speechMoves.includes('self_questioning')) ? ['personal_judgment'] : [])
      ])]
    : [];
  const externalSignals = ownership === 'attributed_external' ? [...availableSignals] : [];
  return Object.freeze({
    supported,
    family,
    sourceText,
    certainty,
    signalType,
    sourceStrength,
    patternCardId,
    hasFirstPersonExperience,
    hasCompetitionRelation,
    ownership,
    allowedPerspective: ownership === 'first_party'
      ? 'first_person_optional'
      : ownership === 'attributed_external'
        ? 'source_attributed'
        : 'non_first_person',
    publishReason: inferPublishReason(ownership, signalType, speechMoves),
    firstPartySignals: Object.freeze(firstPartySignals),
    externalSignals: Object.freeze(externalSignals),
    humanTrace,
    emotionalTemperature: inferEmotionalTemperature(sourceText, speechMoves),
    speechMoves: Object.freeze(speechMoves),
    entities: Object.freeze(entities),
    numbers: Object.freeze(numbers),
    availableSignals: Object.freeze(availableSignals),
    concreteSignals: Object.freeze(availableSignals),
    recommendedStructures: Object.freeze([patternCardId]),
    forbiddenStructures: Object.freeze(forbiddenStructures),
    targetLength: Object.freeze(getLengthBand(family, sourceStrength)),
    fallbackReason: supported ? '' : 'outside_supported_territory'
  });
}

function selectChinesePostStrategies(diagnosis = {}) {
  const selectedId = STRATEGIES[diagnosis.patternCardId]
    ? diagnosis.patternCardId
    : 'short_judgment';
  return [STRATEGIES[selectedId]];
}

function buildChineseCandidateInstruction(strategy = {}, diagnosis = {}) {
  const card = getChinesePostPatternCard(diagnosis.patternCardId || strategy.id);
  const certaintyRule = diagnosis.certainty === 'uncertain'
    ? '原素材是怀疑、可能或未确认判断；不得把怀疑或可能改成确定事实。'
    : '保持原素材的确定性，不得额外夸大。';
  const experienceRule = diagnosis.hasFirstPersonExperience
    ? '只能使用原素材已经提供的第一人称经历。'
    : '原素材没有可用的第一人称经历，不得伪造“我做过/我用了/我发现”的故事。';
  const weakRule = diagnosis.sourceStrength === 'weak'
    ? '素材很薄：正文只能同样短。不要补比喻、步骤、共识、趋势或人生结论来制造深度。'
    : '保留素材里的动作、数字、对象、结果或限制，不要把它们压成抽象总结。';
  const voiceRule = diagnosis.speechMoves?.length
    ? `口头思路轨迹：${diagnosis.speechMoves.join('、')}。只保留素材已经出现的轨迹，不新增统一口头禅。`
    : '素材没有明显口头动作，不要为了人味强行添加笑、反问或自嘲。';
  const preservedExpressions = [...new Set([
    ...(diagnosis.humanTrace?.repeatedOpeners || []),
    ...(diagnosis.humanTrace?.codeSwitches || []),
    ...(diagnosis.humanTrace?.quotedPhrases || [])
  ])];
  const preserveRule = preservedExpressions.length
    ? `保留原素材中有表达作用的这些词和节奏：${preservedExpressions.join('、')}。不得统一改成标准书面中文，也不得为了句式多样而去重。`
    : '优先保留用户自己的词和断句，不主动替换成更标准、更完整的书面表达。';
  return [
    `[中文 X Skill：${strategy.label || strategy.id || '短判断'}]`,
    `信号类型：${diagnosis.signalType || 'unknown'}`,
    `素材强度：${diagnosis.sourceStrength || 'weak'}`,
    `本稿形状：${card.instruction}`,
    `停止条件：${card.stopCondition}`,
    `素材归属：${diagnosis.ownership || 'unknown'}；允许视角：${diagnosis.allowedPerspective || 'non_first_person'}。`,
    voiceRule,
    preserveRule,
    weakRule,
    '研究语料不提供当前主题、事实或句子；当前正文的主题只能来自用户这次输入。',
    '素材提供第一人称时，写自己如何观察和行动，不要站在高处教别人怎么做；素材没有第一人称时，不得伪造。',
    certaintyRule,
    experienceRule,
    diagnosis.availableSignals?.includes('explicit_steps')
      ? '素材明确给出了步骤，可以保留原顺序，但不得增加步骤。'
      : '素材没有明确步骤，不得生成“第一、第二、第三”或“三步法”。',
    diagnosis.forbiddenStructures?.includes('competition_bet')
      ? '原素材没有牌局、竞争或资源分配关系，不得使用“押、赌、下半场、谁赢了”等结构。'
      : '',
    '不要写时代宣言，不要使用王炸、炸裂、必看、颠覆认知等内容农场词。避免成组“不是 A，而是 B”。',
    diagnosis.speechMoves?.includes('self_questioning') || diagnosis.speechMoves?.includes('memory_anchor')
      ? '允许停在怀疑、记忆或情绪，不要补“历史周期、时代浪潮、终将、足矣”式正确总结。'
      : '正文说完素材已有信号就停止，不补宏大意义。',
    '像当事人在 X 上刚好说到这件事：可以短、可以有情绪、可以不完整，但不能把空洞包装成完整。',
    '只返回一篇可以直接发布的正文，不给候选、不解释写作过程。'
  ].filter(Boolean).join('\n');
}

export {
  STRATEGIES,
  SUPPORTED_CHINESE_POST_FAMILIES,
  buildChineseCandidateInstruction,
  collectAvailableSignals,
  diagnoseChinesePostInput,
  extractEntities,
  extractCodeSwitches,
  extractNumbers,
  extractQuotedPhrases,
  extractRepeatedOpeners,
  getPatternCardId,
  inferContentOwnership,
  inferSignalType,
  detectSpeechMoves,
  selectChinesePostStrategies
};
