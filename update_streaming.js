const fs = require('fs');
let bg = fs.readFileSync('background.js', 'utf8');

const callLlmStart = 'async function callLLM(prompt, config, requireJson = false) {';
const callLlmEnd = "return data.choices[0].message.content;\n}";

const callLlmIndex1 = bg.indexOf(callLlmStart);
const callLlmIndex2 = bg.indexOf(callLlmEnd, callLlmIndex1);

if (callLlmIndex1 !== -1 && callLlmIndex2 !== -1) {
  const newCallLLM = `async function callLLM(prompt, config, requireJson = false, onChunk = null) {
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
      const lines = buffer.split('\\n');
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
      contents: [{ parts: [{ text: prompt }] }]
    };
    if (requireJson) {
      bodyObj.generationConfig = { responseMimeType: "application/json" };
    }
    
    const isStream = !!onChunk && !requireJson;
    const url = isStream 
      ? \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=\${config.apiKey}\`
      : \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=\${config.apiKey}\`;
      
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
  
  // OpenAI-compatible providers: openrouter, qwen, deepseek
  const endpoints = {
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions'
  };
  
  const endpoint = endpoints[provider];
  if (!endpoint) {
    throw new Error(\`不支持的 AI 服务商: \${provider}\`);
  }
  
  const model = config.aiModel || 'google/gemini-2.5-flash';
  const reqBody = {
    model: model,
    messages: [{ role: 'user', content: prompt }]
  };
  
  // JSON hint for supported providers
  if (requireJson && provider === 'deepseek') {
    reqBody.response_format = { type: "json_object" };
  }
  
  const isStream = !!onChunk && !requireJson;
  if (isStream) reqBody.stream = true;
  
  const headers = {
    'Authorization': \`Bearer \${config.apiKey}\`,
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
}`;
  bg = bg.substring(0, callLlmIndex1) + newCallLLM + bg.substring(callLlmIndex2 + callLlmEnd.length);
  fs.writeFileSync('background.js', bg);
  console.log("Successfully updated callLLM in background.js");
} else {
  console.log("Could not find callLLM bounds");
}
