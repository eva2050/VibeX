const fs = require('fs');
let js = fs.readFileSync('options/options.js', 'utf8');

const targetStr = `        chrome.runtime.sendMessage({
          action: isUrl ? 'extractAndRewrite' : 'magicPrompt',
          promptType: actionType,
          contextData: currentContext.data
        }, (response) => {`;

const replacementStr = `        resultBox.value = ''; // Clear for streaming
        chrome.runtime.sendMessage({
          action: isUrl ? 'extractAndRewrite' : 'magicPrompt',
          promptType: actionType,
          contextData: currentContext.data
        }, (response) => {`;

if (js.includes(targetStr)) {
  js = js.replace(targetStr, replacementStr);
}

// Add stream listener
const listenerStr = `chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'magicPromptStreamChunk') {
    const resultBox = document.getElementById('generation-result');
    if (resultBox) {
      resultBox.value += request.chunk;
      resultBox.scrollTop = resultBox.scrollHeight;
    }
  }
});
`;

if (!js.includes('magicPromptStreamChunk')) {
  js += '\n' + listenerStr;
}

fs.writeFileSync('options/options.js', js);
console.log("Successfully updated options.js for streaming");
