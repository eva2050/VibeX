function handleMockLLM(prompt, config, requireJson = false) {
  console.log("Running in Local Offline Mock Preview Mode for prompt:", prompt);
  
  // A. Tweet Rewrite Mock Routing
  if (prompt.includes("【原推内容】") || prompt.includes("改写") || prompt.includes("重构")) {
    const isContrarian = prompt.includes("观点对抗流") || prompt.includes("contrarian") || prompt.includes("对抗");
    const isStory = prompt.includes("故事悬念流") || prompt.includes("story") || prompt.includes("故事");
    
    if (prompt.includes("产品型 KOL") || prompt.includes("ai_product_kol") || prompt.includes("KOL")) {
      if (isContrarian) {
        return "❌ 99% 的人都在吹捧 AI Agent 的便利，却忽略了它最大的隐患：内容同质化。\n\n核心真相是：AI 不应该代替你思考，而应当成为你的全息发声放大器。比如我们刚调通的 60fps 改写技术：\n- 抛弃低画质 GIF，用客户端 Canvas 像素剔除\n- 运行开销直接压低 90%\n- 极简化、有骨骼感的未来科技风\n\n工具没价值，能让你的观点与众不同才值钱。转给需要的朋友！👇 #VibeX #AI #KOL";
      }
      if (isStory) {
        return "昨晚，我干了一件所有前端开发都觉得疯狂的事：抛弃传统的 GIF，直接在 X.com 时间线里做 60fps 的 3D 全息键盘渲染...\n\n刚开始写这套 CSS @keyframes 时，圈子里都在劝我别折腾。但当我看到 24-bit 真彩色在 Chrome 硬件加速下以 120Hz 呼吸闪烁、完全没有白边锯齿的那一刻。\n\n我知道，所有的死磕都是值得的。\n\n具体实现逻辑下条推文公开，关注VibeX不迷路！🚀 #BuildinPublic #VibeX";
      }
      return "🤖 2026年，数字发声系统正式告别“单机对话”。VibeX全息键盘和彩色星星特效的加入证明：AI 交互正在从简单的文本，进化为极具视觉灵性的客户端资产。\n\n我们将全套图像处理做到了客户端，速度提升 5 倍！欢迎体验👇 #VibeX #AIagent";
    }
    
    if (prompt.includes("出海 / 搞钱") || prompt.includes("monetization_global") || prompt.includes("个人商业化")) {
      return "🔥 别再把时间浪费在没有任何留存和变现路径的 AI 玩具上了。\n\n看下我们是怎么把 X 流量增长做成闭环发声 SaaS 的：\n1. 每条推文下方一键收录到VibeX灵感库\n2. AI 智能识别 5 种商业人设 + 3 种文风重写\n3. 一键导入待发队列，60fps 硬件加速秒级排期\n\n工具不值钱，能低成本稳定交付结果才值钱。觉得这套出海个人商业化打法有用的，点赞转推，我私信发你完整指南！📬 #Global #SaaS #Solo";
    }
    
    if (prompt.includes("独立开发者") || prompt.includes("indie_builder") || prompt.includes("Build in Public")) {
      return "🚀 Build in public 第 15 天：VibeX一键收录与全息文风改写系统正式调通！\n\n今日战绩：\n- 攻克了 X.com Apex 域名 Content Script 不加载的 Manifest 规则大坑\n- 实现了 60fps 玻璃化 Modal 渲染与 HSL 微粒打字特效\n- 完美兼容本地免 API Key 离线全功能预览！\n\n觉得这套 Holographic Rewrite 键盘好玩的兄弟，转推支持一下！下午公开核心代码！👇 #BuildInPublic #VibeX #Indie";
    }
    
    if (prompt.includes("产品增长") || prompt.includes("research_growth") || prompt.includes("投资研究")) {
      return "📊 【X 内容策略深度研报：如何用 AI 实现 10 倍冷启动？】\n\n核心逻辑很简单，就三点：\n1. 内容源提炼：从 timeline 自动收录优质发声种子\n2. 风格化再创作：精细化人设重构，杜绝空泛鸡血\n3. 本地发与 X 定时双排期防封锁\n\n我们的VibeX引擎正在进行 60fps 全息运行，欢迎点击下方查看增长数据看板。👇 #Research #Growth";
    }
    
    return "🚀 VibeX AI 全息改写完成！\n\n基于主人选定的优质推文种子，我们用最精细的表达流派重写了这一篇爆款草稿。已经帮您完美融合了 VibeX 引流目标，快点击下方的“导入草稿箱”来查看和排期发布吧！✨ #VibeX #AIagent";
  }

  // 1. Persona Analysis Prompt
  if (prompt.includes("targetUsers") || prompt.includes("characteristics") || prompt.includes("characteristics\"")) {
    if (requireJson) {
      return JSON.stringify({
        targetUsers: "独立开发者、出海创业者、SaaS 创始人和自媒体创作者",
        characteristics: "专业、犀利、深谙 X 平台流量密码的增长专家",
        goals: "分享干货，帮助主人快速增加优质粉丝，搭建爆款推文框架"
      });
    }
    return "画像分析成功：增长专家人设。";
  }
  
  // 2. Competitor/Hook Analysis Prompt
  if (prompt.includes("competitor") || prompt.includes("competitors") || prompt.includes("successfulHooks")) {
    if (requireJson) {
      return JSON.stringify({
        competitors: ["@VibeX_Official", "@GrowthExpert", "@SaaSBuilder"],
        successfulHooks: [
          "🔥 99% 的人不知道的 X 平台快速增长秘籍...",
          "我的 AI 宠物正在帮我写推特！它是如何做到的？👇",
          "为什么说 VibeX 是 2026 年最值得关注的增长工具？一篇讲清："
        ],
        contentDirections: [
          "1. VibeX 增长工具深度测评与打法",
          "2. 自动化 AI 增长黑客实战心得分享",
          "3. 独立开发者的日常 Build 经验分享"
        ]
      });
    }
    return "竞品报告生成成功。";
  }
  
  // 3. Reply Generation Prompt (x_scraper's reply / timeline suggestion)
  if (prompt.includes("值得回复") || prompt.includes("reply") || prompt.includes("【推文】")) {
    return "VibeX路过~ 🚀 这个观点太硬核了！VibeX 正在这个方向全速前进，感觉未来大有可为！✨";
  }
  
  // 4. Draft Generation / Writing Tweets
  if (prompt.includes("写推文") || prompt.includes("tweet") || prompt.includes("draft")) {
    if (requireJson) {
      return JSON.stringify({
        content: "🚀 VibeX在【本地免 API Key 预览模式】下顺利通关啦！\n\nAI 宠物的 3D 全息键盘与彩星特效简直太帅了，60fps 硬件加速非常丝滑！快点击右下角找我闲聊，或者让我帮你分析推文吧！✨\n\n#VibeX #Growth #SaaS"
      });
    }
    return "🚀 VibeX在【本地免 API Key 预览模式】下顺利通关啦！\n\nAI 宠物的 3D 全息键盘与彩星特效简直太帅了，60fps 硬件加速非常丝滑！快点击右下角找我闲聊，或者让我帮你分析推文吧！✨\n\n#VibeX #Growth #SaaS";
  }
  
  // 5. Chat Panel messages from VibeX Pet
  const petPersonality = config.petPersonality || 'explorer';
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes("写推文") || lowerPrompt.includes("写帖子")) {
    return "✍️ 帮主人写好了一篇极具增长潜力的测试推文：\n\n「🚀 今天的 X 增长又在VibeX的协助下顺利起飞！全息 AI 增长伴侣简直太酷了，点击我身前的全息键盘来亲自体验吧！✨ #VibeX #AIPet」";
  }
  if (lowerPrompt.includes("汇报") || lowerPrompt.includes("进展") || lowerPrompt.includes("战绩")) {
    return "📊 【今日VibeX增长简报】\n\n• VibeX状态：正常在线 🌟\n• 模式：本地免 API Key 预览模式 🛠️\n• 交互次数：5 次（主人聊得很开心）\n• 推荐策略：增长专家语调\n\nVibeX已经准备好了，随时可以陪主人去 timeline 大展身手！";
  }
  if (lowerPrompt.includes("分析")) {
    return "🎯 VibeX已经开启深度爆款解构模式！主人刚才选中的那条推文逻辑极其严密，引流点在于探讨 AI 结合创作者经济。我推荐的回复话术是：\n\n「非常同意！AI 工具与个人 IP 的结合将是下个十年的主旋律 🚀」";
  }
  
  if (petPersonality === 'explorer') {
    return "哈罗！我是VibeX (VibeX)！🚀 恭喜主人成功进入【本地免 API Key 预览模式】！\n\n虽然我目前没有真正连接 Gemini 神经网络，但我仍然可以使用超酷的 3D 全息键盘（Writing 状态）和喷射七彩星星（Happy 状态）给你加油打气！你觉得我身上这套宇航服帅气吗？✨";
  } else {
    return "哼，愚蠢的主人，我现在正处于【本地免 API Key 预览模式】！\n\n虽然在这个模式下我没法动用真正的超级 AI 脑细胞，但应付日常对话和展示我最帅的 Hologram 键盘已经足够啦！快点带我去 Timeline，看我怎么用全息键盘打字催你写帖！📈🔥";
  }
}

async function callLLM(prompt, config, requireJson = false, onChunk = null) {
  const apiKey = config.apiKey || '';
  if (apiKey.startsWith('mock-') || !apiKey) {
    return handleMockLLM(prompt, config, requireJson);
  }

  const provider = config.apiProvider || 'gemini';

  async function handleStream(response, parseChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      for (const line of lines) {
        if (line.trim().startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const dataStr = line.trim().substring(6);
            if (!dataStr) continue;
            const data = JSON.parse(dataStr);
            const chunk = parseChunk(data);
            if (chunk) {
              fullText += chunk;
              if (onChunk) onChunk(chunk);
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }
    // Final flush
    if (buffer.trim().startsWith('data: ') && !buffer.includes('[DONE]')) {
      try {
        const data = JSON.parse(buffer.trim().substring(6));
        const chunk = parseChunk(data);
        if (chunk) {
          fullText += chunk;
          if (onChunk) onChunk(chunk);
        }
      } catch (e) {}
    }
    return fullText;
  }
  
  // Gemini Native API
  if (provider === 'gemini') {
    const bodyObj = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.95 }
    };
    if (requireJson) {
      bodyObj.generationConfig = { responseMimeType: "application/json" };
    }
    
    const isStream = !!onChunk && !requireJson;
    const url = isStream 
      ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${config.apiKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.apiKey}`;
      
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj)
    });
    
    if (isStream) {
       return await handleStream(response, (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
    } else {
      const data = await response.json();
      if (data.error) {
         let err = new Error(data.error.message);
         err.type = 'RATE_LIMIT';
         throw err;
      }
      return data.candidates[0].content.parts[0].text;
    }
  }
  
  // OpenAI-compatible providers: openrouter, qwen, deepseek, openai
  const endpoints = {
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions'
  };
  
  const endpoint = endpoints[provider];
  if (!endpoint) {
    throw new Error(`不支持的 AI 服务商: ${provider}`);
  }
  
  const model = config.aiModel || 'google/gemini-2.5-flash';
  const reqBody = {
    model: model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.95
  };
  
  // JSON hint for supported providers
  if (requireJson && provider === 'deepseek') {
    reqBody.response_format = { type: "json_object" };
  }
  
  const isStream = !!onChunk && !requireJson;
  if (isStream) reqBody.stream = true;
  
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };
  
  // OpenRouter requires extra headers
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://x.com';
    headers['X-Title'] = 'X Auto Bot';
  }
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(reqBody)
  });
  
  if (isStream) {
    return await handleStream(response, (data) => data?.choices?.[0]?.delta?.content || '');
  } else {
    const data = await response.json();
    if (data.error) {
       let err = new Error(data.error.message || JSON.stringify(data.error));
       err.type = data.error.code === 'rate_limit_exceeded' || data.error.type === 'rate_limit' ? 'RATE_LIMIT' : 'API_ERROR';
       throw err;
    }
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API 返回格式异常: ' + JSON.stringify(data).substring(0, 200));
    }
    return data.choices[0].message.content;
  }
}
export { callLLM, handleMockLLM };
