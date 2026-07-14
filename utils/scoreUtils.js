import { countPatternMatches, compactWhitespace, visualLength, formatTweetForX, memoryValueToText } from './textUtils.js';
import { hasConcreteSignal, isResourceSeekingTweet, LOW_VALUE_REPLY_PATTERNS, FORBIDDEN_CLAIM_PATTERNS } from '../core/automation.js';
function scoreNumber(value, fallback = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, n));
}

function scoreObject(scores = {}) {
  return {
    hook: scoreNumber(scores.hook),
    shareability: scoreNumber(scores.shareability),
    replyTrigger: scoreNumber(scores.replyTrigger),
    identity: scoreNumber(scores.identity),
    audienceFit: scoreNumber(scores.audienceFit),
    nativeX: scoreNumber(scores.nativeX)
  };
}

function totalViralScore(scores = {}) {
  const s = scoreObject(scores);
  return s.hook + s.shareability + s.replyTrigger + s.identity + s.audienceFit + s.nativeX;
}

function bestViralCandidate(candidates = [], fallback = '') {
  if (!Array.isArray(candidates) || candidates.length === 0) return formatTweetForX(fallback);
  const normalized = candidates
    .map(candidate => ({
      text: formatTweetForX(candidate?.text || candidate),
      scores: scoreObject(candidate?.scores || {}),
      rationale: memoryValueToText(candidate?.rationale)
    }))
    .filter(candidate => candidate.text);

  normalized.sort((a, b) => totalViralScore(b.scores) - totalViralScore(a.scores));
  return normalized[0]?.text || formatTweetForX(fallback);
}

function evaluateGeneratedTweets(parsed) {
  const rawItems = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.tweets) ? parsed.tweets : []);
  return rawItems
    .map(item => {
      if (typeof item === 'string') {
        return { text: formatTweetForX(item), type: 'unknown', scores: scoreObject({}), score: totalViralScore({}) };
      }
      const scores = scoreObject(item?.scores || {});
      return {
        text: formatTweetForX(item?.text),
        type: memoryValueToText(item?.type || item?.contentType || 'unknown'),
        scores,
        score: totalViralScore(scores),
        rationale: memoryValueToText(item?.qualityRationale || item?.rationale)
      };
    })
    .filter(item => item.text)
    .map(item => ({
      ...item,
      qualityIssue: getGeneratedTweetRejectionReason(item.text) || (item.score < 42 ? `AI 质量自评得分过低 (${item.score}/60)，未达到 42 分发布门槛` : '')
    }))
    .sort((a, b) => b.score - a.score);
}

function normalizeGeneratedTweets(parsed) {
  return evaluateGeneratedTweets(parsed).filter(item => !item.qualityIssue);
}
export { scoreNumber, scoreObject, totalViralScore, bestViralCandidate, normalizeGeneratedTweets, evaluateGeneratedTweets, getGeneratedTweetRejectionReason, getGeneratedReplyRejectionReason };

function getGeneratedTweetRejectionReason(text = '') {
  const normalized = compactWhitespace(text);
  const lower = normalized.toLowerCase();
  if (!normalized) return '推文为空';
  if (visualLength(normalized) < 24) return '推文过短，缺少可传播信息';
  if (visualLength(normalized) > 620) return '推文过长，容易变成公众号段落';
  if (isTemplateLikePost(normalized, lower)) return '推文句式过于模板化，像 AI 批量内容';
  if (FORBIDDEN_CLAIM_PATTERNS.some(pattern => pattern.test(normalized))) {
    return '推文包含不允许的收益或确定性承诺';
  }
  if (countPatternMatches(normalized, /#/g) > 2) return '推文包含过多标签';
  if (!hasConcreteSignal(normalized)) {
    return '推文缺少具体场景、数字、对比、动作或判断标准';
  }
  const firstLine = normalized.split('\n').find(Boolean) || '';
  if (visualLength(firstLine) > 42) return '首行 Hook 过长';
  if (/^(今天聊聊|分享一下|简单说说|大家都知道|随着|在当今)/.test(firstLine)) {
    return '首行 Hook 太像普通文章开头';
  }
  return '';
}

function getGeneratedReplyRejectionReason(reply = '', tweet = '') {
  const normalized = String(reply || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return 'AI 回复为空';
  if (visualLength(reply) > 110) return 'AI 回复过长';
  if (isTemplateLikeReply(reply, normalized)) return 'AI 回复句式过于模板化';
  if (hasUnsupportedHardData(reply, tweet)) return 'AI 回复疑似编造数据或机构事实';
  if (countPatternMatches(reply, /#/g) > 1) return 'AI 回复包含过多标签';
  if (LOW_VALUE_REPLY_PATTERNS.some(pattern => pattern.test(normalized))) {
    return 'AI 回复缺少信息增量';
  }
  if (FORBIDDEN_CLAIM_PATTERNS.some(pattern => pattern.test(reply))) {
    return 'AI 回复包含不允许的收益或确定性承诺';
  }
  if (!hasConcreteSignal(reply) && !hasLightReplySignal(reply)) {
    return 'AI 回复过于泛泛，缺少具体判断、边界或动作';
  }

  const strongLeadPatterns = [
    /看.*主页/,
    /翻.*主页/,
    /主页.*(有|见|拿|领)/,
    /私信|dm我|发我消息/,
    /关注我|follow me/,
    /link in bio|check my bio/,
    /领取|加我|联系我/
  ];
  if (!isResourceSeekingTweet(tweet) && strongLeadPatterns.some(pattern => pattern.test(normalized))) {
    return 'AI 回复包含强引流话术，但原推没有明确求资源';
  }
  return '';
}

function hasUnsupportedHardData(reply = '', tweet = '') {
  const replyText = String(reply || '');
  const tweetText = String(tweet || '');
  const hardDataPatterns = [
    /\b20\d{2}\s*(?:年)?\s*Q[1-4]\b/i,
    /\bQ[1-4]\s*20\d{2}\b/i,
    /\d+(?:\.\d+)?\s*%/,
    /\d+(?:\.\d+)?\s*(?:万|亿|k|m|b)\b/i,
    /\b(?:Chainalysis|Gartner|McKinsey|BCG|Bain|Forrester|IDC|CB Insights|PitchBook)\b/i,
    /数据显示|报告显示|研究显示|追踪的|according to|data shows|report shows/i
  ];
  const replyHasHardData = hardDataPatterns.some(pattern => pattern.test(replyText));
  if (!replyHasHardData) return false;
  return !hardDataPatterns.some(pattern => pattern.test(tweetText));
}

function isTemplateLikePost(text = '', lower = '') {
  const firstLine = text.split('\n').find(Boolean) || text;
  const firstLower = firstLine.toLowerCase();
  return [
    /^most\s+(founders|creators|builders|ai founders|ai builders|people)\b/,
    /^the\s+(real test|dirty secret|missing angle|key point)\b/,
    /^most\s+.+\s+are\s+just\s+/,
    /most\s+people\s+think.+(but|yet)/,
    /大多数人以为.+真正决定/,
    /真正决定结果的是/
  ].some(pattern => pattern.test(firstLower) || pattern.test(lower));
}

function isTemplateLikeReply(reply = '', normalized = '') {
  const first = String(reply || '').trim().split('\n').find(Boolean) || '';
  const firstLower = first.toLowerCase();
  return [
    /^(missing angle|sharpen|real experience|next step|key point)\s*[:：]/,
    /^the\s+(real test|dirty secret)\b/,
    /^this is where\b/
  ].some(pattern => pattern.test(firstLower) || pattern.test(normalized));
}

function hasLightReplySignal(reply = '') {
  const text = String(reply || '').trim();
  const lower = text.toLowerCase();
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  if (/[?？]/.test(text) && (wordCount >= 5 || text.length >= 12)) return true;
  return /\b(cost|latency|speed|workflow|retention|conversion|pricing|distribution|constraint|context|trade-?off|edge case|bottleneck|benchmark|shipping|inference|memory|compute|bandwidth|margin|validation)\b/i.test(lower);
}
