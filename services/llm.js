import { fetchWithTimeoutError } from '../utils/fetchUtils.js';

function handleMockLLM(prompt, config, requireJson = false) {
  console.log("Running in Local Offline Mock Preview Mode for prompt:", prompt);
  
  // A. Tweet Rewrite Mock Routing
  if (prompt.includes("【原推内容】") || prompt.includes("改写") || prompt.includes("重构")) {
    const isContrarian = prompt.includes("观点对抗流") || prompt.includes("contrarian") || prompt.includes("对抗");
    const isStory = prompt.includes("故事悬念流") || prompt.includes("story") || prompt.includes("故事");
    
    if (prompt.includes("产品型 KOL") || prompt.includes("ai_product_kol") || prompt.includes("KOL")) {
      if (isContrarian) {
        return "99% 的人都在讨论 AI 工具本身，却忽略了更重要的事：你到底把哪一个交付环节变便宜了？\n\n真正有商业价值的不是“用了 AI”，而是：\n- 原来 3 小时的交付变成 30 分钟\n- 原来只能服务 5 个客户，现在能服务 50 个\n- 原来依赖个人灵感，现在变成可复用流程\n\n工具没价值，可重复交付结果才值钱。";
      }
      if (isStory) {
        return "昨晚我重新看了一遍自己的产品想法，发现最大的问题不是功能少，而是场景太散。\n\n于是我只保留一个问题：这个工具能不能帮一个具体人群每天少花 30 分钟？\n\n一旦问题收窄，需求、文案、功能优先级都清楚了。做产品最怕的不是小，而是没有一个清晰的重复场景。";
      }
      return "2026 年，AI 产品的分水岭不是模型参数，而是谁能把复杂流程产品化。\n\n普通工具只给你一个输入框；真正有价值的系统会帮你沉淀记忆、识别场景、排优先级，并把输出接到真实工作流里。";
    }
    
    if (prompt.includes("出海 / 搞钱") || prompt.includes("monetization_global") || prompt.includes("个人商业化")) {
      return "别再把时间浪费在没有留存和变现路径的 AI 玩具上。\n\n一个更稳的出海微产品路径：\n1. 找到海外用户已经付费的重复任务\n2. 用 AI 把交付成本压低\n3. 先做人工半自动服务，再沉淀成 SaaS\n\n工具不值钱，能低成本稳定交付结果才值钱。";
    }
    
    if (prompt.includes("独立开发者") || prompt.includes("indie_builder") || prompt.includes("Build in Public")) {
      return "Build in public 第 15 天：今天没有加新功能，只删掉了 3 个不必要的分支。\n\n真正的进展是：\n- 自动化链路更稳定\n- 配置项更少\n- 下次改动更不容易误伤其他模块\n\n独立开发最容易高估新增功能，低估系统变简单带来的速度。";
    }
    
    if (prompt.includes("产品增长") || prompt.includes("research_growth") || prompt.includes("投资研究")) {
      return "【X 内容策略简报：AI 产品如何做冷启动】\n\n核心逻辑不是多发，而是让每条内容服务一个明确目标：\n1. 证明你理解目标用户的痛点\n2. 展示你有可执行的方法\n3. 用评论区验证真实需求\n\n先拿到高质量互动，再谈规模化。";
    }
    
    return "十年前三家电商赌的是同一副牌。\n\n京东押中产越来越多\n淘宝押网购人群越来越大\n拼多多押消费会不断降级\n\n结果拼多多赢了\n\n不是因为模式更高级\n是因为它看懂了大多数人口袋里其实没几个钢镚\n\n剩下两家还在赌「变有钱」\n拼多多赌的是「撑下去」\n\n谁更懂底层\n谁就活到了下半场";
  }

  // 1. Persona Analysis Prompt
  if (prompt.includes("targetUsers") || prompt.includes("characteristics") || prompt.includes("characteristics\"")) {
    if (requireJson) {
      return JSON.stringify({
        targetUsers: "独立开发者、出海创业者、SaaS 创始人和自媒体创作者",
        characteristics: "专业、犀利、深谙 X 平台流量密码的增长专家",
        goals: "分享干货，吸引高质量目标用户，搭建可复用的内容增长框架"
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
          "我把 AI 内容工作流拆成了 3 个可复用步骤：",
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
    return "这个判断很关键。很多人只看到工具本身，真正的机会其实在具体场景、交付效率和可复用的工作流里。";
  }
  
  // 4. Draft Generation / Writing Tweets
  if (prompt.includes("写推文") || prompt.includes("tweet") || prompt.includes("draft")) {
    if (requireJson) {
      return JSON.stringify({
        content: "很多 AI 副业失败，不是因为工具不够强，而是因为一开始就跳过了需求验证。\n\n先找到一个愿意持续付费的小场景，再用 AI 降低交付成本。工具只是杠杆，需求才是地基。"
      });
    }
    return "很多 AI 副业失败，不是因为工具不够强，而是因为一开始就跳过了需求验证。\n\n先找到一个愿意持续付费的小场景，再用 AI 降低交付成本。工具只是杠杆，需求才是地基。";
  }
  
  // 5. Strategy assistant fallback messages
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes("写推文") || lowerPrompt.includes("写帖子")) {
    return "可以先写成这样：\n\nAI 副业别先找工具。\n\n先找一个足够具体、愿意持续付费的人群：他们现在在买什么？交付哪里最耗时？你能不能用 AI 把成本压低一半？\n\n工具不值钱，能稳定交付结果才值钱。";
  }
  if (lowerPrompt.includes("汇报") || lowerPrompt.includes("进展") || lowerPrompt.includes("战绩")) {
    return "今日可以先看三件事：\n\n1. 是否有稳定发帖节奏。\n2. 自动回复是否围绕目标人群展开。\n3. 哪类选题带来了更高质量互动。\n\n如果还没有真实模型配置，当前只能作为本地预览结果参考。";
  }
  if (lowerPrompt.includes("分析")) {
    return "这条内容可以从三个角度拆：观点是否具体、读者是否能代入、回复是否能补充信息增量。\n\n建议回复方向：先认同一个具体判断，再补充一个可执行的观察，避免泛泛而谈。";
  }
  
  return "当前是本地预览模式，还没有连接真实模型。我可以先给出基础策略建议；配置 API Key 后，再执行完整的生成、分析和记忆更新。";
}

const LLM_REQUEST_TIMEOUT_MS = 45 * 1000;

function classifyApiError(status = 0, apiError = {}) {
  const httpStatus = Number(status) || 0;
  const bodyCode = Number(apiError.code) || 0;
  const numericStatus = httpStatus >= 400 ? httpStatus : bodyCode;
  const signal = [
    apiError.status,
    apiError.code,
    apiError.type,
    apiError.reason,
    apiError.message
  ].filter(Boolean).join(' ').toLowerCase();

  if (numericStatus === 429 || /rate|quota|resource_exhausted|too many/.test(signal)) return 'RATE_LIMIT';
  if ([401, 403].includes(numericStatus) || /auth|unauthorized|permission|forbidden|api key|invalid key/.test(signal)) return 'AUTH_ERROR';
  return 'API_ERROR';
}

function getApiErrorMessage(apiError = {}, fallback = '') {
  if (typeof apiError === 'string') return apiError;
  return apiError.message
    || apiError.detail
    || apiError.error_description
    || apiError.error
    || fallback;
}

function createApiError(message, status = 0, apiError = {}) {
  const error = new Error(message || `API 请求失败 HTTP ${status}`);
  error.type = classifyApiError(status, apiError);
  error.status = status;
  return error;
}

async function assertResponseOk(response, providerName = 'API') {
  if (response.ok) return;
  const errorText = await response.text().catch(() => '');
  let errorData = {};
  try {
    errorData = errorText ? JSON.parse(errorText) : {};
  } catch {
    errorData = { message: errorText.slice(0, 500) };
  }
  const apiError = errorData.error || errorData || {};
  const message = getApiErrorMessage(apiError, `${providerName} 请求失败 HTTP ${response.status}`);
  throw createApiError(message, response.status, apiError);
}

async function readJsonResponse(response, providerName = 'API') {
  const rawText = await response.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    if (!response.ok) {
      throw createApiError(rawText.slice(0, 500), response.status, {});
    }
    throw new Error(`${providerName} 返回格式异常: ${rawText.slice(0, 200)}`);
  }

  if (!response.ok || data.error) {
    const apiError = data.error || data || {};
    const message = getApiErrorMessage(apiError, `${providerName} 请求失败 HTTP ${response.status}`);
    throw createApiError(message, response.status || Number(apiError.code) || 0, apiError);
  }
  return data;
}

function normalizeGeminiModel(model = '') {
  return String(model || 'gemini-2.5-flash')
    .trim()
    .replace(/^models\//, '')
    .replace(/^google\//, '')
    || 'gemini-2.5-flash';
}

function extractGeminiText(data = {}) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(part => part?.text || '').join('').trim();
}

async function performCallLLM(prompt, config, requireJson = false, onChunk = null) {
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
      bodyObj.generationConfig = { ...bodyObj.generationConfig, responseMimeType: "application/json" };
    }
    
    const isStream = !!onChunk && !requireJson;
    const model = normalizeGeminiModel(config.aiModel);
    const action = isStream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}`;
      
    const response = await fetchWithTimeoutError(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(bodyObj)
    }, LLM_REQUEST_TIMEOUT_MS, 'AI API 请求超时，请稍后重试');
    
    await assertResponseOk(response, 'Gemini');
    if (isStream) {
       return await handleStream(response, (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
    } else {
      const data = await readJsonResponse(response, 'Gemini');
      const text = extractGeminiText(data);
      if (!text) {
        const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '';
        throw createApiError(
          `AI 返回为空，可能触发了内容安全过滤${reason ? ` (${reason})` : ''}`,
          200,
          { status: reason }
        );
      }
      return text;
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
  
  const defaultModels = {
    openrouter: 'google/gemini-2.5-flash',
    qwen: 'qwen-plus',
    deepseek: 'deepseek-chat',
    openai: 'gpt-4o-mini'
  };
  const model = config.aiModel || defaultModels[provider] || 'gpt-4o-mini';
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
    headers['X-Title'] = 'VibeX';
  }
  
  const response = await fetchWithTimeoutError(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(reqBody)
  }, LLM_REQUEST_TIMEOUT_MS, 'AI API 请求超时，请稍后重试');
  
  await assertResponseOk(response, provider);
  if (isStream) {
    return await handleStream(response, (data) => data?.choices?.[0]?.delta?.content || '');
  } else {
    const data = await readJsonResponse(response, provider);
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API 返回格式异常: ' + JSON.stringify(data).substring(0, 200));
    }
    const content = data.choices[0].message.content;
    // Mirror the Gemini path's empty-completion guard: a "successful" HTTP
    // response can still carry an empty/null content string (provider-side
    // safety filtering, truncation to zero tokens, transient upstream glitch,
    // etc.). Treat that the same as a hard failure instead of letting an
    // empty string quietly flow through as if it were valid generated text
    // and get posted/sent as-is.
    if (!content || !String(content).trim()) {
      const finishReason = data.choices[0].finish_reason || data.choices[0].finishReason || '';
      throw createApiError(
        `AI 返回为空，可能触发了内容安全过滤或服务商临时故障${finishReason ? ` (${finishReason})` : ''}`,
        200,
        { status: finishReason }
      );
    }
    return content;
  }
}

const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_BASE_DELAY_MS = 2000; // schedule: 2s, 4s (capped at 2 retries)

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Thin retry wrapper around performCallLLM: on a 429/rate-limit error, back
// off exponentially (2s, then 4s) and try again, instead of the generation
// retry loop immediately re-hammering an already-throttled provider with
// zero delay. Streaming responses that already emitted at least one chunk
// to the caller are never retried here (the caller has already started
// rendering partial output; re-running from scratch would duplicate it) —
// they just surface the error as before.
async function callLLM(prompt, config, requireJson = false, onChunk = null) {
  let chunkEmitted = false;
  const trackedOnChunk = onChunk
    ? (chunk) => { chunkEmitted = true; onChunk(chunk); }
    : null;
  // Overridable only for tests, so retry-backoff coverage doesn't have to
  // sleep for real seconds; production always falls back to the real delay.
  const baseDelayMs = Number.isFinite(config?.__rateLimitRetryBaseDelayMs)
    ? config.__rateLimitRetryBaseDelayMs
    : RATE_LIMIT_BASE_DELAY_MS;

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      return await performCallLLM(prompt, config, requireJson, trackedOnChunk);
    } catch (error) {
      const canRetry = error?.type === 'RATE_LIMIT' && !chunkEmitted && attempt < RATE_LIMIT_MAX_RETRIES;
      if (!canRetry) throw error;
      await delay(baseDelayMs * Math.pow(2, attempt));
    }
  }
}

export { callLLM, handleMockLLM };
