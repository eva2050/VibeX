import { callLLM } from '../services/llm.js';
import { addLog } from '../core/state.js';

export function handleLLMMessage(request, sender, sendResponse, context) {
  if (request.action === "testApiConnection") {
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
      chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'styleTrainingData', 'engineLanguage', 'feedbackLoopData', 'replyStrategy', 'customPromptGlobal'], (config) => {
        if (!config.engineLanguage || config.engineLanguage === 'auto') config.engineLanguage = navigator.language.startsWith('zh') ? 'zh' : 'en';
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

        switch(req.promptType) {
          case 'draft_reply':
            promptPrefix = strategyPrompt + '\n\n绝对不要在输出中包含策略名本身，直接输出回复的正文内容。\n\n原推文：\n';
            break;
          case 'viral_rewrite':
            promptPrefix = `你是一位 X (Twitter) 千万级爆款操盘手。你的任务是对提供的【原始内容】进行“降维打击式”的网感重构。
不要生搬硬套固定的结构模板，请务必根据原文的【类型】和【长度】采取不同的改写策略：

1. 【短平快/情绪向】（原文如果是1-2句话的感叹、碎碎念、疑问、纯情绪发泄）：
   - 策略：必须保留其原有的“轻量感”和“情绪张力”，绝不要扩写成长篇大论。
   - 做法：直接将其改写成一句极具煽动性的暴论、一个扎心的反问、或者一条带点幽默/讽刺的简短吐槽。字数越少越好，一刀致命。

2. 【稍长内容/经验感悟】（原文如果是几段日常观察、生活经验或故事）：
   - 策略：提取核心矛盾、反差或共鸣点。
   - 做法：使用“强力钩子(Hook) + 极简短句骨架 + 开放式互动”结构。多用换行留白，剥离所有废话，制造情绪起伏。

3. 【专业/硬核干货】（原文如果是长篇深度分析、数据、行业洞察）：
   - 策略：降维表达。把晦涩的专业词汇翻译成人话。
   - 做法：采用“一句话总结核心价值 + 清晰的列表(Bullet points) + 颠覆性认知”的框架。信息密度要极高，让人看一眼就想收藏。

【通用铁律】：
- 绝不能仅仅是同义词替换或改变语序，要有属于你人设的增量思考或态度。
- 标签限制：如果加 #标签，绝对不能超过 2 个，甚至可以不加。
- 严禁任何“AI味”结尾（如“你觉得呢？”、“让我们一起探索”、“分享你的看法”等烂俗互动）。
- 完成正文后必须立即停止输出！绝对禁止啰嗦。

请直接输出重构后的高传播推文：

原始内容：
`;
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
        
        let styleConstraint = '';
        if (config.styleTrainingData && req.promptType === 'viral_rewrite') {
          styleConstraint = `\n\n【严格文风约束】：必须100%模仿以下参考素材的断句节奏、用词习惯（如特定语气词、emoji）、情绪饱和度以及排版结构。请提取并在输出中重现这种独特的个人风格，杜绝任何AI感。如果原素材是极简口语，你就极简口语；如果是长篇干货，你就长篇干货。\n<文风参考>\n${Array.isArray(config.styleTrainingData) ? config.styleTrainingData.map((s,i) => `[语料 ${i+1}]\n${s}`).join('\n\n') : config.styleTrainingData}\n</文风参考>\n\n`;
        }
        
        let feedbackConstraint = '';
        if (config.feedbackLoopData && config.feedbackLoopData.length > 0 && (req.promptType === 'viral_rewrite' || req.promptType === 'draft_reply')) {
          const feedbackExamples = config.feedbackLoopData.map((fb, idx) => `[示例 ${idx+1}]\n- 你的原输出 (AI味重): ${fb.original}\n- 用户的修改版 (理想状态): ${fb.modified}`).join('\n\n');
          feedbackConstraint = `\n【自我进化避坑指南】：在过去的交互中，用户对你生成的某些内容进行了大量人工修改。请务必学习以下“错误 vs 修正”的对比案例，在这次生成中**坚决避免**使用类似原输出中那种“AI味、翻译腔”的句式！\n<避坑案例>\n${feedbackExamples}\n</避坑案例>\n\n`;
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
        
        const strictAntiAI = (req.promptType === 'viral_rewrite' || req.promptType === 'draft_reply') ? `

【极其严格的反AI味与排版约束】：
1. 绝对禁止使用任何典型的AI套话，包括但不限于：“在这个瞬息万变的时代”、“深入探讨”、“不仅...而且”、“总而言之”、“毋庸置疑”、“赋能”、“底层逻辑”、“值得注意的是”、“让我们一起”。
2. 绝对禁止使用“冷知识：”、“划重点：”、“事实证明”这种俗套的营销号开头！如果内容很长，用最简短的词汇单刀直入。
3. 句子必须极其口语化、接地气。像真实网友随手在手机上敲出来的文字，允许存在适当的口语化破绽和情绪宣泄。
4. 【排版强迫症】：中文字符与英文字母/数字之间**必须**加一个半角空格（例如：欧洲 Mistral）。
5. 【视觉呼吸感】：长文本必须分段，段落之间必须留出空行（空一行），绝不要把多句话挤在一团。
6. 【社交化微表情】：请在句尾或情绪爆发点极其自然地加上1-2个Emoji（例如😅、🤔、🔥等），提升社交属性。
7. 【绝对禁忌】：**绝对禁止在生成的回复或推文中包含任何 #标签 (Hashtag)。无论如何都不要生成带有 # 符号的话题标签，只输出纯文本内容！**` : '';

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        const timeContext = `\n\n【极其重要的背景设定】：当前时间是 ${currentYear}年${currentMonth}月。如果引用数据、事实或趋势，请务必使用此时的最新情况，绝不要使用2023年的旧数据或旧观点！`;

        let regenerateConstraint = '';
        if (req.isRegenerate) {
          regenerateConstraint = `\n\n【用户反馈 - 重新生成指令】：注意！用户点击了“重新生成”，这说明你上一次生成的文案**非常不符合预期，导致用户完全不想使用甚至懒得修改**。请你立刻反思，抛弃上一版的切入点、废话和毫无新意的逻辑，尝试换一个完全不同的、更新颖的、更一针见血的角度来进行本次生成！`;
        }

        callLLM(promptPrefix + timeContext + langConstraint + styleConstraint + feedbackConstraint + strictAntiAI + regenerateConstraint + '\n\n待处理文本：\n' + textToProcess, config, false, (chunk) => {
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
             sendResponse({ success: true, result: result });
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
        const isComplexPlatform = url.match(/(zhihu\.com|feishu\.cn|mp\.weixin\.qq\.com|douyin\.com|bilibili\.com|youtube\.com|youtu\.be|xiaohongshu\.com\/explore|tiktok\.com|kuaishou\.com)/i);
        
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
- 绝对禁止使用“冷知识：”、“划重点：”、“事实证明”这种俗套的营销号开头！如果内容很长，用最简短的词汇单刀直入。
- 句子必须极其口语化、接地气。像真实网友随手在手机上敲出来的文字，允许存在适当的口语化破绽和情绪宣泄。
- 【排版强迫症】：中文字符与英文字母/数字之间**必须**加一个半角空格（例如：欧洲 Mistral）。
- 【视觉呼吸感】：长文本必须分段，段落之间必须留出空行（空一行），绝不要把多句话挤在一团。
- 【社交化微表情】：请在句尾或情绪爆发点极其自然地加上1-2个Emoji（例如😅、🤔、🔥等），提升社交属性。
- **绝对禁忌：绝对禁止生成任何 #标签 (Hashtag)！不要包含任何带有 # 符号的话题标签。**

【写作约束】：
- 必须以第一人称叙述，写得像真人写的推文，必须饱含干货/洞察/故事/数字，有较强判断力。
- 保持推特短文风格，长短适中，可分段或使用列表，加入适量 emoji 提升可读性。
- 如果原推在分享干货、教程或数据，请提炼并重构，绝对不要照抄原推的用词。
- 严禁空泛鸡血口号（例如“快来看看吧！”“让我们一起努力吧！”）。
- 直接输出改写后的推文文本，绝对不要带有任何“以下是改写后的内容：”或“好的，为您改写：”等废废话前缀。`;

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
