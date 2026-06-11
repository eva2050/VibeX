(function() {
'use strict';

const SEARCH_DISCOVERY_LOOKBACK_DAYS = 7;
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
const DEFAULT_DISCOVERY_KEYWORDS_ZH = {
  ai_product_kol: ['AI工具', 'AI Agent', '提示词', 'AI自动化', 'Cursor', 'Claude', 'ChatGPT'],
  monetization_global: ['AI副业', 'AI出海', 'AI工具变现', '小产品变现', 'Cursor创业', 'SaaS出海', '独立开发者 AI'],
  indie_builder: ['独立开发者 AI', 'Build in Public', 'SaaS MRR', 'Cursor MVP', 'Product Hunt', '小产品上线'],
  research_growth: ['AI 投资', '产品增长', '市场趋势', '增长框架', '商业模式', '创始人洞察'],
  brand_official: ['AI产品', '产品发布', '用户案例', '产品更新', '工作流自动化', '效率工具']
};
const DEFAULT_DISCOVERY_KEYWORDS_EN = {
  ai_product_kol: ['AI Tools', 'AI Agent', 'Prompts', 'AI Automation', 'Cursor', 'Claude', 'ChatGPT'],
  monetization_global: ['AI Side Hustle', 'Global AI', 'AI Monetization', 'Micro SaaS', 'Cursor startup', 'SaaS global', 'Indie Hacker AI'],
  indie_builder: ['Indie Hacker AI', 'Build in Public', 'SaaS MRR', 'Cursor MVP', 'Product Hunt', 'Micro SaaS Launch'],
  research_growth: ['AI Investment', 'Product Growth', 'Market Trends', 'Growth Frameworks', 'Business Models', 'Founder Insights'],
  brand_official: ['AI Product', 'Product Launch', 'Use Cases', 'Product Updates', 'Workflow Automation', 'Productivity Tools']
};

function isLowValueReplyTarget(text = '') {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return true;

  const engagementBaitPatterns = [
    /\bjust say\b/,
    /\bsay ["']?hey["']?\b/,
    /\bneed .*impressions?\b/,
    /\bthank me later\b/,
    /\breply\b.*\b(i|me|this|below)\b/,
    /\bcomment\b.*\b(i|me|below|for)\b/,
    /\bdrop\b.*\b(reply|comment|handle|link)\b/,
    /\bfollow (me|for|back)\b/,
    /\blike (and|&)?\s*(rt|repost|share)\b/,
    /\b(rt|repost) (if|and|to)\b/,
    /\bwho wants\b/,
    /\btag someone\b/,
    /转发.*抽/,
    /评论.*领取/,
    /回复.*领取/,
    /求.*互/
  ];

  if (engagementBaitPatterns.some(pattern => pattern.test(normalized))) return true;

  const words = normalized.split(/\s+/).filter(Boolean);
  const hasUrlOnly = /https?:\/\/|pic\.x\.com|t\.co\//.test(normalized) && words.length < 10;
  const tooShort = normalized.length < 28 && words.length < 8;
  const mostlyEmojiOrPunctuation = normalized.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{P}\p{S}\s]/gu, '').length < 8;
  return hasUrlOnly || tooShort || mostlyEmojiOrPunctuation;
}

function parseTargetHandles(text = '') {
  return String(text || '')
    .split(/[\s,，、\n]+/)
    .map(item => item.trim().replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '').replace(/^@/, '').split('/')[0])
    .filter(item => /^[A-Za-z0-9_]{1,15}$/.test(item))
    .map(item => item.toLowerCase());
}

function inferStrategyArchetype(state = {}) {
  const strategy = state.onboardingStrategy || {};
  const memory = state.agentMemory || {};
  const persona = state.aiPersona || {};
  const signal = [
    strategy.strategyArchetype,
    strategy.sourceInput,
    persona.targetUsers,
    persona.characteristics,
    persona.goals,
    memory.contentPillars,
    memory.contentAngles,
    memory.marketPosition
  ].join('\n').toLowerCase();

  if (DEFAULT_INTERACTION_TARGETS[strategy.strategyArchetype]) return strategy.strategyArchetype;
  if (/leobai825|levelsio|出海|搞钱|副业|变现|monetization|income/.test(signal)) return 'monetization_global';
  if (/indie|独立开发|build in public|mrr|saas/.test(signal)) return 'indie_builder';
  if (/研究|投资|增长|research|vc|market|趋势/.test(signal)) return 'research_growth';
  if (/brand|official|品牌|官网|产品官方/.test(signal)) return 'brand_official';
  return 'ai_product_kol';
}

function getDefaultInteractionTargets(state = {}) {
  return DEFAULT_INTERACTION_TARGETS[inferStrategyArchetype(state)] || DEFAULT_INTERACTION_TARGETS.ai_product_kol;
}

function getDefaultDiscoveryKeywords(state = {}) {
  const lang = state.onboardingStrategy?.preferredLanguage || 'zh-CN';
  const isEnglish = lang.startsWith('en');
  const dict = isEnglish ? DEFAULT_DISCOVERY_KEYWORDS_EN : DEFAULT_DISCOVERY_KEYWORDS_ZH;
  return dict[inferStrategyArchetype(state)] || dict.indie_builder;
}

function collectTargetHandles(state = {}) {
  const memory = state.agentMemory || {};
  return [...new Set([
    ...parseTargetHandles(state.targetUsers),
    ...parseTargetHandles(memory.interactionTargets),
    ...parseTargetHandles(getDefaultInteractionTargets(state).join('\n'))
  ])];
}

function parseDiscoveryKeywords(text = '') {
  return String(text || '')
    .split(/[\n,，、]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2 && item.length <= 80);
}

function collectDiscoveryKeywords(state = {}) {
  const memory = state.agentMemory || {};
  return [...new Set([
    ...parseDiscoveryKeywords(memory.discoveryKeywords),
    ...getDefaultDiscoveryKeywords(state)
  ])].slice(0, 12);
}

function getSearchLanguageOperator(state = {}) {
  const lang = state.onboardingStrategy?.preferredLanguage || 'zh-CN';
  if (lang === 'en') return 'lang:en';
  if (lang === 'ja') return 'lang:ja';
  if (lang === 'ko') return 'lang:ko';
  return 'lang:zh';
}

function detectKeywordLanguage(keyword = '') {
  const clean = keyword.replace(/["'\s]/g, '');
  const hasCJK = /[\u3400-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(clean);
  const hasLatin = /[a-zA-Z]{2,}/.test(clean);
  if (hasCJK && !hasLatin) return 'cjk';
  if (hasLatin && !hasCJK) return 'latin';
  return 'mixed';
}

function getLangFilterForKeyword(keyword, defaultLang) {
  const kwLang = detectKeywordLanguage(keyword);
  if (kwLang === 'latin') return 'lang:en';
  if (kwLang === 'cjk') return defaultLang;
  return '';  // mixed — don't filter by language
}

function getSearchThresholds(state = {}) {
  const lang = state.onboardingStrategy?.preferredLanguage || 'zh-CN';
  const isChinese = lang === 'zh-CN' || lang === 'zh-TW';
  return isChinese
    ? { minFaves: 20, minRetweets: 0, minReplies: 0, minViews: 0 }
    : { minFaves: 40, minRetweets: 0, minReplies: 0, minViews: 0 };
}

function getRecentSinceDate(days = SEARCH_DISCOVERY_LOOKBACK_DAYS) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function quoteSearchTerm(term = '') {
  const clean = String(term || '').trim().replace(/"/g, '');
  if (!clean) return '';
  if (isAdvancedSearchQuery(clean)) {
    return clean;
  }
  if (/[\u3400-\u9fff]/.test(clean)) {
    return /\s/.test(clean) ? `(${clean})` : clean;
  }
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

function isAdvancedSearchQuery(value = '') {
  return /\b(min_faves|min_retweets|from|lang|filter|since|until):|\bOR\b/i.test(String(value || ''));
}

function getNegativeSearchOperators(state = {}) {
  const memory = state.agentMemory || {};
  const signal = [
    state.onboardingStrategy?.strategyArchetype,
    state.onboardingStrategy?.sourceInput,
    memory.marketPosition,
    memory.contentPillars,
    memory.contentAngles,
    memory.coreOpinions
  ].join('\n').toLowerCase();
  if (/web3|crypto|defi|nft|blockchain|token|链上|加密|币圈/.test(signal)) return '';
  return [
    '-web3', '-crypto', '-defi', '-nft', '-airdrop', '-token', '-btc', '-eth',
    '-币圈', '-加密', '-链上', '-空投', '-撸毛', '-钱包', '-合约', '-铭文',
    '-链游', '-土狗', '-sol', '-solana'
  ].join(' ');
}

function buildDiscoverySearchQueries(state = {}) {
  const keywords = collectDiscoveryKeywords(state);
  const defaultLang = getSearchLanguageOperator(state);
  const { minFaves, minRetweets, minReplies } = getSearchThresholds(state);
  const since = getRecentSinceDate();
  const negative = getNegativeSearchOperators(state);
  
  const filters = [`min_faves:${minFaves}`];
  if (minRetweets > 0) filters.push(`min_retweets:${minRetweets}`);
  if (minReplies > 0) filters.push(`min_replies:${minReplies}`);
  filters.push(`-filter:replies -filter:retweets since:${since} ${negative}`);
  const coreFilters = filters.join(' ').trim();
  
  const groupedQueries = [];
  for (let i = 0; i < keywords.length; i += 3) {
    const group = keywords.slice(i, i + 3);
    const groupTerms = group.map(kw => quoteSearchTerm(kw)).filter(Boolean);
    if (groupTerms.length === 0) continue;
    // Detect best language filter for this group
    const langs = group.map(kw => detectKeywordLanguage(kw));
    const allLatin = langs.every(l => l === 'latin');
    const allCJK = langs.every(l => l === 'cjk');
    const groupLang = allLatin ? 'lang:en' : (allCJK ? defaultLang : '');
    groupedQueries.push(`${groupTerms.join(' OR ')} ${groupLang} ${coreFilters}`.replace(/\s+/g, ' ').trim());
  }
  const topicQueries = keywords
    .map(keyword => {
      const term = quoteSearchTerm(keyword);
      if (!term) return '';
      if (isAdvancedSearchQuery(term)) {
        const langPart = /\blang:/i.test(term) ? '' : defaultLang;
        const sincePart = /\bsince:/i.test(term) ? '' : `since:${since}`;
        return `${term} ${langPart} -filter:replies -filter:retweets ${sincePart} ${negative}`.trim();
      }
      const kwLang = getLangFilterForKeyword(keyword, defaultLang);
      return `${term} ${kwLang} ${coreFilters}`.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
  const accountQueries = collectTargetHandles(state)
    .filter(handle => !PROJECT_ACCOUNT_HANDLES.has(handle.toLowerCase()))
    .slice(0, 6)
    .map(handle => `from:${handle} min_faves:${minFaves} min_replies:${minReplies} -filter:replies -filter:retweets since:${since} ${negative}`.trim());
  return [...new Set([...groupedQueries, ...topicQueries, ...accountQueries])].slice(0, 18);
}

function isSensitiveReplyTarget(text = '') {
  const normalized = String(text || '').toLowerCase();
  return [
    /\b(trump|biden|hunter biden|maga|democrat|republican|election|president|congress|senate)\b/,
    /\b(gaza|israel|palestine|ukraine|russia|war|military)\b/,
    /总统|大选|民主党|共和党|拜登|特朗普|川普|战争|军事|俄乌|巴以|以色列|巴勒斯坦|加沙/
  ].some(pattern => pattern.test(normalized));
}

function collectTopicKeywords(state = {}) {
  const memory = state.agentMemory || {};
  const persona = state.aiPersona || {};
  const strategy = state.onboardingStrategy || {};
  const base = [
    // English
    'ai', 'agent', 'chatgpt', 'claude', 'gemini', 'openai', 'llm', 'prompt',
    'automation', 'workflow', 'tool', 'startup', 'founder', 'indie', 'saas',
    'product', 'growth', 'marketing', 'monetization', 'mrr', 'build in public',
    'creator', 'research', 'investment', 'vc',
    // Chinese
    '人工智能', '模型', '提示词', '自动化', '工作流', '工具', '创业', '创始人',
    '独立开发', '产品', '增长', '营销', '获客', '流量', '出海', '搞钱', '副业',
    '变现', '商业化', '用户', '付费', '研究', '投资', '复盘',
    // Japanese
    '人工知能', 'モデル', 'プロンプト', '自動化', 'ワークフロー', 'ツール', '起業', '創業者',
    'インディー開発', '製品', '成長', 'マーケティング', '集客', 'トラフィック', 'マネタイズ',
    '副業', '収益化', 'ユーザー', '支払い', '研究', '投資', '振り返り', 'スタートアップ',
    // Spanish
    'inteligencia artificial', 'modelo', 'automatización', 'flujo de trabajo', 'herramienta',
    'emprendimiento', 'fundador', 'desarrollo independiente', 'producto', 'crecimiento',
    'adquisición', 'tráfico', 'monetización', 'ingresos', 'usuarios', 'pago', 'investigación', 'inversión',
    // Indonesian
    'kecerdasan buatan', 'model', 'otomatisasi', 'alur kerja', 'alat', 'kewirausahaan', 'pendiri',
    'pengembangan independen', 'produk', 'pertumbuhan', 'pemasaran', 'akuisisi', 'lalu lintas',
    'monetisasi', 'pendapatan', 'pengguna', 'pembayaran', 'penelitian', 'investasi'
  ];
  const mapped = {
    insights: ['观点', '趋势', '判断', 'insights', 'trends', 'opinion', '見解', 'トレンド', '意見', 'perspectivas', 'tendencias', 'opinión', 'wawasan', 'tren', 'pendapat'],
    playbooks: ['方法', '框架', '清单', '实操', 'playbook', 'framework', 'checklist', 'guide', '方法', 'フレームワーク', 'チェックリスト', 'ガイド', 'método', 'marco', 'lista', 'guía', 'metode', 'kerangka', 'daftar', 'panduan'],
    stories: ['复盘', '经历', '故事', 'story', 'experience', 'review', 'ストーリー', '経験', '振り返り', 'historia', 'experiencia', 'revisión', 'cerita', 'pengalaman', 'ulasan'],
    curation: ['报告', '信息', '新闻', '拆解', 'report', 'news', 'teardown', 'レポート', 'ニュース', '分解', 'reporte', 'noticias', 'desglose', 'laporan', 'berita', 'rincian'],
    softPromo: ['产品', '工具', '案例', 'product', 'tool', 'case study', '製品', 'ツール', '事例', 'producto', 'herramienta', 'caso', 'produk', 'alat', 'kasus']
  };
  const configured = [
    persona.targetUsers,
    persona.characteristics,
    persona.goals,
    memory.contentPillars,
    memory.contentAngles,
    memory.audienceSegments,
    memory.audiencePains,
    strategy.contentCustom,
    strategy.audienceCustom
  ].join('\n');
  const extracted = configured
    .split(/[\s,，、。；;：:\n/|]+/)
    .map(item => item.trim().toLowerCase())
    .filter(item => item.length >= 2 && item.length <= 24);
  const strategyKeywords = Array.isArray(strategy.content)
    ? strategy.content.flatMap(item => mapped[item] || [])
    : [];
  return [...new Set([...base, ...strategyKeywords, ...extracted])];
}

function hasRelevantTopic(text = '', state = {}) {
  const normalized = String(text || '').toLowerCase();
  return collectTopicKeywords(state).some(keyword => normalized.includes(keyword));
}

function hasStandaloneReplyPotential(text = '') {
  const normalized = String(text || '').toLowerCase();
  return [
    /不是.*而是|not .* but|really about|本质|关键|核心|真正/,
    /because|why|how|lesson|mistake|framework|playbook|workflow|case|example/,
    /为什么|如何|怎么|经验|教训|框架|路径|清单|案例|复盘|步骤|判断|标准|边界/,
    /\d+[.)、]|[一二三四五六七八九十]个/
  ].some(pattern => pattern.test(normalized));
}

function isLikelyProjectAccountLabel(label, handle) {
  if (PROJECT_ACCOUNT_HANDLES.has(String(handle || '').toLowerCase())) return true;
  const companySignals = [
    /\b(official|hq|labs|studio|team|protocol|network|foundation|inc\.?|corp\.?|company)\b/,
    /官方|项目方|基金会|实验室|协议|网络/
  ];
  return companySignals.some(pattern => pattern.test(String(label).toLowerCase()));
}

function parseMetricNumber(raw = '') {
  const text = String(raw || '').trim().replace(/,/g, '');
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)(万|千|[KkMm])?/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2] || '';
  if (unit === '万') return Math.round(value * 10000);
  if (unit === '千') return Math.round(value * 1000);
  if (unit.toLowerCase() === 'k') return Math.round(value * 1000);
  if (unit.toLowerCase() === 'm') return Math.round(value * 1000000);
  return Math.round(value);
}

function extractMetricFromText(text = '', labelPattern = '') {
  const metricPattern = '([0-9][0-9,.]*(?:\\.\\d+)?\\s*(?:万|千|[KkMm])?)';
  const patterns = [
    new RegExp(`${metricPattern}\\s*(?:${labelPattern})`, 'i'),
    new RegExp(`(?:${labelPattern})\\s*${metricPattern}`, 'i')
  ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    const parsed = parseMetricNumber(match?.[1]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function metricKnown(value) {
  return Number.isFinite(Number(value));
}

function summarizeMetrics(metrics = {}) {
  const parts = [];
  if (metricKnown(metrics.views)) parts.push(`浏览 ${metrics.views}`);
  if (metricKnown(metrics.likes)) parts.push(`赞 ${metrics.likes}`);
  if (metricKnown(metrics.reposts)) parts.push(`转发 ${metrics.reposts}`);
  if (metricKnown(metrics.replies)) parts.push(`回复 ${metrics.replies}`);
  return parts.join(' / ') || '无可读互动指标';
}

function hasStrongEngagement(metrics = {}, thresholds = {}) {
  return (metricKnown(metrics.views) && metrics.views >= thresholds.minViews)
    || (metricKnown(metrics.likes) && metrics.likes >= thresholds.minFaves)
    || (metricKnown(metrics.reposts) && metrics.reposts >= thresholds.minRetweets)
    || (metricKnown(metrics.replies) && metrics.replies >= thresholds.minReplies);
}

function scoreFreshness(ageMinutes) {
  if (ageMinutes === null) return { score: 4, label: '未知发布时间' };
  if (ageMinutes <= 30) return { score: 24, label: '30分钟内' };
  if (ageMinutes <= 120) return { score: 20, label: '2小时内' };
  if (ageMinutes <= 360) return { score: 14, label: '6小时内' };
  if (ageMinutes <= 1440) return { score: 6, label: '24小时内' };
  if (ageMinutes <= 2880) return { score: -8, label: '24小时以上' };
  return { score: -24, label: '48小时以上' };
}

window.VibeXEvaluator = {
  SEARCH_DISCOVERY_LOOKBACK_DAYS,
  DEFAULT_INTERACTION_TARGETS,
  PROJECT_ACCOUNT_HANDLES,
  DEFAULT_DISCOVERY_KEYWORDS_ZH,
  DEFAULT_DISCOVERY_KEYWORDS_EN,
  isLowValueReplyTarget,
  parseTargetHandles,
  inferStrategyArchetype,
  getDefaultInteractionTargets,
  getDefaultDiscoveryKeywords,
  collectTargetHandles,
  parseDiscoveryKeywords,
  collectDiscoveryKeywords,
  getSearchLanguageOperator,
  detectKeywordLanguage,
  getLangFilterForKeyword,
  getSearchThresholds,
  getRecentSinceDate,
  quoteSearchTerm,
  isAdvancedSearchQuery,
  getNegativeSearchOperators,
  buildDiscoverySearchQueries,
  isSensitiveReplyTarget,
  collectTopicKeywords,
  hasRelevantTopic,
  hasStandaloneReplyPotential,
  isLikelyProjectAccountLabel,
  parseMetricNumber,
  extractMetricFromText,
  metricKnown,
  summarizeMetrics,
  hasStrongEngagement,
  scoreFreshness
};

})();
