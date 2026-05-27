const fs = require('fs');
let code = fs.readFileSync('content/x_scraper.js', 'utf8');

const pasteFunction = `
function insertIntoDraftJs(editor, text) {
  editor.focus();
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', text);
  editor.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true
  }));
}
`;

// Insert the paste function at the top
if (!code.includes('function insertIntoDraftJs')) {
  code = pasteFunction + code;
}

// Replace all insertText usages
code = code.replace(/document\.execCommand\('insertText', false, '✨ 正在生成神回复\.\.\.'\);/g, `showToast('✨ 正在生成神回复...', 'system');`);
code = code.replace(/document\.execCommand\('insertText', false, '✨ 正在重新生成\.\.\.'\);/g, `showToast('✨ 正在重新生成...', 'system');`);

code = code.replace(/document\.execCommand\('selectAll', false, null\);\s*document\.execCommand\('insertText', false, res\.result\);/g, `insertIntoDraftJs(editor || ed, res.result);`);

fs.writeFileSync('content/x_scraper.js', code);
