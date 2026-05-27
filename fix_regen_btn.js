const fs = require('fs');
let js = fs.readFileSync('content/x_scraper.js', 'utf8');

// 1. Hide the button by default in the observer
const target1 = "regenBtn.style.cssText = 'margin-right: 12px; cursor: pointer; display: inline-flex;";
const replacement1 = "regenBtn.style.cssText = 'margin-right: 12px; cursor: pointer; display: none;";

if (js.includes(target1)) {
  js = js.replace(target1, replacement1);
} else {
  console.log("Could not find display: inline-flex; to replace");
}

// 2. Show the button after inserting into DraftJs in replyBtn logic
const target2 = `if (editor) {
            editor.focus();
            insertIntoDraftJs(editor, res.result);
          }`;
const replacement2 = `if (editor) {
            editor.focus();
            insertIntoDraftJs(editor, res.result);
            // Show the regenerate button only when AI is used
            const regenBtns = document.querySelectorAll('.magic-regen-native-btn');
            regenBtns.forEach(b => b.style.display = 'inline-flex');
          }`;

if (js.includes(target2)) {
  js = js.replace(target2, replacement2);
} else {
  console.log("Could not find target2");
}

// 3. Also show it when the options page sends 'openComposerAndFill'
const target3 = `if (editor) {
          editor.focus();
          insertIntoDraftJs(editor, request.text);
        }`;
const replacement3 = `if (editor) {
          editor.focus();
          insertIntoDraftJs(editor, request.text);
          const regenBtns = document.querySelectorAll('.magic-regen-native-btn');
          regenBtns.forEach(b => b.style.display = 'inline-flex');
        }`;

if (js.includes(target3)) {
  js = js.replace(target3, replacement3);
}

fs.writeFileSync('content/x_scraper.js', js);
console.log("Successfully fixed regenerate button visibility");
