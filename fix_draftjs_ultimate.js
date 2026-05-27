const fs = require('fs');
let js = fs.readFileSync('content/x_scraper.js', 'utf8');

const targetStr = `function insertIntoDraftJs(editor, text) {
  editor.focus();
  try {
    const range = document.createRange();
    range.selectNodeContents(editor);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    
    const success = document.execCommand('insertText', false, text);
    editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
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

const replaceStr = `function insertIntoDraftJs(editor, text) {
  editor.focus();
  
  // 1. Force native selection of all contents
  const range = document.createRange();
  range.selectNodeContents(editor);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  
  // 2. FORCE React Draft.js to sync the selection state
  document.dispatchEvent(new Event('selectionchange'));
  
  // 3. Dispatch native paste event. Draft.js will replace the selected text.
  setTimeout(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true
    }));
  }, 10); // Tiny delay to ensure React state updates before pasting
}`;

if (js.includes(targetStr)) {
  js = js.replace(targetStr, replaceStr);
  fs.writeFileSync('content/x_scraper.js', js);
  console.log("Successfully injected ultimate Draft.js fix");
} else {
  console.log("Could not find targetStr");
}
