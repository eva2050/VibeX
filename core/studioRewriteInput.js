import { getBannedClichePhrasesRule } from './contentRules.js';

function detectInputLanguage(text = '') {
  const source = String(text || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/\[从链接[^\]]*\]/g, ' ')
    .replace(/\[用户补充说明\]/g, ' ')
    .replace(/\[extracted from link[^\]]*\]/gi, ' ')
    .replace(/\[user note\]/gi, ' ');
  if (/[\u3400-\u9fff]/.test(source)) return 'zh';
  if (/[\u3040-\u30ff]/.test(source)) return 'ja';
  if (/[¿¡ñáéíóúü]/i.test(source)) return 'es';
  if (/[A-Za-z]/.test(source)) return 'en';
  return '';
}

function buildInputLockedRewriteRules(text = '', outputLang = '') {
  const detectedLang = detectInputLanguage(text);
  const inputLength = String(text || '').replace(/\s+/g, ' ').trim().length;
  const maxChineseChars = inputLength <= 90 ? 120 : inputLength <= 220 ? 220 : 360;
  const languageNames = { zh: '中文', en: 'English', ja: 'Japanese', es: 'Spanish', id: 'Indonesian' };
  const languageRule = detectedLang
    ? `输入语言是 ${languageNames[detectedLang] || detectedLang}，只用于理解；最终输出必须遵守后台 Engine Language。`
    : '最终输出必须遵守后台 Engine Language，只重写表达。';
  return `\n\n【最高优先级 - 输入锁定】：
1. 【待处理文本】是本次唯一主题来源，必须围绕它改写。
2. 严禁把账号高表现样本、账号简介、产品名或历史记忆当成本次主题。
3. 严禁无中生有改成与原文无关的产品发布或创业宣言。
4. 历史样本只能参考节奏、Hook 强度和排版，不能替换主题。
5. ${languageRule}
6. 不得新增原文没有的核心事件、对象、结论或行动号召。
7. 不得把怀疑、吐槽、反问或主观感受升级成确定事实。
8. 不要强行套用历史样本里的隐喻、对象关系或结尾金句。
9. 长度预算：本次输出最多约 ${maxChineseChars} 个中文字符。
10. 如果输入很短，输出也要保持短；不要扩写成长帖。
11. 排版预算：社会性现象可使用“排比金句结构”；其余情况默认 1 段，最多 2 段。
12. 禁用没有信息量的空话套壳：${getBannedClichePhrasesRule()}`;
}

function buildStudioRewriteInput({
  sourceText = '',
  config = {},
  generationContext = {},
  contentSkill = null,
  ...overrides
} = {}) {
  return {
    promptType: 'viral_rewrite',
    sourceText,
    config,
    generationContext,
    engineLanguage: config.engineLanguage || 'auto',
    inputLockConstraint: buildInputLockedRewriteRules(sourceText, config.engineLanguage),
    includePerformanceMemory: true,
    contentSkill,
    ...overrides
  };
}

export { buildInputLockedRewriteRules, buildStudioRewriteInput, detectInputLanguage };
