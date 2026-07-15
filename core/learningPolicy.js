import { RULE_STATE } from './storageSchema.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COHORT_SIZE = 50;
const MIN_CANDIDATE_SAMPLES = 5;
const MIN_ACTIVE_SAMPLES = 8;
const MIN_DIRECTIONAL_CONSISTENCY = 0.7;
const DEMOTION_CONSISTENCY = 0.55;
const MIN_EFFECT_RATIO = 0.2;
const RULE_TTL_MS = 90 * DAY_MS;

function sameCohort(left = {}, right = {}) {
  return String(left.objective || '') === String(right.objective || '')
    && String(left.contentMode || '') === String(right.contentMode || '')
    && String(left.engineLanguage || left.language || 'unknown') === String(right.engineLanguage || right.language || 'unknown');
}

function getFeatureKey(item = {}) {
  if (item.featureKey) return String(item.featureKey);
  const features = item.contentFeatures || {};
  return [features.contentType, features.hookType, features.goal]
    .filter(Boolean)
    .join('|') || 'unknown|unknown|unknown';
}

function getComparableCohort(item = {}, observations = [], limit = MAX_COHORT_SIZE) {
  return (Array.isArray(observations) ? observations : [])
    .filter(entry => sameCohort(item, entry))
    .sort((a, b) => Number(b.observedAt || b.reviewedAt || 0) - Number(a.observedAt || a.reviewedAt || 0))
    .slice(0, limit);
}

function median(values = []) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function normalizeMetrics(metrics = {}) {
  return {
    views: Number(metrics.views) || 0,
    likes: Number(metrics.likes) || 0,
    replies: Number(metrics.replies) || 0,
    reposts: Number(metrics.reposts) || 0,
    bookmarks: Number(metrics.bookmarks) || 0,
    follows: Number(metrics.follows) || 0
  };
}

function contentPerformanceScore(metrics = {}, baseline = {}) {
  const normalized = normalizeMetrics(metrics);
  const weights = {
    views: 1,
    likes: 2,
    replies: 3,
    reposts: 4,
    bookmarks: 4
  };
  return Object.entries(weights).reduce((score, [key, weight]) => {
    const denominator = Math.max(1, Number(baseline[key]) || 0);
    return score + weight * (normalized[key] / denominator);
  }, 0);
}

function buildPerformanceObservation(item = {}, metrics = {}, observations = [], now = Date.now()) {
  const cohort = getComparableCohort(item, observations);
  const metricKeys = ['views', 'likes', 'replies', 'reposts', 'bookmarks'];
  const baselineMetrics = Object.fromEntries(metricKeys.map((key) => [
    key,
    median(cohort.map(entry => normalizeMetrics(entry.metrics || entry.performanceMetrics)[key]))
  ]));
  const normalizedMetrics = normalizeMetrics(metrics);
  const score = contentPerformanceScore(normalizedMetrics, baselineMetrics);
  const cohortScores = cohort.map(entry => contentPerformanceScore(
    entry.metrics || entry.performanceMetrics,
    baselineMetrics
  ));
  const baselineScore = median(cohortScores);
  const liftRatio = baselineScore > 0 ? (score - baselineScore) / baselineScore : 0;
  const direction = liftRatio >= MIN_EFFECT_RATIO
    ? 'positive'
    : liftRatio <= -MIN_EFFECT_RATIO
      ? 'negative'
      : 'neutral';

  return {
    id: `obs-${item.id || now}-${now}`,
    sourceId: item.id || '',
    generationId: item.generationId || '',
    objective: item.objective || '',
    contentMode: item.contentMode || '',
    engineLanguage: item.engineLanguage || item.language || 'unknown',
    featureKey: getFeatureKey(item),
    contentFeatures: item.contentFeatures || {},
    metrics: normalizedMetrics,
    cohortSize: cohort.length,
    baselineMetrics,
    score,
    baselineScore,
    liftRatio,
    direction,
    relativePerformance: cohort.length < MIN_CANDIDATE_SAMPLES
      ? 'insufficient_data'
      : direction === 'positive'
        ? 'above_cohort'
        : direction === 'negative'
          ? 'below_cohort'
          : 'normal',
    observedAt: now
  };
}

function getRuleKey(item = {}) {
  return [
    item.objective || '',
    item.contentMode || '',
    item.engineLanguage || item.language || 'unknown',
    getFeatureKey(item)
  ].join('|');
}

function buildAssociationText({ engineLanguage, objective, featureKey, direction }) {
  return `In comparable ${engineLanguage} ${objective} content, ${featureKey} was associated with ${direction === 'positive' ? 'higher' : 'lower'} performance.`;
}

function deriveLearningRules(observations = [], existingRules = [], now = Date.now()) {
  const groups = new Map();
  (Array.isArray(observations) ? observations : []).forEach((observation) => {
    const key = getRuleKey(observation);
    groups.set(key, [...(groups.get(key) || []), observation]);
  });
  const existingByKey = new Map(
    (Array.isArray(existingRules) ? existingRules : []).map(rule => [rule.ruleKey || getRuleKey(rule), rule])
  );
  const nextRules = [];

  groups.forEach((group, key) => {
    const existing = existingByKey.get(key);
    existingByKey.delete(key);
    if (group.length < MIN_CANDIDATE_SAMPLES) {
      if (existing) nextRules.push(existing);
      return;
    }
    const positive = group.filter(item => item.direction === 'positive');
    const negative = group.filter(item => item.direction === 'negative');
    const dominant = positive.length >= negative.length ? positive : negative;
    const direction = positive.length >= negative.length ? 'positive' : 'negative';
    const consistency = dominant.length / group.length;
    const medianEffect = median(dominant.map(item => Math.abs(Number(item.liftRatio) || 0)));

    if (existing?.ruleState === RULE_STATE.ACTIVE
      && group.length >= MIN_ACTIVE_SAMPLES
      && consistency < DEMOTION_CONSISTENCY) {
      nextRules.push({
        ...existing,
        sampleCount: group.length,
        consistency,
        medianEffect,
        ruleState: RULE_STATE.DEMOTED,
        active: false,
        updatedAt: now
      });
      return;
    }

    if (consistency < MIN_DIRECTIONAL_CONSISTENCY || medianEffect < MIN_EFFECT_RATIO) {
      if (existing) nextRules.push(existing);
      return;
    }

    const exemplar = group[0] || {};
    const ruleState = group.length >= MIN_ACTIVE_SAMPLES || existing?.approvedAt
      ? RULE_STATE.ACTIVE
      : RULE_STATE.CANDIDATE;
    nextRules.push({
      ...(existing || {}),
      id: existing?.id || `rule-${key}`,
      ruleKey: key,
      objective: exemplar.objective || '',
      contentMode: exemplar.contentMode || '',
      engineLanguage: exemplar.engineLanguage || exemplar.language || 'unknown',
      featureKey: getFeatureKey(exemplar),
      direction,
      text: buildAssociationText({
        engineLanguage: exemplar.engineLanguage || exemplar.language || 'unknown',
        objective: exemplar.objective || '',
        featureKey: getFeatureKey(exemplar),
        direction
      }),
      sampleCount: group.length,
      consistency,
      medianEffect,
      ruleState,
      active: ruleState === RULE_STATE.ACTIVE,
      updatedAt: Math.max(now, ...group.map(item => Number(item.observedAt) || 0)),
      expiresAt: now + RULE_TTL_MS
    });
  });

  existingByKey.forEach((rule) => {
    if (rule.ruleState === RULE_STATE.ACTIVE && Number(rule.expiresAt) > 0 && Number(rule.expiresAt) <= now) {
      nextRules.push({ ...rule, ruleState: RULE_STATE.EXPIRED, active: false });
      return;
    }
    nextRules.push(rule);
  });

  return nextRules
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 24);
}

function selectActiveRules(rules = [], context = {}, now = Date.now(), limit = 3) {
  return (Array.isArray(rules) ? rules : [])
    .filter(rule => rule.ruleState === RULE_STATE.ACTIVE)
    .filter(rule => rule.active)
    .filter(rule => Number(rule.expiresAt) > now)
    .filter(rule => sameCohort(rule, context))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, limit);
}

export {
  DEMOTION_CONSISTENCY,
  MAX_COHORT_SIZE,
  MIN_ACTIVE_SAMPLES,
  MIN_CANDIDATE_SAMPLES,
  MIN_DIRECTIONAL_CONSISTENCY,
  MIN_EFFECT_RATIO,
  RULE_TTL_MS,
  buildPerformanceObservation,
  contentPerformanceScore,
  deriveLearningRules,
  getComparableCohort,
  getFeatureKey,
  sameCohort,
  selectActiveRules
};
