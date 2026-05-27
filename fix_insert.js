const fs = require('fs');
let js = fs.readFileSync('content/x_scraper.js', 'utf8');

const targetStr = `function insertIntoDraftJs(editor, text) {
  editor.focus();
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', text);
  editor.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true
  }));
}`;

const replaceStr = `function insertIntoDraftJs(editor, text) {
  editor.focus();
  try {
    const success = document.execCommand('insertText', false, text);
    if (!success) throw new Error('execCommand failed');
  } catch(e) {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true
    }));
  }
}`;

if (js.includes(targetStr)) {
  js = js.replace(targetStr, replaceStr);
  fs.writeFileSync('content/x_scraper.js', js);
  console.log("Successfully replaced insertIntoDraftJs");
} else {
  console.log("Could not find insertIntoDraftJs target string");
}
