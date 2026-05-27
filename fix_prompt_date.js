const fs = require('fs');
let js = fs.readFileSync('background.js', 'utf8');

const targetStr = `async function executeMagicPromptCore(req, sendResponse) {
    chrome.storage.local.get(['config'], (res) => {
      const config = res.config || {};`;

const replaceStr = `async function executeMagicPromptCore(req, sendResponse) {
    chrome.storage.local.get(['config'], (res) => {
      const config = res.config || {};
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const timeContext = \`\\n\\n【背景设定】：当前时间是 \${currentYear}年\${currentMonth}月。如果引用数据或事实，请务必使用此时的最新认知，绝不要使用2023年的旧数据或旧观点。\`;`;

const targetCall = `        callLLM(promptPrefix + langConstraint + styleConstraint + feedbackConstraint + strictAntiAI + '\\n\\n待处理文本：\\n' + textToProcess, config, false, (chunk) => {`;
const replaceCall = `        callLLM(promptPrefix + timeContext + langConstraint + styleConstraint + feedbackConstraint + strictAntiAI + '\\n\\n待处理文本：\\n' + textToProcess, config, false, (chunk) => {`;

if (js.includes(targetStr)) {
  js = js.replace(targetStr, replaceStr);
  js = js.replace(targetCall, replaceCall);
  fs.writeFileSync('background.js', js);
  console.log("Successfully fixed prompt date");
} else {
  console.log("Could not find target string");
}
