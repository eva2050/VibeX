with open('content/x_scraper.js', 'r') as f:
    lines = f.readlines()

destructuring = """
const {
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
} = window.VibeXEvaluator;
"""

lines.insert(41, destructuring)

with open('content/x_scraper.js', 'w') as f:
    f.writelines(lines)
