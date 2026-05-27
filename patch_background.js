const fs = require('fs');
let code = fs.readFileSync('background.js', 'utf8');

// The Anti-AI Blacklist
const antiAiVibe = `\n\n【极其严格的反AI味约束】：
1. 绝对禁止使用任何典型的AI套话，包括但不限于：“在这个瞬息万变的时代”、“深入探讨”、“不仅...而且”、“总而言之”、“毋庸置疑”、“赋能”、“底层逻辑”、“值得注意的是”、“让我们一起”。
2. 句子必须极其口语化、接地气。像真实网友随手在手机上敲出来的文字，允许存在适当的口语化破绽和情绪宣泄。
3. 杜绝说教感和翻译腔，杜绝毫无意义的总结陈词。如果内容很长，用最简短的词汇单刀直入。`;

// 1. Inject replyStrategy and Anti AI vibe into executeMagicPromptCore
code = code.replace(
  /chrome\.storage\.local\.get\(\['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'styleTrainingData', 'engineLanguage', 'feedbackLoopData'\], \(config\) => \{/,
  `chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'styleTrainingData', 'engineLanguage', 'feedbackLoopData', 'replyStrategy'], (config) => {`
);

// We need to modify `promptPrefix` for draft_reply to use config.replyStrategy.
// Because promptPrefix is evaluated BEFORE chrome.storage.local.get, we should move the promptPrefix logic INSIDE the storage callback!

// Let's refactor executeMagicPromptCore
const refactoredMagicPrompt = `
    const executeMagicPromptCore = (req, textToProcess) => {
      chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'styleTrainingData', 'engineLanguage', 'feedbackLoopData', 'replyStrategy'], (config) => {
        let promptPrefix = '';
        const currentReplyStrategy = config.replyStrategy || '【专业补充】极度赞同，并补充一条专业冷知识或数据';
        
        switch(req.promptType) {
          case 'draft_reply':
            promptPrefix = '你是一位混迹推特多年的资深真实网友。任务：请使用“' + currentReplyStrategy + '”的策略，为下面这条推文写一条高质量的破冰回复。要求：口语化、不要有AI翻译腔，字数在100字以内。\\n\\n原推文：\\n';
            break;
          case 'viral_rewrite':
            promptPrefix = '你是一位 X 上资深运营专家，擅长病毒式传播。任务：将我提供的原始内容进行“推特化”二创重写，打造下一条高传播推文。要求：1. 不改变原意，保留核心价值点 2. 第一行必须是强钩子 3. 长段落拆成短句或列表 4. 结尾要有互动或行动号召 5. 总长度控制在 280 字符内。请直接输出重写后的内容：\\n\\n原始内容：\\n';
            break;
          case 'analyze_style':
            promptPrefix = '请帮我深度拆解以下推文的爆款结构、情绪价值和潜在可模仿点，输出一个可复用的写作框架：\\n\\n';
            break;
          case 'generate_art':
            promptPrefix = '你是一位顶级概念视觉导演。请根据下面推文的内容，生成一张用于社交媒体的高级概念海报。请直接输出一段可以喂给 Midjourney 的英文咒语。风格请选择“Vibrant corporate Memphis style (现代扁平矢量)” 或 “Monochrome conceptual poster (黑白高级极简版式)”。咒语需要极其详细，包含主体、构图、光影、色彩、氛围等：\\n\\n推文内容：\\n';
            break;
          case 'profile_audit':
            promptPrefix = '你是一位千万粉博主操盘手。请根据下面这个推特大V的昵称和简介，对其账号门面进行“毒舌诊断”。请回答：1. 他是谁？ 2. 他分享什么？ 3. 关注他对我有什么好处？ 如果不清晰，请直接给出优化建议。\\n\\n账号资料：\\n';
            break;
          default:
            promptPrefix = '请处理以下内容：\\n';
        }
        
        let styleConstraint = '';
        if (config.styleTrainingData && (req.promptType === 'viral_rewrite' || req.promptType === 'draft_reply')) {
          styleConstraint = \`\\n\\n【严格文风约束】：必须100%模仿以下参考素材的断句节奏、用词习惯（如特定语气词、emoji）、情绪饱和度以及排版结构。请提取并在输出中重现这种独特的个人风格，杜绝任何AI感。如果原素材是极简口语，你就极简口语；如果是长篇干货，你就长篇干货。\\n<文风参考>\\n\${config.styleTrainingData}\\n</文风参考>\\n\\n\`;
        }
        
        let feedbackConstraint = '';
        if (config.feedbackLoopData && config.feedbackLoopData.length > 0 && (req.promptType === 'viral_rewrite' || req.promptType === 'draft_reply')) {
          const feedbackExamples = config.feedbackLoopData.map((fb, idx) => \`[示例 \${idx+1}]\\n- 你的原输出 (AI味重): \${fb.original}\\n- 用户的修改版 (理想状态): \${fb.modified}\`).join('\\n\\n');
          feedbackConstraint = \`\\n【自我进化避坑指南】：在过去的交互中，用户对你生成的某些内容进行了大量人工修改。请务必学习以下“错误 vs 修正”的对比案例，在这次生成中**坚决避免**使用类似原输出中那种“AI味、翻译腔”的句式！\\n<避坑案例>\\n\${feedbackExamples}\\n</避坑案例>\\n\\n\`;
        }
        
        let langConstraint = '';
        if (config.engineLanguage === 'zh') langConstraint = '\\n【语言约束】：必须使用中文回复。';
        else if (config.engineLanguage === 'en') langConstraint = '\\n【语言约束】：必须使用英文回复。';
        else langConstraint = '\\n【语言约束】：请自动识别并使用原推文的语言进行回复。';
        
        const strictAntiAI = (req.promptType === 'viral_rewrite' || req.promptType === 'draft_reply') ? \`\n\n【极其严格的反AI味约束】：
1. 绝对禁止使用任何典型的AI套话，包括但不限于：“在这个瞬息万变的时代”、“深入探讨”、“不仅...而且”、“总而言之”、“毋庸置疑”、“赋能”、“底层逻辑”、“值得注意的是”、“让我们一起”。
2. 句子必须极其口语化、接地气。像真实网友随手在手机上敲出来的文字，允许存在适当的口语化破绽和情绪宣泄。
3. 杜绝说教感和翻译腔，杜绝毫无意义的总结陈词。如果内容很长，用最简短的词汇单刀直入。\` : '';

        callLLM(promptPrefix + langConstraint + styleConstraint + feedbackConstraint + strictAntiAI + '\\n\\n待处理文本：\\n' + textToProcess, config)
          .then(result => sendResponse({ success: true, result: result }))
          .catch(error => sendResponse({ success: false, error: error.message }));
      });
    };
`;

code = code.replace(/const executeMagicPromptCore = \(req, textToProcess\) => \{[\s\S]*?callLLM\([\s\S]*?catch\(error => sendResponse\(\{ success: false, error: error\.message \}\)\);\n      \}\);\n    \};/, refactoredMagicPrompt.trim());

// 2. Inject into rewriteTweet
code = code.replace(
  /【写作约束】：\n- 必须以第一人称叙述/,
  `【极其严格的反AI味约束】：\n- 绝对禁止使用任何典型的AI套话，包括但不限于：“在这个瞬息万变的时代”、“深入探讨”、“不仅...而且”、“总而言之”、“毋庸置疑”、“赋能”、“底层逻辑”、“值得注意的是”、“让我们一起”。\n- 句子必须极其口语化、接地气。像真实网友随手在手机上敲出来的文字，允许存在适当的口语化破绽和情绪宣泄。\n- 杜绝说教感和翻译腔，杜绝毫无意义的总结陈词。如果内容很长，用最简短的词汇单刀直入。\n\n【写作约束】：\n- 必须以第一人称叙述`
);

fs.writeFileSync('background.js', code);
