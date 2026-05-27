const fs = require('fs');
let js = fs.readFileSync('options/options.js', 'utf8');

const anchor = "// Auto-resize manual input";
const index = js.indexOf(anchor);

if (index !== -1) {
  // Find the end of that block
  const endOfBlock = js.indexOf("}", index) + 1;
  js = js.substring(0, endOfBlock) + "\n";
  fs.writeFileSync('options/options.js', js);
}
