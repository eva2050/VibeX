import { callLLM } from '../services/llm.js';
import { addLog } from '../core/state.js';
import { buildGenerationContext } from '../core/generationContext.js';
import { getLanguageInstruction, getPromptText, normalizeEngineLanguage } from '../core/i18n.js';
import { buildLegacyReplyStrategyPrompt } from '../core/replyStrategies.js';
import { buildDirectRewritePrompt, buildViralRewritePromptPrefix } from '../core/rewritePrompts.js';
import { buildStudioPrompt, buildStudioRegenerateInstruction } from '../core/studioPrompt.js';
import { orchestrateStudioGeneration } from '../core/studioGeneration.js';
import { buildStudioSessionFromResult } from '../core/generationAttribution.js';
import { resolveContentSkill } from '../core/contentSkills/registry.js';
import '../core/contentSkills/zh/postSkill.js';
import { fetchWithTimeout } from '../utils/fetchUtils.js';
import { buildInputLockedRewriteRules } from '../core/studioRewriteInput.js';

function prependGenerationSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ generationSessions: [] }, (items) => {
      const sessions = (Array.isArray(items.generationSessions) ? items.generationSessions : [])
        .filter(item => item?.id !== session.id);
      const generationSessions = [session, ...sessions].slice(0, 100);
      chrome.storage.local.set({ generationSessions }, () => resolve(session));
    });
  });
}

function notifyStudioPhase(phase, streamId = '') {
  const message = { action: 'studioGenerationPhase', phase, streamId };
  try {
    const result = chrome.runtime.sendMessage(message);
    if (result?.catch) result.catch(() => {});
  } catch (_) {
    // The requesting extension page may have closed while generation continued.
  }
}

function delay(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJinaExtractedText(url) {
  addLog('info', 'jina_route');
  const apiRes = await fetchWithTimeout(`https://r.jina.ai/${url}`, {
    method: 'GET',
    headers: { 'Accept': 'text/plain' }
  }, 15000);
  if (!apiRes.ok) throw new Error(`Jina HTTP ${apiRes.status}`);
  return apiRes.text();
}

async function fetchDataHubExtractedText(url, apiKey) {
  addLog('info', 'datahub_complex_route');
  const submitRes = await fetchWithTimeout('https://datahub.codes/api/datahub/execute/v0', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify({ query: `提取这个链接的内容：${url}`, channel: 'ChipStar' })
  }, 10000);
  if (!submitRes.ok) throw new Error(`DataHub 提交失败 HTTP ${submitRes.status}`);

  const data = await submitRes.json();
  const processId = data.processId || data.id || (data.data && data.data.processId);
  if (!processId) throw new Error("未获取到 DataHub processId: " + JSON.stringify(data));

  addLog('info', 'datahub_task_submitted');
  const pollDeadline = Date.now() + 18000;
  while (Date.now() < pollDeadline) {
    await delay(2000);
    const remainingMs = pollDeadline - Date.now();
    if (remainingMs <= 0) break;

    const pollRes = await fetchWithTimeout(`https://datahub.codes/api/processes/${encodeURIComponent(processId)}.md`, {
      method: 'GET',
      headers: {
        'Accept': 'text/markdown,text/plain,*/*',
        'X-API-Key': apiKey
      }
    }, Math.min(5000, remainingMs));
    if (pollRes.status === 200) {
      const text = await pollRes.text();
      if (text.includes('*此过程文件为最终版本。*') || text.includes('此过程文件为最终版本')) {
        return text;
      }
      continue;
    }
    if (pollRes.status === 404 || pollRes.status === 202 || pollRes.status === 400) {
      continue;
    }
    throw new Error(`轮询失败 HTTP ${pollRes.status}`);
  }
  throw new Error("DataHub 解析超时");
}

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
    addLog('info', 'reply_request_received');
    context.generateAIResponse(request.tweetContent || request.tweetText || '', request)
      .then(replyText => {
        addLog('success', 'reply_generation_complete');
        chrome.storage.local.get(['engineLanguage', 'accountLanguage'], (items) => {
          const configuredLanguage = items.engineLanguage === 'auto'
            ? items.accountLanguage
            : items.engineLanguage;
          sendResponse({
            success: true,
            replyText,
            reply: replyText,
            engineLanguage: request.originalLanguage || configuredLanguage || 'unknown'
          });
        });
      })
      .catch(error => {
        addLog('error', 'ai_api_failed', [error.message]);
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
        'accountBio', 'leadTarget', 'onboardingStrategy', 'competitorReport',
        'accountPerformanceBaseline', 'xAuth', 'contentSkillRollout'
      ], async (config) => {
        if (!config.apiKey || config.apiKey.trim() === '' || config.apiKey.startsWith('mock-')) {
          sendResponse({ success: false, error: 'ERR_MISSING_API_KEY' });
          return;
        }
        const rawEngineLanguage = config.engineLanguage || 'auto';
        config.engineLanguage = normalizeEngineLanguage(rawEngineLanguage, globalThis.navigator?.language || '');
        const generationContext = buildGenerationContext(config, { promptType: req.promptType });
        let promptPrefix = '';
        const currentReplyStrategy = config.replyStrategy || '专业流：认知洞见 / 启发式';

        const strategyPrompt = buildLegacyReplyStrategyPrompt(currentReplyStrategy, config.customPromptGlobal);

        const errorMsgText = config.engineLanguage === 'zh'
          ? '❌ 链接内容提取失败，无法进行仿写。请检查链接是否有效，或尝试手动复制核心文字进行输入。'
          : '❌ Link content extraction failed, unable to rewrite. Please check if the link is valid, or try manually copying the core text.';

        switch(req.promptType) {
          case 'draft_reply':
            promptPrefix = strategyPrompt + '\n\n绝对不要在输出中包含策略名本身，直接输出回复的正文内容。\n\n原推文：\n';
            break;

          case 'viral_rewrite':
            promptPrefix = buildViralRewritePromptPrefix({
              errorMsgText,
              persona: config.aiPersona || {},
              engineLanguage: config.engineLanguage
            });
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

        let langConstraint = '';
        const baseLangConstraint = () => getLanguageInstruction(config.engineLanguage, 'output', globalThis.navigator?.language || '');

        if (req.promptType === 'viral_rewrite') {
          langConstraint = getLanguageInstruction(config.engineLanguage, 'rewrite', globalThis.navigator?.language || '');
        } else if (req.promptType === 'draft_reply') {
          const origLang = req.contextData?.originalLanguage || '';
          const outputConstraint = baseLangConstraint();
          if (origLang) {
            langConstraint = `\n${getPromptText(config.engineLanguage, 'translatedContext', { origLang }, globalThis.navigator?.language || '')}\n${outputConstraint}`;
          } else {
            langConstraint = outputConstraint;
          }
        } else {
          langConstraint = baseLangConstraint();
        }

        let strictAntiAI = '';
        if (req.promptType === 'viral_rewrite') {
          strictAntiAI = `\n\n${getPromptText(config.engineLanguage, 'rewriteStrictRules', {}, globalThis.navigator?.language || '')}`;
        } else if (req.promptType === 'draft_reply') {
          strictAntiAI = `\n\n${getPromptText(config.engineLanguage, 'uniqueReplyOnly', {}, globalThis.navigator?.language || '')}`;
        }

        let regenerateConstraint = '';
        if (req.isRegenerate) {
          regenerateConstraint = buildStudioRegenerateInstruction(true);
        }

        const inputLockConstraint = req.promptType === 'viral_rewrite'
          ? buildInputLockedRewriteRules(textToProcess, config.engineLanguage)
          : '';

        if (['viral_rewrite', 'draft_reply'].includes(req.promptType)) {
          const generationId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const contentSkill = req.promptType === 'viral_rewrite'
            && config.contentSkillRollout?.zhPostStudio === true
            ? resolveContentSkill({
              language: config.engineLanguage,
              format: 'post',
              objective: 'studio_rewrite'
            })
            : null;
          try {
            const result = await orchestrateStudioGeneration({
              promptType: req.promptType,
              promptPrefix,
              sourceText: textToProcess,
              config,
              generationContext,
              engineLanguage: config.engineLanguage,
              langConstraint,
              inputLockConstraint,
              strictAntiAI,
              regenerateConstraint,
              includePerformanceMemory: req.promptType === 'viral_rewrite',
              contentSkill
            }, {
              callModel: prompt => callLLM(prompt, config, false),
              onPhase: (phase) => {
                addLog('info', 'studio_generation_phase', [generationId, phase]);
                notifyStudioPhase(phase, req.streamId || '');
              }
            });
            const xUser = config.xAuth?.user || {};
            const session = buildStudioSessionFromResult({
              generationId,
              promptType: req.promptType,
              accountId: String(xUser.id || xUser.username || ''),
              sourceText: textToProcess,
              inputContext: req.contextData || {},
              result,
              engineLanguage: config.engineLanguage
            });
            await prependGenerationSession(session);
            addLog('success', 'studio_generation_phase', [generationId, 'complete']);
            notifyStudioPhase('complete', req.streamId || '');
            sendResponse({
              success: true,
              result: result.text,
              generationSession: session,
              candidates: result.candidates,
              quality: result.quality
            });
          } catch (error) {
            addLog('error', 'studio_generation_phase', [generationId, 'failed']);
            notifyStudioPhase('failed', req.streamId || '');
            sendResponse({ success: false, error: error.message });
          }
          return;
        }

        const finalPrompt = promptPrefix + langConstraint + '\n\n【待处理文本】：\n' + textToProcess;
        callLLM(finalPrompt, config, false)
          .then(result => sendResponse({ success: true, result, quality: { approved: true, issues: [] } }))
          .catch(error => sendResponse({ success: false, error: error.message }));
      });
    };

    if (request.action === "extractAndRewrite") {
      addLog('info', 'extract_link_request', [request.promptType]);
      const originalText = request.contextData ? (request.contextData.text || '') : '';
      const urlMatch = originalText.match(/(https?:\/\/[^\s]+)/);
      const url = urlMatch ? urlMatch[0] : '';

      if (!url) {
        executeMagicPromptCore(request, originalText, sender.tab);
        return true;
      }

      chrome.storage.local.get(['apiKey', 'datahubApiKey'], (res) => {
        const isComplexPlatform = url.match(/(zhihu\.com|feishu\.cn|mp\.weixin\.qq\.com|douyin\.com|bilibili\.com|xiaohongshu\.com|xhslink\.com|tiktok\.com|kuaishou\.com|reddit\.com)/i);
        const datahubApiKey = String(res.datahubApiKey || '').trim();
        const useDatahub = Boolean(isComplexPlatform && datahubApiKey);
        let fetchPromise;

        if (useDatahub) {
          fetchPromise = fetchDataHubExtractedText(url, datahubApiKey).catch((error) => {
            addLog('warn', 'datahub_fallback_jina', [error.message]);
            return fetchJinaExtractedText(url);
          });
        } else {
          if (isComplexPlatform) addLog('warn', 'datahub_key_missing_fallback');
          fetchPromise = fetchJinaExtractedText(url);
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
            addLog('success', 'extract_trial_success', [cleanText.length]);
            sendResponse({ success: true, result: `【纯提取体验模式】\n您尚未配置 AI API Key，无法进行大模型改写。以下是直接为您从网页中提取的纯文本内容：\n\n--------------------------\n\n${cleanText}` });
          } else {
            addLog('success', 'link_extract_success', [cleanText.length]);
            executeMagicPromptCore(request, enhancedText, sender.tab);
          }
        })
        .catch(error => {
          addLog('error', 'link_extract_failed', [error.message]);
          sendResponse({ success: false, error: 'EXTRACTION_LIMITED', message: '该链接内容受限或包含人机验证，请尝试手动复制文本进行仿写~' });
        });
      });
    } else {
      addLog('info', 'magic_prompt_request', [request.promptType]);
      const textToProcess = request.contextData ? (request.contextData.text || request.contextData.bio || '') : '';
      executeMagicPromptCore(request, textToProcess, sender.tab);
    }
    return true;
  } else if (request.action === "rewriteTweet") {
    addLog('info', 'rewrite_request_received', [request.archetype, request.style]);

    const prompt = buildDirectRewritePrompt({
      author: request.author,
      text: request.text,
      archetypeLabel: request.archetypeLabel,
      styleLabel: request.styleLabel,
      customPrompt: request.customPrompt
    });

    chrome.storage.local.get([
      'apiKey', 'apiProvider', 'aiModel', 'engineLanguage',
      'styleTrainingData', 'feedbackLoopData', 'feedbackLikes', 'feedbackDislikes',
      'aiPersona', 'agentMemory', 'aiMemory', 'accountBio', 'leadTarget',
      'onboardingStrategy', 'competitorReport', 'accountPerformanceBaseline'
    ], (config) => {
      let langConstraint = '';
      const rawEngineLanguage = config.engineLanguage || 'auto';
      config.engineLanguage = normalizeEngineLanguage(rawEngineLanguage, globalThis.navigator?.language || '');
      const generationContext = buildGenerationContext(config, { promptType: 'viral_rewrite' });
      langConstraint = getLanguageInstruction(config.engineLanguage, 'rewrite', globalThis.navigator?.language || '');
      const inputLockConstraint = buildInputLockedRewriteRules(request.text || '', config.engineLanguage);
      const finalPrompt = buildStudioPrompt({
        promptType: 'viral_rewrite',
        promptPrefix: prompt,
        textToProcess: request.text || '',
        config,
        generationContext,
        langConstraint,
        inputLockConstraint,
        strictAntiAI: `\n\n${getPromptText(config.engineLanguage, 'rewriteStrictRules', {}, globalThis.navigator?.language || '')}`,
        includePerformanceMemory: true,
        includeTopPerformanceSamples: false,
        sourceLabel: '【原推内容 - 唯一主题来源】'
      });

      callLLM(finalPrompt, config)
        .then(rewrittenText => {
          addLog('success', 'rewrite_generation_complete');
          sendResponse({ success: true, rewrittenText });
        })
        .catch(error => {
          addLog('error', 'rewrite_generation_failed', [error.message]);
          sendResponse({ success: false, error: error.message });
        });
    });
    return true;
  } else if (request.action === "agentChat") {
    context.handleAgentChat(request.message || '')
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => {
        addLog('error', 'agent_chat_failed', [error.message]);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  return false;
}

export {
  buildInputLockedRewriteRules
};
