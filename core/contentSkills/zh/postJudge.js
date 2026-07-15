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

function buildChineseJudgeInstruction(diagnosis = {}) {
  return [
    '[中文 X Post Skill 独立评审]',
    '只返回有效 JSON。使用自然中文 X 表达标准，不使用通用作文标准。',
    '评分：观点与确定性忠实度 fidelity 25；具体信息 specificity 20；自然中文 naturalness 20；首句 hook 15；收藏/转发/讨论价值 audienceValue 10；账号匹配 accountFit 10。',
    '硬失败不能被总分抵消：新增事实、伪造经历、跑题、错语言、确定性升级、强套原文不支持的结构、明显营销号腔或翻译腔。',
    `原素材类型：${diagnosis.family || 'unknown'}；确定性：${diagnosis.certainty || 'unknown'}。`,
    '返回格式：{"selectedCandidateId":"candidate-a","scores":[{"id":"candidate-a","total":0,"fidelity":0,"specificity":0,"naturalness":0,"hook":0,"audienceValue":0,"accountFit":0,"hardFailures":[]}],"rationale":""}'
  ].join('\n');
}

function buildChineseRepairInstruction(diagnosis = {}, failures = []) {
  return [
    '[中文 X Post Skill 修复]',
    `只修复失败项：${JSON.stringify(Array.isArray(failures) ? failures : [failures])}。`,
    '不得借修复之名增加新事实、经历、对象、数字或更强结论。',
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

function evaluateChinesePostOutput(source = '', output = '', diagnosis = {}) {
  const text = String(output || '').trim();
  const issues = [];
  if (!text) issues.push('empty_output');
  if (hasUnsupportedNumbers(source, text)) issues.push('unsupported_number');
  if (hasUnsupportedEntities(source, text)) issues.push('unsupported_entity');
  if (hasCertaintyEscalation(text, diagnosis)) issues.push('certainty_escalation');
  if (hasInventedFirstPerson(text, diagnosis)) issues.push('invented_first_person');
  if (TEMPLATE_PATTERNS.some(pattern => pattern.test(text))) issues.push('template_tone');
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
  buildChineseJudgeInstruction,
  buildChineseRepairInstruction,
  evaluateChinesePostOutput,
  hasCertaintyEscalation,
  hasInventedFirstPerson,
  hasUnsupportedEntities,
  hasUnsupportedNumbers
};
