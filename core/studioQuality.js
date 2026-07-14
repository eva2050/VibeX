import { compactWhitespace, visualLength } from '../utils/textUtils.js';

const TEMPLATE_PATTERNS = [
  /^most\s+(founders|creators|builders|ai founders|ai builders|people)\b/i,
  /^the\s+(real test|dirty secret|missing angle|key point)\b/i,
  /^this is where\b/i,
  /^that'?s the edge\.?$/i,
  /most\s+.+\s+are\s+just\s+/i,
  /most\s+people\s+think.+(but|yet)/i,
  /大多数人以为.+真正决定/,
  /真正决定结果的是/,
  /最(反直觉|真实|残酷)的一点/,
  /本质上[，,:：]|本质是[，,:：]/,
  /底层逻辑是|真正的真相是|谁更懂底层/
];

const UNSUPPORTED_HARD_FACT_PATTERNS = [
  /\b20\d{2}\s*(?:年)?\s*Q[1-4]\b/i,
  /\bQ[1-4]\s*20\d{2}\b/i,
  /\d+(?:\.\d+)?\s*%/,
  /\d+(?:\.\d+)?\s*(?:万|亿|k|m|b)\b/i,
  /\b(?:Chainalysis|Gartner|McKinsey|BCG|Bain|Forrester|IDC|CB Insights|PitchBook)\b/i,
  /数据显示|报告显示|研究显示|追踪的|according to|data shows|report shows/i
];

const CONCRETE_SIGNAL_PATTERNS = [
  /\d/,
  /[二三四五六七八九十百千万亿][一二三四五六七八九十百千万亿]*[点个条天年月周次秒分钟小时]|[一二三四五六七八九十][十百千万亿]+[点个条天年月周次秒分钟小时]/,
  /不是.+而是|不是.+[，,]\s*是|不是因为.+是因为|表面.+实际|看起来.+其实/s,
  /可那又怎样|那又怎样|已经成立|值得/,
  /凌晨|半夜|加班|熬夜|通宵|deadline|上线|部署|重来|重写|跑不通|跑通|报错|写代码|改代码|提交|合并|review/,
  /场景|用户|成本|转化|留存|分发|验证|定价|交付|工作流|案例|反例|边界|步骤|取舍|约束|产品|数据|需求|社区|增长|开发|收入|存款|独立|出海|全球化|信息差|算法|焦虑|市场/,
  /\b(cost|latency|workflow|retention|conversion|pricing|distribution|constraint|trade-?off|bottleneck|shipping|validation|product|data|growth|revenue|market|algorithm)\b/i
];

function getNonEmptyLines(text = '') {
  return String(text || '').split('\n').map(line => line.trim()).filter(Boolean);
}

function hasUnsupportedHardFacts(output = '', input = '') {
  const outputText = String(output || '');
  const inputText = String(input || '');
  const outputHasHardFact = UNSUPPORTED_HARD_FACT_PATTERNS.some(pattern => pattern.test(outputText));
  if (!outputHasHardFact) return false;
  return !UNSUPPORTED_HARD_FACT_PATTERNS.some(pattern => pattern.test(inputText));
}

function hasConcreteSignal(text = '') {
  return CONCRETE_SIGNAL_PATTERNS.some(pattern => pattern.test(String(text || '')));
}

function hasTemplateTone(text = '') {
  const normalized = compactWhitespace(text);
  const firstLine = getNonEmptyLines(text)[0] || normalized;
  return TEMPLATE_PATTERNS.some(pattern => pattern.test(firstLine) || pattern.test(normalized));
}

function isOverSegmented(output = '', input = '') {
  const outputLines = getNonEmptyLines(output);
  if (outputLines.length < 5) return false;
  const inputLines = getNonEmptyLines(input);
  const outputLength = visualLength(output);
  const avgLineLength = outputLength / Math.max(1, outputLines.length);
  const looksLikeList = outputLines.some(line => /^[-•\d.]/.test(line));
  const inputLooksLikeEssay = inputLines.length >= 4 || visualLength(input) > 280;
  return !looksLikeList && !inputLooksLikeEssay && avgLineLength < 36;
}

function isOverExpanded(output = '', input = '') {
  const inputLength = Math.max(1, visualLength(input));
  const outputLength = visualLength(output);
  if (inputLength <= 80) return outputLength > 170;
  if (inputLength <= 220) return outputLength > Math.max(260, inputLength * 1.55);
  return outputLength > Math.max(420, inputLength * 1.35);
}

function assessStudioOutputQuality(input = '', output = {}, options = {}) {
  const text = typeof output === 'string' ? output : String(output?.text || '');
  const rules = options.rules || {};
  const issues = [];
  const normalized = compactWhitespace(text);

  if (!normalized) issues.push('empty_output');
  if (hasTemplateTone(text)) issues.push('template_tone');
  if (hasUnsupportedHardFacts(text, input)) issues.push('unsupported_hard_facts');
  if (isOverSegmented(text, input)) issues.push('over_segmented');
  if (isOverExpanded(text, input)) issues.push('over_expanded');
  if (rules.requireConcreteSignal !== false && !hasConcreteSignal(text)) issues.push('no_concrete_signal');
  if (rules.forbidMarkdown !== false && /(^|\n)\s*#{1,6}\s|\*\*|__|```/.test(text)) issues.push('markdown_artifacts');
  if (rules.forbidHashtags !== false && /(^|\s)#\S+/.test(text)) issues.push('hashtag');
  if (rules.maxLines && getNonEmptyLines(text).length > rules.maxLines) issues.push('too_many_lines');

  return {
    approved: issues.length === 0,
    issues,
    text
  };
}

export {
  assessStudioOutputQuality,
  hasConcreteSignal,
  hasTemplateTone,
  hasUnsupportedHardFacts,
  isOverExpanded,
  isOverSegmented
};
