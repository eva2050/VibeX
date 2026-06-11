import { callLLM } from '../services/llm.js';
import { addLog } from '../core/state.js';
import { buildGenerationContext } from '../core/generationContext.js';

export function handleLLMMessage(request, sender, sendResponse, context) {
  if (request.action === "testApiConnection") {
    if (request.apiKey && request.apiKey.startsWith('mock-')) {
      sendResponse({ success: false, error: 'ERR_MOCK_KEY_NOT_ALLOWED' });
      return true;
    }
    const pingPrompt = "ping";
    const provider = request.apiProvider || 'gemini';
    const defaultModels = {
      gemini: 'gemini-2.5-flash',
      deepseek: 'deepseek-chat',
      openai: 'gpt-4o-mini',
      openrouter: 'google/gemini-2.5-flash',
      qwen: 'qwen-plus'
    };
    chrome.storage.local.get(['aiModel'], (items) => {
      callLLM(pingPrompt, { 
        apiKey: request.apiKey, 
        apiProvider: provider, 
        aiModel: items.aiModel || defaultModels[provider] || 'gemini-2.5-flash' 
      }, false)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    });
    return true;
  } else if (request.action === "generateReply") {
    addLog('info', '收到回复生成请求，调用 AI 接口...');
    context.generateAIResponse(request.tweetContent || request.tweetText || '', request)
      .then(replyText => {
        addLog('success', 'AI 回复生成完成');
        sendResponse({ success: true, replyText, reply: replyText });
      })
      .catch(error => {
        addLog('error', `AI 接口调用失败: ${error.message}`);
        sendResponse({
          success: false,
          error: error.message,
          errorType: error.type || 'UNKNOWN',
          isApiCooldown: error.type === 'RATE_LIMIT'
        });
      });
    return true;
  } else if (request.action === "magicPrompt" || request.action === "extractAndRewrite") {
    const executeMagicPromptCore = (req, textToProcess, senderTab) => {
      chrome.storage.local.get([
        'apiKey', 'apiProvider', 'aiModel', 'styleTrainingData', 'engineLanguage',
        'feedbackLoopData', 'feedbackLikes', 'feedbackDislikes', 'replyStrategy',
        'customPromptGlobal', 'aiPersona', 'aiMemory', 'agentMemory',
        'accountBio', 'leadTarget', 'onboardingStrategy', 'competitorReport'
      ], (config) => {
        if (!config.apiKey || config.apiKey.trim() === '' || config.apiKey.startsWith('mock-')) {
          sendResponse({ success: false, error: 'ERR_MISSING_API_KEY' });
          return;
        }
        if (!config.engineLanguage || config.engineLanguage === 'auto') config.engineLanguage = navigator.language.startsWith('zh') ? 'zh' : 'en';
        const generationContext = buildGenerationContext(config, { promptType: req.promptType });
        let promptPrefix = '';
        const currentReplyStrategy = config.replyStrategy || '专业流：专业知识 / 数据';
        
        let strategyPrompt = '';
        if (currentReplyStrategy.includes('杠精')) {
          strategyPrompt = '你是一个极其犀利、专挑漏洞的“抬杠带师”和反直觉思考者。任务：回复这条推文。策略：1. 找出原推文逻辑最薄弱的一点进行精准打击；2. 抛出一个极其反直觉的犀利观点；3. 多用反问句引发争议和辩论。要求：一针见血，带点嘲讽感但不做人身攻击，字数控制在40字以内。';
        } else if (currentReplyStrategy.includes('专业')) {
          strategyPrompt = '你是一个在行业内深耕多年、极具洞察力的行业老兵。任务：客观且专业地回复这条推文。策略：1. 直接基于推文内容进行客观的专业分析，无论赞同还是反对都必须一针见血；2. 【关键】必须要补充一条极其硬核的冷知识、底层逻辑或具体数据来作为支撑。要求：不卑不亢，展现极高的专业素养和信息密度，字数控制在80字以内。';
        } else if (currentReplyStrategy.includes('极简')) {
          strategyPrompt = '你是一个极度厌恶长篇大论、浑身都是梗的网络乐子人。任务：回复这条推文。策略：1. 用一句极其精辟的吐槽、神级比喻或者互联网黑话来总结原推文；2. 绝不要分析，只要情绪价值和幽默感。要求：短平快，字数绝对不能超过15个字。';
        } else if (currentReplyStrategy.includes('自定义')) {
          strategyPrompt = config.customPromptGlobal || '你是一位专业的AI助手，请按照你的判断提供高质量回复。';
        } else {
          strategyPrompt = '你是一位混迹推特多年的资深真实网友。任务：请使用“' + currentReplyStrategy + '”的策略，为这条推文写一条高质量的破冰回复。要求：口语化，不要有AI味。';
        }

        const errorMsgText = config.engineLanguage === 'en' 
          ? '❌ Link content extraction failed, unable to rewrite. Please check if the link is valid, or try manually copying the core text.'
          : '❌ 链接内容提取失败，无法进行仿写。请检查链接是否有效，或尝试手动复制核心文字进行输入。';

        switch(req.promptType) {
          case 'draft_reply':
            promptPrefix = strategyPrompt + '\n\n绝对不要在输出中包含策略名本身，直接输出回复的正文内容。\n\n原推文：\n';
            break;

          case 'viral_rewrite':
            promptPrefix = `你是一位 X (Twitter) 千万级爆款操盘手。你的任务是对提供的【原始内容】进行“降维打击式”的网感重构，彻底迎合 X 平台的推荐算法。
不要生搬硬套固定的结构模板，请务必根据原文的【类型】和【长度】采取不同的改写策略：

1. 【短平快/情绪向】（原文如果是1-2句话的感叹、碎碎念、疑问、纯情绪发泄）：
   - 策略：保留“轻量感”和“情绪张力”。
   - 做法：直接改写成一句极具煽动性的暴论、扎心的反问、或幽默的吐槽。字数越少越好，一刀致命，用来骗高频点赞和回复。

2. 【中篇干货/经验感悟】（原文如果是几段日常观察或故事）：
   - 策略：利用“视觉呼吸感”拉高 Dwell Time（停留时间）。
   - 做法：使用“反常识钩子(Hook) + 极简短句 + 垂直大留白”结构。强制大量使用空行（每讲完一句核心逻辑就空一行），迫使读者滑动屏幕减速。

3. 【硬核长文/深度解析】（原文如果是长篇深度分析、数据、行业洞察）：
   - 策略：打造“书签诱饵（Bookmark Trigger）”。X 算法极度偏好高收藏量内容。
   - 做法：采用“一句震撼人心的结论 + 清晰的条目列表(Bullet points) + 颠覆性认知”的框架。信息密度极高，让人看一眼就忍不住点击收藏。

【强制流量与算法铁律】：
- 【拒绝外部链接】：如果你在原文中看到任何带有 "http" 或 "www" 的外部链接，请**直接将链接删除或用一句话概括其内容**，绝对不要在输出的正文中保留任何外链（外链会被 X 平台严厉降流限权）。
- 【禁止烂俗互动】：严禁任何“AI味”结尾（如“你觉得呢？”、“让我们一起探索”、“分享你的看法”）。
- 【无标签约束】：绝对禁止在正文生成任何 #标签 (Hashtag)。
- 必须有属于你人设的增量思考或态度，绝不能仅仅是同义词替换。

完成正文后必须立即停止输出！绝对禁止啰嗦。

【异常处理机制】：
如果【原始内容】明显是爬虫或提取工具的报错信息（例如“Watching a video link fail to load”、“系统无法解析”、“无法获取页面内容”、“请手动输入”等），请绝对不要进行仿写！你必须直接回复：“${errorMsgText}”

请直接输出重构后的高传播推文：

原始内容：
`;
            // Inject persona context for rewrite
            const persona = config.aiPersona || {};
            if (persona.characteristics || persona.goals) {
              promptPrefix = promptPrefix.replace('请直接输出重构后的高传播推文：', `【账号人设】：${persona.characteristics || '未填写'}\n【发推策略】：${persona.goals || '未填写'}\n\n请直接输出重构后的高传播推文：`);
            }
            break;
          case 'analyze_style':
            promptPrefix = '请帮我深度拆解以下推文的爆款结构、情绪价值和潜在可模仿点，输出一个可复用的写作框架：\n\n';
            break;
          case 'generate_art':
            promptPrefix = '你是一位顶级概念视觉导演。请根据下面推文的内容，生成一张用于社交媒体的高级概念海报。请直接输出一段可以喂给 Midjourney 的英文咒语。风格请选择“Vibrant corporate Memphis style (现代扁平矢量)” 或 “Monochrome conceptual poster (黑白高级极简版式)”。咒语需要极其详细，包含主体、构图、光影、色彩、氛围等：\n\n推文内容：\n';
            break;
          case 'profile_audit':
            promptPrefix = '你是一位千万粉博主操盘手。请根据下面这个推特大V的昵称和简介，对其账号门面进行“毒舌诊断”。请回答：1. 他是谁？ 2. 他分享什么？ 3. 关注他对我有什么好处？ 如果不清晰，请直接给出优化建议。\n\n账号资料：\n';
            break;
          default:
            promptPrefix = '请处理以下内容：\n';
        }
        
        let styleConstraint = ['viral_rewrite', 'draft_reply'].includes(req.promptType) ? generationContext.stylePrompt : '';
        
        let feedbackConstraint = generationContext.editFeedbackPrompt;

        let preferenceConstraint = generationContext.preferencePrompt;

        let performanceMemoryConstraint = '';
        if (req.promptType === 'viral_rewrite') {
          performanceMemoryConstraint = `\n【发布表现记忆】：以下规则来自用户过往 X post 的预测浏览量与实际浏览量偏差，请在这次重写时优先遵守，用它们修正选题、hook 和表达方式：\n${generationContext.performanceMemoryPrompt}\n`;
        }
        
        let langConstraint = '';
        const baseLangConstraint = () => {
          if (config.engineLanguage === 'en') return '\n【语言约束】：You MUST output in English.';
          if (config.engineLanguage === 'ja') return '\n【语言约束】：You MUST output in Japanese (日本語).';
          if (config.engineLanguage === 'es') return '\n【语言约束】：You MUST output in Spanish (Español).';
          if (config.engineLanguage === 'id') return '\n【语言约束】：You MUST output in Indonesian (Bahasa Indonesia).';
          if (config.engineLanguage === 'zh') return '\n【语言约束】：必须使用中文输出。';
          return '';
        };

        if (req.promptType === 'viral_rewrite') {
          if (config.engineLanguage === 'en') langConstraint = '\n【语言约束】：You MUST rewrite in English.';
          else if (config.engineLanguage === 'ja') langConstraint = '\n【语言约束】：You MUST rewrite in Japanese (日本語).';
          else if (config.engineLanguage === 'es') langConstraint = '\n【语言约束】：You MUST rewrite in Spanish (Español).';
          else if (config.engineLanguage === 'id') langConstraint = '\n【语言约束】：You MUST rewrite in Indonesian (Bahasa Indonesia).';
          else if (config.engineLanguage === 'zh') langConstraint = '\n【语言约束】：必须使用中文重写。';
          else langConstraint = '\n【语言约束】：请自动识别原文语言并使用相同语言重写。';
        } else if (req.promptType === 'draft_reply') {
          const origLang = req.contextData?.originalLanguage || '';
          const outputConstraint = baseLangConstraint();
          if (origLang) {
            langConstraint = `\n【上下文提示】：注意，下面的推文内容已经被 X 平台翻译过，原始语言是「${origLang}」。请基于此背景进行理解。\n${outputConstraint}`;
          } else {
            langConstraint = outputConstraint;
          }
        } else {
          langConstraint = baseLangConstraint();
        }
        
        let strictAntiAI = '';
        if (req.promptType === 'viral_rewrite') {
          strictAntiAI = `

【极其严格的反AI味与 X 平台算法排版约束】：
1. 绝对禁止使用任何典型的AI套话...
2. 【Hook（钩子）至上】：开头第一句话必须制造悬念、反常识或者信息落差！绝对禁止使用“冷知识：”、“划重点：”、“事实证明”这种俗套的营销号开头。如果内容很长，用最简短的词汇单刀直入。
3. 句子必须极其口语化、接地气。像真实网友随手在手机上敲出来的文字，允许存在适当的口语化破绽和情绪宣泄。
4. 【排版强迫症】：中文字符与英文字母/数字之间**必须**加一个半角空格（例如：欧洲 Mistral）。
5. 【极度追求视觉呼吸感】：长文本必须频繁分段！每一句话或每两句话之间**必须**留出空行。绝不要把多句话挤在一团，利用垂直空间占用拉高读者的 Dwell Time。
6. 【社交化微表情】：请在句尾或情绪爆发点极其自然地加上1-2个Emoji（例如😅、🤔、🔥等），提升社交属性。
7. 【绝对禁忌一：无标签】：**绝对禁止生成任何 #标签 (Hashtag)。无论如何都不要生成带有 # 符号的话题标签！**
8. 【绝对禁忌二：无外链】：**绝对禁止在正文中包含任何外部 URL 链接。所有的外部链接必须被删除或用文字概括！**
9. 【禁用 Markdown】：推特不支持 Markdown 解析。**绝对禁止使用任何 Markdown 格式符号**。如果需要强调，直接换行或用 Emoji。
10. 【最终输出铁律】：**绝对禁止输出多个备选方案！绝对禁止输出任何分析、打分、评价等废话前缀！**`;
        } else if (req.promptType === 'draft_reply') {
          // 只保留一条防止输出多个备选选项和 Markdown 的底线，不添加任何结构排版限制
          strictAntiAI = `\n\n【输出铁律】：**绝对禁止输出多个备选方案或分析打分等废话前缀！绝对禁止使用任何 Markdown 格式符号。只能输出唯一的一条真实回复文本！**`;
        }

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        const timeContext = `\n\n【极其重要的背景设定】：当前时间是 ${currentYear}年${currentMonth}月。如果引用数据、事实或趋势，请务必使用此时的最新情况，绝不要使用2023年的旧数据或旧观点！`;

        let regenerateConstraint = '';
        if (req.isRegenerate) {
          regenerateConstraint = `\n\n【用户反馈 - 重新生成指令】：注意！用户点击了“重新生成”，这说明你上一次生成的文案**非常不符合预期，导致用户完全不想使用甚至懒得修改**。请你立刻反思，抛弃上一版的切入点、废话和毫无新意的逻辑，尝试换一个完全不同的、更新颖的、更一针见血的角度来进行本次生成！`;
        }

        callLLM(promptPrefix + timeContext + langConstraint + styleConstraint + feedbackConstraint + preferenceConstraint + performanceMemoryConstraint + strictAntiAI + regenerateConstraint + '\n\n待处理文本：\n' + textToProcess, config, false, (chunk) => {
          if (senderTab && senderTab.id) {
            chrome.tabs.sendMessage(senderTab.id, { action: 'magicPromptStreamChunk', chunk: chunk }).catch(()=>null);
          } else {
            chrome.runtime.sendMessage({ action: 'magicPromptStreamChunk', chunk: chunk });
            chrome.tabs.query({active: true}, (tabs) => {
              tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { action: 'magicPromptStreamChunk', chunk: chunk }).catch(()=>null);
              });
            });
          }
        })
          .then(result => {
             if (senderTab && senderTab.id) {
               chrome.tabs.sendMessage(senderTab.id, { action: 'magicPromptStreamEnd' }).catch(()=>null);
             } else {
               chrome.runtime.sendMessage({ action: 'magicPromptStreamEnd' });
               chrome.tabs.query({active: true}, (tabs) => {
                 tabs.forEach(tab => {
                   chrome.tabs.sendMessage(tab.id, { action: 'magicPromptStreamEnd' }).catch(()=>null);
                 });
               });
             }
             const cleanResult = result.replace(/\*\*/g, '').replace(/__/g, '');
             sendResponse({ success: true, result: cleanResult });
          })
          .catch(error => sendResponse({ success: false, error: error.message }));
      });
    };

    if (request.action === "extractAndRewrite") {
      addLog('info', `收到链接提取请求: ${request.promptType}`);
      const originalText = request.contextData ? (request.contextData.text || '') : '';
      const urlMatch = originalText.match(/(https?:\/\/[^\s]+)/);
      const url = urlMatch ? urlMatch[0] : '';
      
      if (!url) {
        executeMagicPromptCore(request, originalText, sender.tab);
        return true;
      }
      
      chrome.storage.local.get(['apiKey'], (res) => {
        const isComplexPlatform = url.match(/(zhihu\.com|feishu\.cn|mp\.weixin\.qq\.com|douyin\.com|bilibili\.com|xiaohongshu\.com|xhslink\.com|tiktok\.com|kuaishou\.com|reddit\.com)/i);
        
        const DATAHUB_API_KEY = "zUBzC9YgT9f8VLrh"; 
        
        const useDatahub = isComplexPlatform;
        
        let fetchPromise;
        if (useDatahub) {
          addLog('info', `[分流路由] 检测到复杂/音视频链接，提交 DataHub 异步提取任务...`);
          
          fetchPromise = fetch('https://datahub.codes/api/datahub/execute/v0', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-API-Key': DATAHUB_API_KEY 
            },
            body: JSON.stringify({ query: `提取这个链接的内容：${url}`, channel: 'ChipStar' })
          })
          .then(res => {
            if (!res.ok) throw new Error(`DataHub 提交失败 HTTP ${res.status}`);
            return res.json();
          })
          .then(async (data) => {
            const processId = data.processId || data.id || (data.data && data.data.processId);
            if (!processId) throw new Error("未获取到 DataHub processId: " + JSON.stringify(data));
            
            addLog('info', `[分流路由] 任务提交成功，正在等待 DataHub 解析完成...`);
            let attempts = 0;
            const maxAttempts = 90; // 最多轮询 3 分钟 (180s)
            while (attempts < maxAttempts) {
              await new Promise(r => setTimeout(r, 2000));
              attempts++;
              
              const pollRes = await fetch(`https://datahub.codes/api/processes/${processId}.md?key=${DATAHUB_API_KEY}`);
              if (pollRes.status === 200) {
                 const text = await pollRes.text();
                 if (text.includes('*此过程文件为最终版本。*') || text.includes('此过程文件为最终版本')) {
                   return text;
                 }
                 continue;
              } else if (pollRes.status === 404 || pollRes.status === 202 || pollRes.status === 400) {
                 continue;
              } else {
                 throw new Error(`轮询失败 HTTP ${pollRes.status}`);
              }
            }
            throw new Error("DataHub 解析超时");
          });
        } else {
          addLog('info', `[分流路由] 走常规图文提取 Jina API...`);
          fetchPromise = fetch(`https://r.jina.ai/${url}`, {
            method: 'GET',
            headers: { 'Accept': 'text/plain' },
            signal: AbortSignal.timeout(15000)
          }).then(apiRes => {
            if (!apiRes.ok) throw new Error(`Jina HTTP ${apiRes.status}`);
            return apiRes.text();
          });
        }
        
        fetchPromise.then(text => {
          const cleanText = (text || '').trim().substring(0, 100000);
          const userSupplement = originalText.replace(url, '').trim();
          let enhancedText = `[从链接 ${url} 提取的内容]:\n${cleanText}`;
          if (userSupplement) {
             enhancedText += `\n\n[用户补充说明]: ${userSupplement}`;
          }
          
          if (cleanText.length < 10 && !userSupplement) {
             throw new Error("网页提取失败或内容为空");
          }
          
          if (!res.apiKey || res.apiKey.trim() === '') {
            addLog('success', `[提取体验模式] 提取成功 (${cleanText.length} 字符)。未配置 API，已跳过大模型。`);
            sendResponse({ success: true, result: `【纯提取体验模式】\n您尚未配置 AI API Key，无法进行大模型改写。以下是直接为您从网页中提取的纯文本内容：\n\n--------------------------\n\n${cleanText}` });
          } else {
            addLog('success', `成功提取链接内容 (${cleanText.length} 字符)，进入重写流程...`);
            executeMagicPromptCore(request, enhancedText, sender.tab);
          }
        })
        .catch(error => {
          addLog('error', `链接提取失败: ${error.message}`);
          sendResponse({ success: false, error: 'EXTRACTION_LIMITED', message: '该链接内容受限或包含人机验证，请尝试手动复制文本进行仿写~' });
        });
      });
    } else {
      addLog('info', `收到魔法指令请求: ${request.promptType}`);
      const textToProcess = request.contextData ? (request.contextData.text || request.contextData.bio || '') : '';
      executeMagicPromptCore(request, textToProcess, sender.tab);
    }
    return true;
  } else if (request.action === "rewriteTweet") {
    addLog('info', `收到推文改写请求，文风人设: ${request.archetype}，句式流派: ${request.style}`);
    
    const prompt = `你是一个顶级的 X.com (Twitter) 内容增长专家，拥有极强的爆款改写与文风重构能力。
请根据以下【原推内容】，结合主人选定的【文风人设】、【句式流派】以及【个性化要求】，重构改写生成一条全新的、极其抓人眼球的 X.com 帖子。

【原推内容】：
作者：@${request.author}
内容：${request.text}

【改写策略】：
文风策略人设：${request.archetypeLabel}
表达句式流派：${request.styleLabel}
个性化指令：${request.customPrompt || '无特殊指令'}

【极其严格的反AI味与排版约束】：
- 绝对禁止使用任何典型的AI套话，包括但不限于：“在这个瞬息万变的时代”、“深入探讨”、“不仅...而且”、“总而言之”、“毋庸置疑”、“赋能”、“底层逻辑”、“值得注意的是”、“让我们一起”。
- 【Hook（钩子）至上】：开头必须是反常识观点、情绪暴论或信息落差，直接抓人眼球。绝对禁止使用“冷知识：”、“划重点：”等俗套开头。
- 句子必须极其口语化、接地气。允许存在适当的口语化破绽和情绪宣泄。
- 【视觉呼吸感】：长文本必须频繁分段！每一句话或每两句话之间**必须**留出空行。绝不要把多句话挤在一团，以此拉长读者在推文上的停留时间。
- 【排版强迫症】：中英混排必须加空格。在情绪爆发点极其自然地加上1-2个Emoji。
- **绝对禁忌一：绝对禁止生成任何 #标签 (Hashtag)！**
- **绝对禁忌二：绝对禁止在生成正文中包含任何外部 URL 链接（外链会被平台严厉限流惩罚）！原有的外链请用文字概括。**
- 禁用 Markdown 加粗或斜体（* 或 **）。

【写作约束】：
- 必须以第一人称叙述，饱含干货/洞察/故事/数字。
- 如果原推在分享干货、教程或数据，请务必将其提炼为条理清晰的列表（Bullet Points），这能极大触发读者的“收藏（Bookmark）”行为，获取高算法权重。
- 直接输出改写后的推文文本，绝对不要带有任何“以下是改写后的内容：”或“好的，为您改写：”等废话前缀。`;

    chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'engineLanguage'], (config) => {
      let langConstraint = '';
      if (config.engineLanguage === 'en') langConstraint = '\n【语言约束】：You MUST rewrite in English.';
      else if (config.engineLanguage === 'ja') langConstraint = '\n【语言约束】：You MUST rewrite in Japanese (日本語).';
      else if (config.engineLanguage === 'es') langConstraint = '\n【语言约束】：You MUST rewrite in Spanish (Español).';
      else if (config.engineLanguage === 'id') langConstraint = '\n【语言约束】：You MUST rewrite in Indonesian (Bahasa Indonesia).';
      else if (config.engineLanguage === 'zh') langConstraint = '\n【语言约束】：必须使用中文重写。';
      else langConstraint = '\n【语言约束】：请自动识别原文语言并使用相同语言重写。';
      
      callLLM(prompt + langConstraint, config)
        .then(rewrittenText => {
          addLog('success', '推文 AI 改写生成完成');
          sendResponse({ success: true, rewrittenText });
        })
        .catch(error => {
          addLog('error', `推文 AI 改写失败: ${error.message}`);
          sendResponse({ success: false, error: error.message });
        });
    });
    return true;
  } else if (request.action === "agentChat") {
    context.handleAgentChat(request.message || '')
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => {
        addLog('error', `Agent 对话失败: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  return false;
}
