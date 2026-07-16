import { extractEntities, extractNumbers } from './postStrategies.js';

const TEMPLATE_PATTERNS = [
  /最反直觉的一点(?:是)?/,
  /最真实的一点(?:是)?/,
  /最残酷的一点(?:是)?/,
  /底层逻辑(?:是|在于)/,
  /真正的真相(?:是)?/,
  /本质上|本质是/,
  /谁更懂底层/,
  /活到(?:了)?下半场/,
  /划重点|冷知识|你发现了吗/
];

const LECTURE_OPENING_PATTERN = /^(?:真正重要的是|真正的问题是|本质上|说到底|归根结底|记住|你要明白|大多数人|很多人之所以)/;
const PAIRED_SLOGAN_PATTERN = /[^。！？\n]{1,18}决定[^。！？\n]{1,20}[，,；;][^。！？\n]{1,18}决定/;
const DIRECTIVE_PATTERN = /你(?:应该|必须|一定要|要|得|千万)/g;
const CONTENT_FARM_PATTERN = /王炸|炸裂|恐怖(?:的)?(?:查看|数据|能力|增长)?|绝对(?:是|必看)|必看(?:文章|清单|指南)?|彻底说透|颠覆认知|改命|黄金窗口|干货拉满|怪物级|还等什么|赶紧(?:上|冲|试)|真正能用的模型|兄弟们/;
const ERA_MANIFESTO_PATTERN = /这个时代(?:已经)?|未来已来|真正的拐点|时代的拐点|底层真相|新世界(?:已经|正在)|彻底告别过去|历史性的时刻|生产关系升级|重新定义一切/;
const STERILE_POLISH_PATTERN = /历史(?:周期|洪流).{0,12}(?:滚滚向前|不可阻挡)|时代浪潮|科技浪花|片刻高光|足矣|终将证明/;
const GENERIC_EMOTION_MARKERS = Object.freeze(['哈哈哈', '笑死', '太离谱了', '有点崩', '讲真', '说实话', '兄弟们']);
const OUTPUT_STEP_PATTERN = /(?:两|三|四|五|六|\d+)步|第一步|第二步|第三步|(?:^|\n)\s*[1-6一二三四五六][.、）)]/m;
const CONTRAST_PATTERN = /(?:不是|不在于|重要的不是|关键不是)[^。！？\n]{0,32}(?:而是|是在于|是)/g;

function buildChineseJudgeInstruction(diagnosis = {}) {
  const preservedExpressions = [...new Set([
    ...(diagnosis.humanTrace?.repeatedOpeners || []),
    ...(diagnosis.humanTrace?.codeSwitches || []),
    ...(diagnosis.humanTrace?.quotedPhrases || [])
  ])];
  return [
    '[中文 X Post Skill 独立评审]',
    '只返回有效 JSON。使用自然中文 X 表达标准，不使用通用作文标准。',
    `素材信号类型：${diagnosis.signalType || 'unknown'}；素材强度：${diagnosis.sourceStrength || 'weak'}。`,
    `素材归属：${diagnosis.ownership || 'unknown'}；口头思路轨迹：${diagnosis.speechMoves?.join('、') || '无'}。`,
    preservedExpressions.length
      ? `需要保留的混合语域、重复开头或个人词：${preservedExpressions.join('、')}。`
      : '素材没有要求保留的口头标记，不要额外表演口语。',
    '先看素材里的数字、对象、动作、产品行为、来源或限制有没有被保留，再看正文是否在该说完的地方停止。',
    '评分：观点与确定性忠实度 fidelity 25；具体信息 specificity 20；自然中文 naturalness 20；首句 hook 15；收藏/转发/讨论价值 audienceValue 10；账号匹配 accountFit 10。',
    '自然中文重点检查：像当事人边说边想，不像老师给所有人上课；保留素材已有的反问、自我修正、混合语域、重复列举和个人词。允许短、口语、情绪和不完整，不把语病少或结构完整等同于自然。',
    '硬失败不能被总分抵消：新增事实、伪造经历、丢掉强素材或口头思路轨迹、跑题、错语言、确定性升级、无来源步骤、时代宣言、过度抛光、伪造情绪、口语模板、内容农场腔、成组伪反差、翻译腔或说教腔。',
    `原素材类型：${diagnosis.family || 'unknown'}；确定性：${diagnosis.certainty || 'unknown'}。`,
    '本次只有一篇初稿。返回格式：{"selectedCandidateId":"candidate-a","scores":[{"id":"candidate-a","total":0,"fidelity":0,"specificity":0,"naturalness":0,"hook":0,"audienceValue":0,"accountFit":0,"hardFailures":[]}],"rationale":""}'
  ].join('\n');
}

function buildChineseRepairInstruction(diagnosis = {}, failures = []) {
  return [
    '[中文 X Post Skill 修复]',
    `只修复失败项：${JSON.stringify(Array.isArray(failures) ? failures : [failures])}。`,
    '不得借修复之名增加新事实、经历、对象、数字或更强结论。',
    '如果丢了素材信号，恢复原文已有的数字、对象、动作、产品行为、来源或限制。',
    '恢复素材已有的反问、重复开头、英文切换、个人词和未完成判断；不要把它们修成标准书面中文。',
    '如果像老师下结论，改成当事人的现场、实测、产品摩擦或短反应；没有必要时不要补结尾。',
    '删除时代宣言、历史周期式宏大收尾、素材没有的情绪表演、内容农场词、无来源步骤、成组对仗和“你应该”式命令。',
    diagnosis.certainty === 'uncertain' ? '恢复原素材的怀疑或可能语气。' : '',
    '返回修复后的正文，不解释。'
  ].filter(Boolean).join('\n');
}

function normalizedLength(text = '') {
  return String(text || '').replace(/\s+/g, '').length;
}

function hasUnsupportedNumbers(source = '', output = '') {
  const allowed = new Set(extractNumbers(source));
  return extractNumbers(output).some(number => !allowed.has(number));
}

function hasUnsupportedEntities(source = '', output = '') {
  const allowed = new Set(extractEntities(source).map(value => value.toLowerCase()));
  const universallyAllowed = new Set(['ai', 'x', 'saas', 'build', 'public', 'workflow', 'agent']);
  return extractEntities(output).some((entity) => {
    const normalized = entity.toLowerCase();
    return !allowed.has(normalized) && !universallyAllowed.has(normalized);
  });
}

function hasCertaintyEscalation(output = '', diagnosis = {}) {
  if (diagnosis.certainty !== 'uncertain') return false;
  if (/可能|也许|或许|未必|不一定|怀疑|看起来|似乎|我觉得|我猜|是否|会不会/.test(output)) return false;
  return /就是|一定|必然|根本原因|事实是|证明了|数据显示|毫无疑问|注定|都不会|根本不会/.test(output);
}

function hasInventedFirstPerson(output = '', diagnosis = {}) {
  if (diagnosis.hasFirstPersonExperience) return false;
  return /(?:我|我们).{0,8}(?:连续.{0,8}(?:做|用|试)|亲自|做了|用了|试了|花了|上线了|发布了|踩过|最后发现)/.test(output);
}

function hasLectureTone(output = '') {
  const text = String(output || '').trim();
  const directives = text.match(DIRECTIVE_PATTERN) || [];
  return LECTURE_OPENING_PATTERN.test(text)
    || PAIRED_SLOGAN_PATTERN.test(text)
    || directives.length >= 2;
}

function hasInventedSteps(output = '', diagnosis = {}) {
  return diagnosis.forbiddenStructures?.includes('invented_steps')
    && OUTPUT_STEP_PATTERN.test(String(output || ''));
}

function hasStackedContrast(output = '') {
  const matches = String(output || '').match(CONTRAST_PATTERN) || [];
  return matches.length >= 2;
}

function hasConcreteSignalDropped(output = '', diagnosis = {}) {
  if (diagnosis.sourceStrength !== 'strong') return false;
  const genericEntities = new Set(['ai', 'agent', 'workflow', 'build', 'public']);
  const anchors = [
    ...(diagnosis.numbers || []),
    ...(diagnosis.entities || [])
      .filter(value => !/^https?:\/\//i.test(value))
      .filter(value => !genericEntities.has(String(value).toLowerCase()))
  ];
  if (anchors.length === 0) return false;
  const normalized = String(output || '').toLowerCase();
  return !anchors.some(anchor => normalized.includes(String(anchor).toLowerCase()));
}

function hasGenericEmotion(source = '', output = '') {
  return GENERIC_EMOTION_MARKERS.some(marker => (
    String(output).includes(marker) && !String(source).includes(marker)
  ));
}

function hasHumanTraceDropped(output = '', diagnosis = {}) {
  const text = String(output || '');
  if (diagnosis.speechMoves?.includes('self_questioning')
      && !/[？?]|可能|也许|或许|未必|不一定|怀疑|么|吗|吧/.test(text)) {
    return true;
  }
  const repeatedOpeners = diagnosis.humanTrace?.repeatedOpeners || [];
  return repeatedOpeners.some((opener) => {
    const matches = text.match(new RegExp(opener, 'g')) || [];
    return matches.length < 2;
  });
}

function evaluateChinesePostOutput(source = '', output = '', diagnosis = {}) {
  const text = String(output || '').trim();
  const issues = [];
  if (!text) issues.push('empty_output');
  if (hasUnsupportedNumbers(source, text)) issues.push('unsupported_number');
  if (hasUnsupportedEntities(source, text)) issues.push('unsupported_entity');
  if (hasCertaintyEscalation(text, diagnosis)) issues.push('certainty_escalation');
  if (hasInventedFirstPerson(text, diagnosis)) issues.push('invented_first_person');
  if (TEMPLATE_PATTERNS.some(pattern => pattern.test(text))) issues.push('template_tone');
  if (hasLectureTone(text)) issues.push('lecture_tone');
  if (CONTENT_FARM_PATTERN.test(text)) issues.push('content_farm_tone');
  if (ERA_MANIFESTO_PATTERN.test(text)) issues.push('era_manifesto');
  if (STERILE_POLISH_PATTERN.test(text)) issues.push('sterile_polish');
  if (hasGenericEmotion(source, text)) issues.push('generic_emotion');
  if (hasHumanTraceDropped(text, diagnosis)) issues.push('human_trace_dropped');
  if (hasInventedSteps(text, diagnosis)) issues.push('invented_steps');
  if (hasStackedContrast(text)) issues.push('stacked_contrast');
  if (hasConcreteSignalDropped(text, diagnosis)) issues.push('concrete_signal_dropped');
  const sourceLength = Math.max(1, normalizedLength(source));
  const maxRatio = Number(diagnosis.targetLength?.maxRatio) || 1.5;
  if (normalizedLength(text) / sourceLength > maxRatio) issues.push('excessive_expansion');
  return {
    approved: issues.length === 0,
    issues: [...new Set(issues)],
    expansionRatio: normalizedLength(text) / sourceLength
  };
}

export {
  TEMPLATE_PATTERNS,
  DIRECTIVE_PATTERN,
  CONTENT_FARM_PATTERN,
  ERA_MANIFESTO_PATTERN,
  STERILE_POLISH_PATTERN,
  LECTURE_OPENING_PATTERN,
  OUTPUT_STEP_PATTERN,
  PAIRED_SLOGAN_PATTERN,
  buildChineseJudgeInstruction,
  buildChineseRepairInstruction,
  evaluateChinesePostOutput,
  hasCertaintyEscalation,
  hasConcreteSignalDropped,
  hasGenericEmotion,
  hasHumanTraceDropped,
  hasInventedSteps,
  hasInventedFirstPerson,
  hasLectureTone,
  hasStackedContrast,
  hasUnsupportedEntities,
  hasUnsupportedNumbers
};
