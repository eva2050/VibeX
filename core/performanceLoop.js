import { POST_CONTENT_MODE, POST_STATUS, normalizeAiMemory, normalizePostRecord } from './storageSchema.js';


function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function roundToNiceNumber(num) {
  if (num >= 10000) return Math.round(num / 1000) * 1000;
  if (num >= 1000) return Math.round(num / 100) * 100;
  return Math.max(10, Math.round(num / 50) * 50);
}

function getPrimaryMetric(metrics = {}) {
  return Number(metrics.views) || 0;
}

function getPerformanceMetrics(item = {}) {
  const stored = item.performanceMetrics || {};
  return {
    views: Number(item.actualViews ?? stored.views) || 0,
    likes: Number(stored.likes) || 0,
    replies: Number(stored.replies) || 0,
    reposts: Number(stored.reposts) || 0,
    bookmarks: Number(stored.bookmarks) || 0,
    follows: Number(stored.follows) || 0
  };
}

function getReviewedPosts(vault = [], currentId = '') {
  return (Array.isArray(vault) ? vault : [])
    .filter(item => !item?.learningDisabled)
    .filter(item => !currentId || item.id !== currentId)
    .map(item => ({ item, views: getPrimaryMetric(getPerformanceMetrics(item)) }))
    .filter(entry => entry.views > 0)
    .sort((a, b) => {
      const aTime = Number(a.item.reviewedAt || a.item.savedAt || a.item.createdAt) || 0;
      const bTime = Number(b.item.reviewedAt || b.item.savedAt || b.item.createdAt) || 0;
      return bTime - aTime;
    });
}

function getBaseline(vault = [], currentId = '') {
  const reviewed = getReviewedPosts(vault, currentId)
    .map(entry => entry.views)
    .slice(0, 50)
    .sort((a, b) => a - b);

  if (reviewed.length === 0) {
    return { sampleCount: 0, averageViews: 0, medianViews: 0, p75Views: 0, p90Views: 0 };
  }

  const quantile = (q) => reviewed[Math.min(reviewed.length - 1, Math.floor((reviewed.length - 1) * q))];
  return {
    sampleCount: reviewed.length,
    averageViews: Math.round(reviewed.reduce((sum, value) => sum + value, 0) / reviewed.length),
    medianViews: quantile(0.5),
    p75Views: quantile(0.75),
    p90Views: quantile(0.9)
  };
}


function getCalibratedBaseline(vault = [], currentId = '') {
  return getBaseline(vault, currentId);
}

function scoreContentMultiplier(item = {}) {
  const text = item.text || '';
  const length = text.length;
  const lineCount = text.split('\n').filter(Boolean).length;
  const hasNumbers = /\d/.test(text);
  const hasQuestion = /[?？]/.test(text);
  const hasExternalLink = /https?:\/\//i.test(text);
  const hasStrongHook = /(stop|never|why|truth|mistake|secret|unpopular|hot take|别|不要|为什么|真相|错了|反常识|爆款|踩坑)/i.test(text);

  let multiplier = 1;
  if (length >= 80 && length <= 240) multiplier += 0.22;
  if (lineCount >= 3) multiplier += 0.18;
  if (hasNumbers) multiplier += 0.16;
  if (hasQuestion) multiplier += 0.14;
  if (hasStrongHook) multiplier += 0.42;
  if (hasExternalLink) multiplier -= 0.25;

  return {
    multiplier: clamp(multiplier, 0.55, 2.35),
    hasStrongHook,
    hasExternalLink,
    lineCount
  };
}



function classifyRelativePerformance(metrics = {}, baseline = {}) {
  const views = getPrimaryMetric(metrics);
  if (!views || !baseline.sampleCount) return 'unknown';
  if (baseline.p90Views && views >= baseline.p90Views) return 'top_decile';
  if (baseline.averageViews && views >= baseline.averageViews * 2) return 'breakout';
  if (baseline.averageViews && views < baseline.averageViews * 0.6) return 'below_baseline';
  return 'normal';
}

function inferContentFeatures(item = {}) {
  const text = String(item.text || '');
  const firstLine = text.split('\n').find(Boolean) || '';
  const lower = text.toLowerCase();
  const hasQuestion = /[?？]/.test(text);
  const hasLink = /https?:\/\//i.test(text);
  const hasNumber = /\d/.test(text);
  const hasList = /\n\s*[-•\d]/.test(text) || text.split('\n').filter(Boolean).length >= 4;
  const hasCTA = /(关注|评论|转发|收藏|私信|reply|comment|follow|dm|bookmark)/i.test(text);
  const hasContrarian = /(不是|别|不要|反常识|错了|unpopular|hot take|truth|mistake|never|stop)/i.test(text);
  const language = /[\u3400-\u9fff]/.test(text) ? 'zh' : 'en';
  // Priority-ordered, mutually exclusive classification. Previously these were
  // independent `if` statements, so whichever condition matched LAST silently
  // overwrote all earlier (often more meaningful) signals — e.g. a story that
  // ends with a question got mislabeled as reply_bait, or a playbook with a
  // CTA got mislabeled as soft_conversion. Priority below: an explicit
  // conversion ask is the strongest signal, then a first-person narrative,
  // then a structured list, then a genuine question, else default opinion.
  let contentType = 'short_opinion';
  if (hasCTA) {
    contentType = 'soft_conversion';
  } else if (/我|we|built|ship|复盘|踩坑|learned/i.test(lower)) {
    contentType = 'story';
  } else if (hasList) {
    contentType = 'playbook';
  } else if (hasQuestion) {
    contentType = 'reply_bait';
  }

  return {
    contentType,
    hookType: hasContrarian ? 'contrarian' : hasQuestion ? 'question' : hasNumber ? 'specific' : 'statement',
    goal: hasCTA ? 'conversion' : hasQuestion ? 'interaction' : hasList ? 'trust' : 'growth',
    language,
    hasQuestion,
    hasLink,
    hasNumber,
    hasList,
    hasCTA,
    firstLine: firstLine.slice(0, 100)
  };
}

function buildLearning(item, relativePerformance) {
  const text = item.text || '';
  const hasLink = /https?:\/\//i.test(text);
  const hasQuestion = /[?？]/.test(text);
  const hasStrongHook = /(stop|never|why|truth|mistake|secret|unpopular|hot take|别|不要|为什么|真相|错了|反常识|爆款|踩坑)/i.test(text);

  let reason = '';
  let next = '';

  if (relativePerformance === 'top_decile' || relativePerformance === 'breakout') {
    if (hasStrongHook) {
      reason = '具备强反差/情绪 Hook，抓住了用户注意力。';
      next = '继续复用这种制造信息落差或打破常规的开头结构。';
    } else if (hasQuestion) {
      reason = '抛出开放性问题，引发了有效互动。';
      next = '保留互动空间，不要把话说太满。';
    } else {
      reason = '行文精简且没有外链稀释流量，完读率好。';
      next = '保持短促有力的表达。';
    }
  } else if (relativePerformance === 'below_baseline') {
    if (hasLink) {
      reason = '正文直接带外链，触发了平台降权限制。';
      next = '核心观点留在正文，链接放进评论区。';
    } else if (!hasStrongHook) {
      reason = '开头过于平铺直叙，没有制造足够的冲突感或落差。';
      next = '第一句需要更尖锐的判断或反常识结论。';
    } else {
      reason = '话题本身缺乏延展性，未能引发共鸣。';
      next = '尝试切换更有痛点的主题。';
    }
  } else {
    reason = '发挥稳定，受众反馈符合日常均值。';
    next = '作为基准参考，可微调结构测试更好效果。';
  }

  return `Reason: ${reason} | Next: ${next}`;
}
function getPostFingerprint(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function buildLearningEvent(post, relativePerformance) {
  if (post?.learningDisabled || !post?.aiLearning || !relativePerformance || relativePerformance === 'normal' || relativePerformance === 'unknown') return null;
  const normalizedPost = normalizePostRecord(post);
  return {
    id: `${post.id || post.savedAt || Date.now()}-${post.reviewedAt || Date.now()}`,
    text: post.aiLearning,
    sourcePostId: post.id || String(post.savedAt || Date.now()),
    postText: getPostFingerprint(post.text),
    contentMode: normalizedPost.contentMode || POST_CONTENT_MODE.REWRITE,
    baseline: post.performanceBaseline || null,
    relativePerformance: post.relativePerformance || relativePerformance,
    contentFeatures: post.contentFeatures || inferContentFeatures(post),
    performanceMetrics: post.performanceMetrics || getPerformanceMetrics(post),
    actualViews: Number(post.actualViews) || 0,
    reviewedAt: post.reviewedAt || Date.now(),
    createdAt: Date.now()
  };
}

function summarizeRuleText(event = {}, features = {}) {
  if (event.text) return event.text;
  const status = event.performanceStatus === 'underestimated' ? 'outperformed' : 'underperformed';
  const contentType = features.contentType || 'post';
  const hookType = features.hookType || 'hook';
  const goal = features.goal || 'growth';
  const metricNotes = [];
  const metrics = event.performanceMetrics || {};
  if (metrics.bookmarks > 0) metricNotes.push(`${metrics.bookmarks} bookmarks`);
  if (metrics.replies > 0) metricNotes.push(`${metrics.replies} replies`);
  if (metrics.follows > 0) metricNotes.push(`${metrics.follows} follows`);
  const metricText = metricNotes.length ? ` with ${metricNotes.join(', ')}` : '';
  const baselineText = event.relativePerformance && event.relativePerformance !== 'unknown'
    ? ` (${event.relativePerformance})`
    : '';
  return `${contentType} posts with ${hookType} hooks for ${goal} ${status}${baselineText}${metricText}. ${event.text || ''}`.trim();
}

function compactLearningEventsIntoRules(events = [], existingRules = []) {
  const existingByText = new Map(
    (Array.isArray(existingRules) ? existingRules : [])
      .filter(rule => rule?.text)
      .map(rule => [rule.text, rule])
  );
  const grouped = new Map();

  (Array.isArray(events) ? events : []).forEach((event) => {
    const features = event.contentFeatures || {};
    const modeKey = [
      event.contentMode || POST_CONTENT_MODE.POST,
      features.contentType || 'unknown',
      features.hookType || 'unknown',
      features.goal || 'unknown',
      event.performanceStatus || 'unknown'
    ].join('|');
    const text = summarizeRuleText(event, features);
    if (!text) return;
    const existingRule = existingByText.get(text);
    const current = grouped.get(modeKey) || {
      text,
      modeKey,
      contentMode: event.contentMode || POST_CONTENT_MODE.POST,
      sampleCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      maxAbsDeviation: 0,
      lastDeviationRatio: 0,
      sourcePostIds: [],
      examples: [],
      createdAt: existingRule?.createdAt || event.createdAt || Date.now()
    };

    const ratio = Number(event.deviationRatio) || 0;
    current.sampleCount += 1;
    if (event.performanceStatus === 'underestimated') current.positiveCount += 1;
    if (event.performanceStatus === 'overestimated') current.negativeCount += 1;
    current.maxAbsDeviation = Math.max(current.maxAbsDeviation || 0, Math.abs(ratio));
    current.lastDeviationRatio = ratio;
    current.updatedAt = Math.max(Number(current.updatedAt) || 0, Number(event.reviewedAt || event.createdAt) || Date.now());
    if (event.sourcePostId && !current.sourcePostIds.includes(event.sourcePostId)) {
      current.sourcePostIds.push(event.sourcePostId);
    }
    if (event.postText && !current.examples.includes(event.postText)) {
      current.examples.push(event.postText);
    }
    grouped.set(modeKey, current);
  });

  existingByText.forEach((rule, text) => {
    const key = rule.modeKey || text;
    if (!grouped.has(key)) grouped.set(key, rule);
  });

  return Array.from(grouped.values())
    .map(rule => ({
      ...rule,
      contentMode: rule.contentMode || POST_CONTENT_MODE.POST,
      sourcePostIds: Array.isArray(rule.sourcePostIds) ? rule.sourcePostIds.slice(0, 8) : [],
      examples: Array.isArray(rule.examples) ? rule.examples.slice(0, 3) : [],
      confidence: Math.min(95, Math.round(35 + (Number(rule.sampleCount) || 1) * 12 + (Number(rule.maxAbsDeviation) || 0) * 20))
    }))
    .sort((a, b) => {
      const confidenceDiff = (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
      if (confidenceDiff !== 0) return confidenceDiff;
      return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
    })
    .slice(0, 12);
}

function updateAiMemoryWithReviewedPost(memory = {}, post = {}) {
  if (post?.learningDisabled) return normalizeAiMemory(memory);
  const existingEvents = Array.isArray(memory.learningEvents) ? memory.learningEvents.slice() : [];
  const event = buildLearningEvent(post, post.relativePerformance);
  const eventExists = event && existingEvents.some(item => item.id === event.id || (
    item.sourcePostId === event.sourcePostId && item.reviewedAt === event.reviewedAt
  ));
  const learningEvents = event && !eventExists
    ? [event, ...existingEvents].slice(0, 100)
    : existingEvents.slice(0, 100);
  const learnedRules = compactLearningEventsIntoRules(learningEvents, memory.learnedRules);
  return normalizeAiMemory({
    ...memory,
    learningEvents,
    learnedRules,
    lastReviewedAt: Date.now(),
    updatedAt: Date.now()
  });
}

function applyPerformanceReview(post = {}, metrics = {}, vault = []) {
  const normalizedMetrics = {
    views: Number(metrics.views) || 0,
    likes: Number(metrics.likes) || 0,
    replies: Number(metrics.replies) || 0,
    reposts: Number(metrics.reposts) || 0,
    bookmarks: Number(metrics.bookmarks) || 0,
    follows: Number(metrics.follows) || 0
  };
  if (!normalizedMetrics.views) return null;
  const baseline = getBaseline(vault, post.id);
  const relativePerformance = classifyRelativePerformance(normalizedMetrics, baseline);

  const updatedPost = normalizePostRecord({
    ...post,
    actualViews: normalizedMetrics.views,
    performanceMetrics: normalizedMetrics,
    performanceBaseline: baseline,
    relativePerformance: relativePerformance,
    contentFeatures: inferContentFeatures(post),
    status: POST_STATUS.REVIEWED,
    aiLearning: buildLearning(post, relativePerformance),
    reviewedAt: Date.now(),
    autoReviewedAt: metrics.autoReviewedAt || post.autoReviewedAt || Date.now()
  });
  return {
    post: updatedPost,
    baseline
  };
}

function buildAccountPerformanceBaseline(posts = []) {
  const baseline = getBaseline(posts);
  return {
    ...baseline,
    scannedAt: Date.now(),
    source: 'profile_scan'
  };
}

export {
  applyPerformanceReview,
  buildAccountPerformanceBaseline,
  buildLearning,
  classifyRelativePerformance,
  compactLearningEventsIntoRules,
  getBaseline,
  getCalibratedBaseline,
  getPerformanceMetrics,
  inferContentFeatures,
  updateAiMemoryWithReviewedPost
};
