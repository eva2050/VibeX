const fs = require('fs');
let bg = fs.readFileSync('background.js', 'utf8');

const targetStr = `        callLLM(promptPrefix + langConstraint + styleConstraint + feedbackConstraint + strictAntiAI + '\\n\\n待处理文本：\\n' + textToProcess, config)
          .then(result => sendResponse({ success: true, result: result }))
          .catch(error => sendResponse({ success: false, error: error.message }));`;

const replacementStr = `        callLLM(promptPrefix + langConstraint + styleConstraint + feedbackConstraint + strictAntiAI + '\\n\\n待处理文本：\\n' + textToProcess, config, false, (chunk) => {
          chrome.runtime.sendMessage({ action: 'magicPromptStreamChunk', chunk: chunk });
          // If the request came from a specific tab, send it there too
          chrome.tabs.query({active: true}, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, { action: 'magicPromptStreamChunk', chunk: chunk }).catch(()=>null);
            });
          });
        })
          .then(result => {
             chrome.runtime.sendMessage({ action: 'magicPromptStreamEnd' });
             chrome.tabs.query({active: true}, (tabs) => {
               tabs.forEach(tab => {
                 chrome.tabs.sendMessage(tab.id, { action: 'magicPromptStreamEnd' }).catch(()=>null);
               });
             });
             sendResponse({ success: true, result: result });
          })
          .catch(error => sendResponse({ success: false, error: error.message }));`;

if (bg.includes(targetStr)) {
  bg = bg.replace(targetStr, replacementStr);
  fs.writeFileSync('background.js', bg);
  console.log("Successfully updated executeMagicPromptCore");
} else {
  console.log("Could not find targetStr in executeMagicPromptCore");
}
