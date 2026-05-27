const fs = require('fs');
let js = fs.readFileSync('options/options.js', 'utf8');

const targetCode = `  const delBtn = document.createElement('button');
  delBtn.innerHTML = '<i data-lucide="x" width="14" height="14"></i>';
  delBtn.style.position = 'absolute';`;

const replaceCode = `  const mask = document.createElement('div');
  mask.className = 'style-item-mask';
  mask.style.position = 'absolute';
  mask.style.right = '2px';
  mask.style.top = '2px';
  mask.style.width = '40px';
  mask.style.height = '32px';
  mask.style.background = 'var(--bg-secondary, #F5F5F7)';
  mask.style.borderTopRightRadius = '10px';
  mask.style.borderBottomRightRadius = '10px';
  mask.style.pointerEvents = 'none';
  mask.style.zIndex = '5';
  
  // Create gradient fade for nicer effect
  const gradient = document.createElement('div');
  gradient.className = 'style-item-gradient';
  gradient.style.position = 'absolute';
  gradient.style.right = '42px';
  gradient.style.top = '2px';
  gradient.style.width = '24px';
  gradient.style.height = '32px';
  gradient.style.background = 'linear-gradient(to right, rgba(245,245,247,0), var(--bg-secondary, #F5F5F7))';
  gradient.style.pointerEvents = 'none';
  gradient.style.zIndex = '5';

  const delBtn = document.createElement('button');
  delBtn.innerHTML = '<i data-lucide="x" width="14" height="14"></i>';
  delBtn.style.position = 'absolute';
  delBtn.style.zIndex = '10';`;

const targetFocus = `  textarea.addEventListener('focus', () => {
    textarea.style.height = '100px';`;

const replaceFocus = `  textarea.addEventListener('focus', () => {
    mask.style.display = 'none';
    gradient.style.display = 'none';
    textarea.style.height = '100px';`;

const targetBlur = `  textarea.addEventListener('blur', () => {
    textarea.style.height = '36px';`;

const replaceBlur = `  textarea.addEventListener('blur', () => {
    mask.style.display = 'block';
    gradient.style.display = 'block';
    textarea.style.height = '36px';`;

const targetAppend = `  div.appendChild(textarea);
  div.appendChild(delBtn);`;

const replaceAppend = `  div.appendChild(textarea);
  div.appendChild(gradient);
  div.appendChild(mask);
  div.appendChild(delBtn);`;

if (js.includes(targetCode)) {
  js = js.replace(targetCode, replaceCode);
  js = js.replace(targetFocus, replaceFocus);
  js = js.replace(targetBlur, replaceBlur);
  js = js.replace(targetAppend, replaceAppend);
  fs.writeFileSync('options/options.js', js);
  console.log("Successfully added mask to options.js");
} else {
  console.log("Could not find targetCode");
}
