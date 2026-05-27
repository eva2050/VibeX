const fs = require('fs');
let js = fs.readFileSync('options/options.js', 'utf8');

const funcStart = 'function addStyleItem(text = \'\', container = null) {';
const startIndex = js.indexOf(funcStart);

if (startIndex === -1) {
  console.log('function not found');
  process.exit(1);
}

// Find the end of the function (the last closing brace)
// Since it's at the end of the file, we can just replace everything from funcStart to the end.
const newFunc = `function addStyleItem(text = '', container = null) {
  if (!container) container = document.getElementById('style-training-list');
  if (!container) return;
  
  const div = document.createElement('div');
  div.style.position = 'relative';
  
  const textarea = document.createElement('textarea');
  textarea.className = 'modern-input';
  textarea.style.resize = 'none';
  textarea.rows = 1;
  textarea.style.height = '36px';
  textarea.style.minHeight = '36px';
  
  // Perfect vertical centering and spacing
  textarea.style.paddingTop = '8px';
  textarea.style.paddingBottom = '8px';
  textarea.style.paddingRight = '44px'; // Extra large padding to avoid X button
  textarea.style.lineHeight = '18px';
  
  textarea.style.transition = 'height 0.2s ease, border-color 0.2s ease, color 0.2s ease, font-size 0.2s ease, padding 0.2s ease';
  textarea.style.overflow = 'hidden';
  textarea.style.whiteSpace = 'nowrap';
  textarea.style.textOverflow = 'ellipsis';
  textarea.style.color = '#86868b'; // Gray text when collapsed
  textarea.style.fontSize = '13px'; // Smaller text when collapsed
  
  textarea.addEventListener('focus', () => {
    textarea.style.height = '100px';
    textarea.style.resize = 'vertical';
    textarea.style.overflow = 'auto';
    textarea.style.whiteSpace = 'normal';
    textarea.style.color = 'var(--text-main)'; // Restore color
    textarea.style.fontSize = ''; // Restore font size
    textarea.style.paddingTop = '14px';
    textarea.style.paddingBottom = '14px';
  });
  
  textarea.addEventListener('blur', () => {
    textarea.style.height = '36px';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.whiteSpace = 'nowrap';
    textarea.style.color = '#86868b'; // Gray text
    textarea.style.fontSize = '13px'; // Smaller text
    textarea.style.paddingTop = '8px';
    textarea.style.paddingBottom = '8px';
    textarea.scrollTop = 0;
  });
  textarea.placeholder = '粘贴一条过往的高赞推文...';
  textarea.value = text;
  
  textarea.addEventListener('input', () => {
    saveMemory();
  });
  
  const delBtn = document.createElement('button');
  delBtn.innerHTML = '<i data-lucide="x" width="14" height="14"></i>';
  delBtn.style.position = 'absolute';
  delBtn.style.right = '8px';
  delBtn.style.top = '8px';
  delBtn.style.background = 'rgba(0,0,0,0.05)';
  delBtn.style.border = 'none';
  delBtn.style.borderRadius = '50%';
  delBtn.style.width = '24px';
  delBtn.style.height = '24px';
  delBtn.style.display = 'flex';
  delBtn.style.alignItems = 'center';
  delBtn.style.justifyContent = 'center';
  delBtn.style.cursor = 'pointer';
  delBtn.style.color = '#86868b';
  delBtn.style.zIndex = '10'; // Make sure it sits on top
  
  delBtn.addEventListener('click', () => {
    div.remove();
    saveMemory();
  });
  
  delBtn.addEventListener('mouseover', () => delBtn.style.background = 'rgba(255,59,48,0.1)');
  delBtn.addEventListener('mouseout', () => delBtn.style.background = 'rgba(0,0,0,0.05)');
  
  div.appendChild(textarea);
  div.appendChild(delBtn);
  container.appendChild(div);
  
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: div });
}`;

js = js.substring(0, startIndex) + newFunc;
fs.writeFileSync('options/options.js', js);
console.log('Function successfully replaced');
