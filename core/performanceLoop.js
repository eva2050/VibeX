import { POST_STATUS, normalizeAiMemory, normalizePostRecord } from './storageSchema.js';
import {
  buildPerformanceObservation,
  deriveLearningRules,
  getFeatureKey
} from './learningPolicy.js';


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
  if (baseline.sampleCount < 5) return 'insufficient_data';
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

function buildLearning(item = {}, relativePerformance = '') {
  const features = item.contentFeatures || inferContentFeatures(item);
  const featureKey = getFeatureKey({ contentFeatures: features });
  if (relativePerformance === 'insufficient_data') {
    return 'Not enough comparable samples yet. Stored as an observation; no performance rule was created.';
  }
  if (relativePerformance === 'above_cohort') {
    return `${featureKey} was associated with above-cohort performance in this comparable sample. This is not a causal conclusion.`;
  }
  if (relativePerformance === 'below_cohort') {
    return `${featureKey} was associated with below-cohort performance in this comparable sample. This is not a causal conclusion.`;
  }
  return 'Performance was within the comparable cohort range. No performance rule was created.';
}

function compactLearningEventsIntoRules(events = [], existingRules = []) {
  const comparableEvents = (Array.isArray(events) ? events : [])
    .filter(event => event?.objective && event?.contentMode && event?.engineLanguage);
  return deriveLearningRules(comparableEvents, existingRules);
}

function updateAiMemoryWithReviewedPost(memory = {}, post = {}) {
  if (post?.learningDisabled) return normalizeAiMemory(memory);
  const existingEvents = Array.isArray(memory.learningEvents) ? memory.learningEvents.slice() : [];
  const event = post.performanceObservation || null;
  const eventExists = event && existingEvents.some(item => item.id === event.id || (
    item.sourceId === event.sourceId && item.observedAt === event.observedAt
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
  const contentFeatures = inferContentFeatures(post);
  const comparableHistory = (Array.isArray(vault) ? vault : [])
    .filter(item => item?.id !== post.id)
    .filter(item => !item?.learningDisabled)
    .filter(item => getPerformanceMetrics(item).views > 0)
    .map((item) => {
      if (item.performanceObservation) return item.performanceObservation;
      const itemFeatures = item.contentFeatures || inferContentFeatures(item);
      return {
        id: `history-${item.id || item.savedAt}`,
        sourceId: item.id || '',
        objective: item.objective || '',
        contentMode: item.contentMode || '',
        engineLanguage: item.engineLanguage || item.language || itemFeatures.language || 'unknown',
        featureKey: getFeatureKey({ contentFeatures: itemFeatures }),
        contentFeatures: itemFeatures,
        metrics: getPerformanceMetrics(item),
        observedAt: Number(item.reviewedAt || item.publishedAt || item.savedAt) || 0
      };
    });
  const observationInput = normalizePostRecord({
    ...post,
    contentFeatures,
    featureKey: getFeatureKey({ contentFeatures }),
    engineLanguage: post.engineLanguage || post.language || contentFeatures.language || 'unknown'
  });
  const performanceObservation = buildPerformanceObservation(
    observationInput,
    normalizedMetrics,
    comparableHistory
  );
  const relativePerformance = performanceObservation.relativePerformance;

  const updatedPost = normalizePostRecord({
    ...post,
    actualViews: normalizedMetrics.views,
    performanceMetrics: normalizedMetrics,
    performanceBaseline: baseline,
    relativePerformance: relativePerformance,
    contentFeatures,
    engineLanguage: observationInput.engineLanguage,
    performanceObservation,
    status: POST_STATUS.REVIEWED,
    aiLearning: buildLearning({ ...post, contentFeatures }, relativePerformance),
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
