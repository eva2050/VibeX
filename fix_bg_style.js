const fs = require('fs');
let bg = fs.readFileSync('background.js', 'utf8');

const regex = /styleConstraint = \`\\\\n\\\\n【严格文风约束】：.*<文风参考>\\\\n\$\{config\.styleTrainingData\}\\\\n<\/文风参考>\\\\n\\\\n\`;/;
// Wait, the string in background.js has newlines. Let's do a substring replace.
const target = "\\n<文风参考>\\n${config.styleTrainingData}\\n</文风参考>";
const replacement = "\\n<文风参考>\\n${Array.isArray(config.styleTrainingData) ? config.styleTrainingData.map((s,i) => `[语料 ${i+1}]\\n${s}`).join('\\n\\n') : config.styleTrainingData}\\n</文风参考>";

if (bg.includes(target)) {
  bg = bg.replace(target, replacement);
  fs.writeFileSync('background.js', bg);
  console.log("background.js updated for array style training data.");
} else {
  console.log("Could not find target in background.js");
}
