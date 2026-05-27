const fs = require('fs');
let js = fs.readFileSync('options/options.js', 'utf8');

// 1. Update saveMemory
const saveMemoryRegex = /const styleDataInput = document\.getElementById\('style-training-data'\);\s*const styleTrainingData = styleDataInput \? styleDataInput\.value\.trim\(\) : '';/;
const saveMemoryReplacement = `const styleTrainingData = Array.from(document.querySelectorAll('#style-training-list textarea')).map(t => t.value.trim()).filter(t => t !== '');`;

js = js.replace(saveMemoryRegex, saveMemoryReplacement);

// 2. Update loadMemory
const loadMemoryRegex = /const styleDataInput = document\.getElementById\('style-training-data'\);\s*if \(styleDataInput\) \{\s*styleDataInput\.value = items\.styleTrainingData \|\| '';\s*\}/;
const loadMemoryReplacement = `
    const styleList = document.getElementById('style-training-list');
    if (styleList) {
      styleList.innerHTML = '';
      let styleData = items.styleTrainingData;
      if (!Array.isArray(styleData)) {
        styleData = styleData ? [styleData] : [];
      }
      if (styleData.length === 0) {
        addStyleItem('', styleList);
      } else {
        styleData.forEach(text => addStyleItem(text, styleList));
      }
    }
`;

js = js.replace(loadMemoryRegex, loadMemoryReplacement);

// 3. Add addStyleItem function and listener
const addStyleItemFunc = `
function addStyleItem(text = '', container = null) {
  if (!container) container = document.getElementById('style-training-list');
  if (!container) return;
  
  const div = document.createElement('div');
  div.style.position = 'relative';
  
  const textarea = document.createElement('textarea');
  textarea.className = 'modern-input';
  textarea.style.resize = 'vertical';
  textarea.rows = 3;
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
}
`;

if (!js.includes('function addStyleItem')) {
  js += '\n' + addStyleItemFunc;
  
  // Add listener for btn-add-style inside setupCustomSelects or similar
  const initCoreRegex = /setupStorageListener\(\);/;
  const initCoreReplacement = `setupStorageListener();\n  const btnAddStyle = document.getElementById('btn-add-style');\n  if (btnAddStyle) btnAddStyle.addEventListener('click', () => addStyleItem());`;
  js = js.replace(initCoreRegex, initCoreReplacement);
}

fs.writeFileSync('options/options.js', js);
console.log('options.js updated successfully');
