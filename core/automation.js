import { normalizeDraftQueue, queueNeedsNormalization } from '../utils/queueUtils.js';
import { normalizeGeneratedTweets, totalViralScore, evaluateGeneratedTweets } from '../utils/scoreUtils.js';
import { memoryValueToText } from '../utils/textUtils.js';
import { addLog, getConfigErrors, canAutoPublish } from './state.js';
import { callLLM } from '../services/llm.js';
import { DEFAULT_AGENT_MEMORY } from './constants.js';
import { buildGenerationContext, normalizeAgentMemory } from './generationContext.js';



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
    /场景|用户|成本|转化|留存|分发|验证|定价|交付|工作流|案例|反例|边界|清单|步骤/
  ].some(pattern => pattern.test(value));
}





async function generateSingleTweetDraft() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([
      'apiKey', 'apiProvider', 'aiModel', 'isRunning',
      'isGenerating', 'engineLanguage', 'accountBio', 'agentMemory', 'competitorReport', 'onboardingStrategy', 'leadTarget',
      'aiPersona', 'styleTrainingData', 'aiMemory', 'feedbackLoopData', 'feedbackLikes', 'feedbackDislikes'
    ], async (config) => {
      if (!config.engineLanguage || config.engineLanguage === 'auto') config.engineLanguage = 'zh';
      const errors = getConfigErrors(config);
      if (!config.isRunning || errors.length > 0) {
        if (errors.length > 0) {
          addLog('warn', `配置不完整，无法生成内容：${errors.join('、')}`);
        }
        return reject(new Error("Not running or config errors"));
      }

      addLog('info', `正在即时生成推文...`);
      chrome.runtime.sendMessage({ action: "generationStatus", status: true }).catch(() => {});
      
      const generationContext = buildGenerationContext(config, { promptType: 'auto_post' });
      const persona = generationContext.persona || {};
      const memoryContext = generationContext.agentMemoryPrompt;
      const performanceMemoryContext = generationContext.performanceMemoryPrompt;
    const playbookContext = generationContext.playbookPrompt;
    const reportContext = generationContext.competitorReportPrompt;

    let styleConstraint = generationContext.stylePrompt;
    
    const langConstraint = config.engineLanguage === 'en' ? '【语言约束】：必须使用英文 (English) 撰写内容。' :
                           config.engineLanguage === 'ja' ? '【语言约束】：必须使用日语 (Japanese) 撰写内容。' :
                           config.engineLanguage === 'es' ? '【语言约束】：必须使用西班牙语 (Spanish) 撰写内容。' :
                           config.engineLanguage === 'id' ? '【语言约束】：必须使用印尼语 (Indonesian) 撰写内容。' :
                           config.engineLanguage === 'zh' ? '【语言约束】：必须使用中文撰写内容。' : '';
                           
    const uniquenessConstraint = '';
    const randomSeed = `\n[System Random Batch Seed: ${Date.now()}-${Math.random().toString(36).substring(2)}]`;
    
    const outputLangInstruction = config.engineLanguage === 'en' ? 'ENGLISH (en)' :
                                  config.engineLanguage === 'ja' ? 'JAPANESE (ja)' :
                                  config.engineLanguage === 'es' ? 'SPANISH (es)' :
                                  config.engineLanguage === 'id' ? 'INDONESIAN (id)' : 'CHINESE (zh)';

    const prompt = `你是这个账号的 X 内容操盘手，目标不是"写得完整"，而是写出更像 X 原生内容、能被停留/转发/评论/关注的候选推文。
你要像赛道里的内容操盘手，而不是公众号编辑、品牌公关或普通 AI 助手。

账号简介：
${config.accountBio || '暂无'}

账号画像定位：
- 目标用户：${persona.targetUsers || '未填写'}
- 账号人设与语气：${persona.characteristics || '未填写'}
- 发推策略：${persona.goals || '未填写'}
${styleConstraint}
长期记忆，必须优先遵守：
${memoryContext}
${playbookContext}

发布表现记忆（Loop），必须用于修正选题、Hook、结构和预测直觉：
${performanceMemoryContext}

${reportContext}
${generationContext.editFeedbackPrompt}
${generationContext.preferencePrompt}
${langConstraint}
${uniquenessConstraint}
${randomSeed}

内容质量与排版硬门槛：
- 【排版与长度多样化】：大部分必须以“短帖”和“中短帖”为主（像一个真实活人的即兴发言），偶尔可以有稍长的结构化干货。拒绝清一色的长篇大论。
- 【引用并发言】：偶尔（约 10% 的比例）请使用“引用+短评”的格式。即：先用引号引用一句行业里常见的暴论、刻板印象、别人的观点或新闻，然后在下面给出你极简、犀利的短评（不需要太长）。
- 每条必须有一个明确“信息增量”：具体场景、数字、对比、反例、动作步骤、判断标准、成本/收益结构中的至少一个。
- 第一行 Hook 必须让目标用户停住，禁止“今天聊聊/分享一下/随着/在当今/大家都知道”。
- 不发空泛态度：禁止“很重要/值得关注/未来可期/非常有潜力”这种没有新信息的句子。
- 不发营销硬广：产品/资料入口只能做低压转化，并且必须先给读者一个有用判断。
- 不编造不可验证数据、客户、收益、融资、经历；可以写“我会这样判断/可以这样验证”。
- 每条只服务一个传播目标：涨粉、收藏、信任、互动、转化，不要混成大杂烩。

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
- 反常识判断：大多数人以为 A，真正决定结果的是 B。
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
          // Perfect candidate found
          chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});
          return resolve(topCandidate.text);
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
    
    // If we exhausted retries, try to return the best attempt we had, even with issues
    if (bestAttempt && bestAttempt.text) {
      return resolve(bestAttempt.text);
    } else {
      addLog('error', `推文生成彻底失败，经历多次重试仍无可用内容。最后反馈：${lastFeedback}`);
      return reject(new Error("No valid tweet generated after retries"));
    }
    }); // Close chrome.storage.local.get
  }); // Close Promise
}
export { generateSingleTweetDraft, hasConcreteSignal, isResourceSeekingTweet, normalizeAgentMemory, mergeAgentMemory, LOW_VALUE_REPLY_PATTERNS, FORBIDDEN_CLAIM_PATTERNS };
