const fs = require('fs');
let js = fs.readFileSync('options/options.js', 'utf8');

const regex = /textarea\.className = 'modern-input';\s*textarea\.style\.resize = 'none';\s*textarea\.rows = 1;\s*textarea\.style\.height = '36px';\s*textarea\.style\.minHeight = '36px';\s*textarea\.style\.transition = 'height 0\.2s ease, border-color 0\.2s ease';\s*textarea\.style\.overflow = 'hidden';\s*textarea\.style\.whiteSpace = 'nowrap';\s*textarea\.style\.textOverflow = 'ellipsis';\s*textarea\.addEventListener\('focus', \(\) => \{\s*textarea\.style\.height = '100px';\s*textarea\.style\.resize = 'vertical';\s*textarea\.style\.overflow = 'auto';\s*textarea\.style\.whiteSpace = 'normal';\s*\}\);\s*textarea\.addEventListener\('blur', \(\) => \{\s*textarea\.style\.height = '36px';\s*textarea\.style\.resize = 'none';\s*textarea\.style\.overflow = 'hidden';\s*textarea\.style\.whiteSpace = 'nowrap';\s*textarea\.scrollTop = 0;\s*\}\);/;

const replacement = `textarea.className = 'modern-input';
  textarea.style.resize = 'none';
  textarea.rows = 1;
  textarea.style.height = '36px';
  textarea.style.minHeight = '36px';
  textarea.style.transition = 'height 0.2s ease, border-color 0.2s ease, color 0.2s ease, font-size 0.2s ease';
  textarea.style.overflow = 'hidden';
  textarea.style.whiteSpace = 'nowrap';
  textarea.style.textOverflow = 'ellipsis';
  textarea.style.paddingRight = '36px'; // Prevent text overlapping the X button
  textarea.style.color = '#86868b'; // Gray text when collapsed
  textarea.style.fontSize = '13px'; // Smaller text when collapsed
  
  textarea.addEventListener('focus', () => {
    textarea.style.height = '100px';
    textarea.style.resize = 'vertical';
    textarea.style.overflow = 'auto';
    textarea.style.whiteSpace = 'normal';
    textarea.style.color = 'var(--text-main)'; // Restore color
    textarea.style.fontSize = ''; // Restore font size
  });
  
  textarea.addEventListener('blur', () => {
    textarea.style.height = '36px';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.whiteSpace = 'nowrap';
    textarea.style.color = '#86868b'; // Gray text
    textarea.style.fontSize = '13px'; // Smaller text
    textarea.scrollTop = 0;
  });`;

if (js.match(regex)) {
  js = js.replace(regex, replacement);
  fs.writeFileSync('options/options.js', js);
  console.log('Successfully updated textarea UX');
} else {
  console.log('Could not find the target code to replace.');
}
