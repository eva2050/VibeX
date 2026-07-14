import { normalizeDraftQueue, queueNeedsNormalization } from '../utils/queueUtils.js';
import { normalizeGeneratedTweets, totalViralScore, evaluateGeneratedTweets } from '../utils/scoreUtils.js';
import { memoryValueToText } from '../utils/textUtils.js';
import { addLog, getConfigErrors, canAutoPublish } from './state.js';
import { callLLM } from '../services/llm.js';
import { DEFAULT_AGENT_MEMORY } from './constants.js';
import { buildGenerationContext, normalizeAgentMemory } from './generationContext.js';
import { getLanguageInstruction, getLanguageName, normalizeEngineLanguage } from './i18n.js';
import { getBannedClichePhrasesRule } from './contentRules.js';
import { inferContentFeatures } from './performanceLoop.js';
import { POST_CONTENT_MODE } from './storageSchema.js';
import { buildStudioQualityGateRules, buildStudioTimeContext } from './studioPrompt.js';



function mergeAgentMemory(base = {}, incoming = {}) {
  const merged = normalizeAgentMemory(base);
  Object.keys(DEFAULT_AGENT_MEMORY).forEach((key) => {
    const value = memoryValueToText(incoming?.[key]).trim();
    if (value) {
      merged[key] = value;
    }
  });
  return merged;
}

const LOW_VALUE_REPLY_PATTERNS = [
  /^(说得对|确实|学习了|收藏了|mark|马克|很有启发|有道理|太真实了)[。！!]*$/i,
  /干货满满|值得关注|受教了|感谢分享|很棒的分享/,
  /这个方向很有潜力|未来可期|非常认同|深有同感/
];

const FORBIDDEN_CLAIM_PATTERNS = [
  /稳赚|保本|无风险|躺赚|暴富|财富自由/,
  /保证.{0,8}(涨粉|赚钱|收益|成交|转化)/,
  /(月入|日赚|年入)\s*\d+/,
  /100%|百分百/
];

function isResourceSeekingTweet(text = '') {
  const normalized = String(text || '').toLowerCase();
  return [
    /求|怎么|如何|哪里|推荐|有没有|发一下|给个|链接|资源|教程|工具|清单|模板|手册|pdf|repo|github/,
    /\b(need|looking for|how to|where can|anyone know|recommend|resource|tutorial|tool|template|link|guide|repo|github)\b/
  ].some(pattern => pattern.test(normalized));
}

function hasConcreteSignal(text = '') {
  const value = String(text || '');
  return [
    /\d/,
    /[一二三四五六七八九十]个/,
    /先.*再|不是.*而是|别.*先|关键是|核心是|本质是|更像是/,
    /场景|用户|成本|转化|留存|分发|验证|定价|交付|工作流|案例|反例|边界|清单|步骤/,
    /\b(cost|latency|speed|workflow|retention|conversion|pricing|distribution|constraint|context|trade-?off|edge case|bottleneck|benchmark|shipping|inference|memory|compute|bandwidth|margin|handoff|validation)\b/i
  ].some(pattern => pattern.test(value));
}





function buildUniquenessConstraint(draftVault) {
  const list = Array.isArray(draftVault) ? draftVault : [];
  const recentPosts = list
    .filter((item) => item && typeof item.text === 'string' && item.text.trim())
    .filter((item) => !item.contentMode || item.contentMode === POST_CONTENT_MODE.POST)
    .sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0))
    .slice(0, 8);

  if (recentPosts.length === 0) {
    return '';
  }

  const lines = recentPosts.map((item) => {
    const features = inferContentFeatures(item);
    const firstLine = features.firstLine || String(item.text).split('\n').find(Boolean) || '';
    return `- [${features.contentType}/${features.hookType}] ${firstLine}`;
  });

  return `近期已发布内容（禁止在题材、开头 Hook 或结构上重复，必须换新的具体切入点）：
${lines.join('\n')}`;
}

async function reviewGeneratedTweetQuality(text, config, persona = {}) {
  const reviewPrompt = buildAutoQualityReviewPrompt(text, persona);

  try {
    const raw = await callLLM(reviewPrompt, config, true);
    const cleaned = String(raw || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.approved !== 'boolean') {
      throw new Error('Review response missing approved boolean');
    }
    return { approved: parsed.approved, reason: String(parsed.reason || '').trim() };
  } catch (e) {
    // A broken safety-net call should not block an otherwise-good draft.
    addLog('warning', 'post_quality_review_call_failed', [e?.message || String(e)]);
    return { approved: true, reason: '' };
  }
}

function buildAutoQualityReviewPrompt(text = '', persona = {}) {
  return `你是一名严格、独立的 X 内容质量复核员，不是这条推文的作者。请你不要顾及情面，客观判断下面这条候选推文是否真的够格发布。

账号定位：${persona.characteristics || '未填写'}
目标用户：${persona.targetUsers || '未填写'}

候选推文原文：
"""
${text}
"""

复核标准（任意一条明显不达标就应判定不通过）：
- 是否有真实“信息增量”（具体场景、数字、对比、反例、可执行判断），而不是正确的废话
- 是否是模板腔/套话/AI 味明显的空洞表达
- 是否符合账号定位与目标用户，而不是放在任何账号下都成立的通用内容
- 是否有编造的不可验证数据、客户、收益、经历
- ${getBannedClichePhrasesRule()}
- ${buildStudioQualityGateRules('auto_post').replace(/\n+/g, ' ').trim()}

严格只返回 JSON，不要任何解释：
{"approved": true 或 false, "reason": "如果不通过，用一句话说明最主要的问题；如果通过，留空字符串"}`;
}

function buildAutoPostPrompt({
  config = {},
  generationContext = {},
  persona = {},
  memoryContext = '',
  performanceMemoryContext = '',
  topPerformanceContext = '',
  playbookContext = '',
  reportContext = '',
  styleConstraint = '',
  langConstraint = '',
  uniquenessConstraint = '',
  randomSeed = '',
  outputLangInstruction = ''
} = {}) {
  return `你是这个账号的 X 内容操盘手，目标是写出极度符合账号“活人感、具体观察、轻判断、自然短文”定位的原生推文。
你要像赛道里的真人内容创作者，绝对不能像公众号编辑、品牌公关或普通 AI 助手。
${buildStudioTimeContext()}

账号简介：
${config.accountBio || '暂无'}

账号画像定位：
- 目标用户：${persona.targetUsers || '未填写'}
- 账号定位：${persona.characteristics || '未填写'}
- 发推策略：${persona.goals || '未填写'}

【核心基准：优质推文样本 (Golden Cases)】：
发推策略与调性必须由以下样本决定。你必须且只能模仿这些样本的文风。
${styleConstraint}

【长期记忆，必须优先遵守】：
${memoryContext}
${playbookContext}

【表现复盘记忆 (Loop)】：
基于历史数据的教训，只用于避坑和复用有效结构；绝对不得把历史内容硬套成新主题：
${performanceMemoryContext}

【历史高表现参考】：
${topPerformanceContext || '暂无历史高表现样本。'}
仅供参考节奏，严禁学习它们的题材或观点。

${reportContext}
${generationContext.editFeedbackPrompt}
${generationContext.preferencePrompt}
${langConstraint}
${uniquenessConstraint}
${randomSeed}

内容质量与排版硬门槛：
- 【拒绝模板腔】：禁止使用反复出现的泛化开头，例如 "Most founders..."、"Most creators..."、"Most builders..."、"Most AI founders..."、"The dirty secret..."、"The real test..."、"Most people think..."。不要用“Most X are just Y”这类句式。
- 【选题必须具体】：优先来自账号真实上下文、产品迭代、具体观察、一次取舍、一个工作流细节或一个可验证判断。没有具体素材时写小观察，不要硬写创始人/创作者大词。
- 【排版与长度多样化】：大部分必须以“短帖”和“中短帖”为主（像一个真实活人的即兴发言），偶尔可以有稍长的结构化干货。拒绝清一色的长篇大论。
- 【引用并发言】：偶尔（约 10% 的比例）请使用“引用+短评”的格式。即：先用引号引用一句行业里常见的暴论、刻板印象、别人的观点或新闻，然后在下面给出你极简、犀利的短评（不需要太长）。
- 每条必须有一个明确“信息增量”：具体场景、数字、对比、反例、动作步骤、判断标准、成本/收益结构中的至少一个。
- 第一行 Hook 必须让目标用户停住，禁止“今天聊聊/分享一下/随着/在当今/大家都知道”。
- 不发空泛态度：禁止“很重要/值得关注/未来可期/非常有潜力”这种没有新信息的句子。
- 不发营销硬广：产品/资料入口只能做低压转化，并且必须先给读者一个有用判断。
- 不编造不可验证数据、客户、收益、融资、经历；可以写“我会这样判断/可以这样验证”。
- 每条只服务一个传播目标：涨粉、收藏、信任、互动、转化，不要混成大杂烩。
- ${getBannedClichePhrasesRule()}
${buildStudioQualityGateRules('auto_post')}

请生成 1 条推文。必须覆盖以下内容类型中的 1 类：
- short_opinion：极短的强观点/反常识吐槽，像活人的即兴发言
- quote_comment：引用一句别人的观点/现象，附加一两句犀利短评
- playbook：中短篇的框架/清单/工具/步骤，用于收藏和信任
- story：经历/复盘/Build in Public，用于人设和共鸣
- reply_bait：能引发评论或站队的问题/判断
- soft_conversion：低压产品/服务/行动入口，不硬广

每条推文必须像 X 原生表达：
- 开头第一行必须有 Hook，不要铺垫（除非是极短的情绪贴，可以直接开始）。
- 一条推文只讲一个判断。
- 少形容词，多具体场景、数字、对比、动作。
- 必须主动换行，适合手机阅读：Hook 单独一行；长句每 28-36 个中文字符切分；清单每项单独一行；逻辑块之间用一个空行。
- 不要把 3 个以上的判断塞进同一段，也不要写成公众号长段落。
- 不要承诺收益，不要编造客户/融资/数据，不要使用擦边或政治动员。
- 默认不用 hashtag；如果使用，最多 1 个，且必须自然。

优先使用这些高质量结构：
- 短平快吐槽：一句话揭露行业潜规则。
- 引用短评：“XXX” —— 事实并非如此，因为...
- 反常识判断：只在有具体场景时使用，不要套“大多数人以为 A，真正决定结果的是 B”模板。
- 可复制路径：适合谁 -> 怎么做 -> 如何验证 -> 失败信号。
- 案例拆解：观察到什么 -> 为什么有效 -> 普通人能学哪一步。
- 取舍复盘：我会放弃什么 -> 因为约束是什么 -> 下一步怎么试。
- 评论诱因：给一个明确选择题或判断题，而不是“你怎么看”。

给每条内容按 1-10 分自评：
- hook: 开头是否能让人停住
- shareability: 是否有转发理由
- replyTrigger: 是否能引发评论
- identity: 是否强化账号身份标签
- audienceFit: 是否精准击中目标用户
- nativeX: 是否像 X 原生表达

CRITICAL OUTPUT REQUIREMENT:
You MUST write all generated text in ${outputLangInstruction}! Ignore all Chinese examples in this prompt, they are just for structure. If ${outputLangInstruction} is not CHINESE (zh), YOU MUST NOT OUTPUT A SINGLE CHINESE CHARACTER IN THE "text" FIELD!

严格只返回 JSON 对象，不要额外解释：
{
  "tweets": [
    {
      "type": "opinion|playbook|story|reply_bait|soft_conversion",
      "text": "推文正文",
      "qualityRationale": "为什么这条有信息增量、适合当前账号、值得被转发/收藏/评论",
      "scores": {
        "hook": 8,
        "shareability": 8,
        "replyTrigger": 7,
        "identity": 8,
        "audienceFit": 9,
        "nativeX": 9
      }
    }
  ]
}`;
}

async function generateSingleTweetDraft() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([
      'apiKey', 'apiProvider', 'aiModel', 'isRunning',
      'isGenerating', 'engineLanguage', 'accountLanguage', 'accountBio', 'agentMemory', 'competitorReport', 'onboardingStrategy', 'leadTarget',
      'aiPersona', 'styleTrainingData', 'aiMemory', 'accountPerformanceBaseline', 'feedbackLoopData', 'feedbackLikes', 'feedbackDislikes',
      'draftVault'
    ], async (config) => {
      config.engineLanguage = normalizeEngineLanguage(
        (config.engineLanguage || 'auto') === 'auto' && config.accountLanguage ? config.accountLanguage : config.engineLanguage || 'auto',
        globalThis.navigator?.language || ''
      );
      const errors = getConfigErrors(config);
      if (!config.isRunning || errors.length > 0) {
        if (errors.length > 0) {
          addLog('warn', 'config_incomplete_content', [errors.join('、')]);
        }
        return reject(new Error("Not running or config errors"));
      }

      addLog('info', 'post_generation_started');
      chrome.runtime.sendMessage({ action: "generationStatus", status: true }).catch(() => {});

      const generationContext = buildGenerationContext(config, { promptType: 'auto_post' });
      const persona = generationContext.persona || {};
      const memoryContext = generationContext.agentMemoryPrompt;
      const performanceMemoryContext = generationContext.performanceMemoryPrompt;
      const topPerformanceContext = generationContext.topPerformancePrompt;
    const playbookContext = generationContext.playbookPrompt;
    const reportContext = generationContext.competitorReportPrompt;

    let styleConstraint = generationContext.stylePrompt;

    const langConstraint = getLanguageInstruction(config.engineLanguage, 'output', globalThis.navigator?.language || '');

    const uniquenessConstraint = buildUniquenessConstraint(config.draftVault);
    const randomSeed = `\n[System Random Batch Seed: ${Date.now()}-${Math.random().toString(36).substring(2)}]`;

    const outputLangInstruction = getLanguageName(config.engineLanguage, globalThis.navigator?.language || '');

    const prompt = buildAutoPostPrompt({
      config,
      generationContext,
      persona,
      memoryContext,
      performanceMemoryContext,
      topPerformanceContext,
      playbookContext,
      reportContext,
      styleConstraint,
      langConstraint,
      uniquenessConstraint,
      randomSeed,
      outputLangInstruction
    });

    let lastFeedback = '';
    const maxRetries = 5;
    let bestAttempt = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      let currentPrompt = prompt;
      if (lastFeedback) {
        currentPrompt += `\n\n【系统拦截与打回重做要求】：\n上一轮生成的草稿未能通过质量审查，原因如下：\n"${lastFeedback}"\n请你深刻反思，并在这一轮生成中绝对避免上述问题，提供一条高质量的新推文。`;
      }
      try {
        const generatedText = await callLLM(currentPrompt, config, true);
        const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedTweets = JSON.parse(cleanJsonStr);

        const evaluated = evaluateGeneratedTweets(parsedTweets);
        if (evaluated.length === 0) {
          lastFeedback = "未检测到有效文本内容，请确保在 JSON 中返回推文正文。";
          continue;
        }

        const topCandidate = evaluated[0];

        // Save the best candidate seen so far (highest score)
        if (!bestAttempt || topCandidate.score > bestAttempt.score) {
          bestAttempt = topCandidate;
        }

        if (!topCandidate.qualityIssue) {
          // Passed deterministic checks. Get an independent LLM review before
          // trusting the model's own self-assigned scores.
          const review = await reviewGeneratedTweetQuality(topCandidate.text, config, persona);
          if (review.approved) {
            chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});
            return resolve(topCandidate.text);
          } else {
            lastFeedback = review.reason || '独立复核认为该草稿信息增量不足或存在套话/模板腔，未通过质量把关。';
          }
        } else {
          // Has issues, feed back to next iteration
          lastFeedback = topCandidate.qualityIssue;
          // Silently retry in background
        }
      } catch (e) {
        lastFeedback = "JSON解析失败或API调用异常，请确保严格按照要求输出纯JSON格式。";
      }
    }

    chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});

    // Retries exhausted. Never publish a draft that failed the quality gate —
    // skip this round entirely and let the normal schedule retry next cycle.
    if (bestAttempt && bestAttempt.text) {
      addLog('error', 'post_generation_skipped_quality_gate', [bestAttempt.qualityIssue || lastFeedback || '']);
      return reject(new Error("Best attempt did not pass quality gate; skipping this round"));
    } else {
      addLog('error', 'post_generation_failed_retry_exhausted', [lastFeedback]);
      return reject(new Error("No valid tweet generated after retries"));
    }
    }); // Close chrome.storage.local.get
  }); // Close Promise
}
export {
  generateSingleTweetDraft,
  hasConcreteSignal,
  isResourceSeekingTweet,
  normalizeAgentMemory,
  mergeAgentMemory,
  LOW_VALUE_REPLY_PATTERNS,
  FORBIDDEN_CLAIM_PATTERNS,
  buildUniquenessConstraint,
  buildAutoPostPrompt,
  buildAutoQualityReviewPrompt,
  reviewGeneratedTweetQuality
};
