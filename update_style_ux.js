const fs = require('fs');
let js = fs.readFileSync('options/options.js', 'utf8');

const targetFuncStart = 'function addStyleItem(text = \'\', container = null) {';
if (!js.includes(targetFuncStart)) {
  console.log("Could not find addStyleItem function");
  process.exit(1);
}

const replacementRegex = /textarea\.className = 'modern-input';\s*textarea\.style\.resize = 'vertical';\s*textarea\.rows = 3;/;
const replacementStr = `textarea.className = 'modern-input';
  textarea.style.resize = 'none';
  textarea.rows = 1;
  textarea.style.height = '36px';
  textarea.style.minHeight = '36px';
  textarea.style.transition = 'height 0.2s ease, border-color 0.2s ease';
  textarea.style.overflow = 'hidden';
  textarea.style.whiteSpace = 'nowrap';
  textarea.style.textOverflow = 'ellipsis';
  
  textarea.addEventListener('focus', () => {
    textarea.style.height = '100px';
    textarea.style.resize = 'vertical';
    textarea.style.overflow = 'auto';
    textarea.style.whiteSpace = 'normal';
  });
  
  textarea.addEventListener('blur', () => {
    textarea.style.height = '36px';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.whiteSpace = 'nowrap';
    textarea.scrollTop = 0;
  });`;

if (js.match(replacementRegex)) {
  js = js.replace(replacementRegex, replacementStr);
  fs.writeFileSync('options/options.js', js);
  console.log("Successfully updated addStyleItem UX in options.js");
} else {
  console.log("Could not find the target textarea attributes to replace.");
}
