const fs = require('fs');
let code = fs.readFileSync('background.js', 'utf8');

function removeBlock(startString, endString) {
  const start = code.indexOf(startString);
  if (start === -1) return;
  const end = code.indexOf(endString, start);
  if (end === -1) return;
  code = code.substring(0, start) + code.substring(end + endString.length);
}

// remove hasPersona
code = code.replace(/function hasPersona[\s\S]*?\}\s*/, '');

// remove hasPersona references in ready checks
code = code.replace(/&& hasPersona\(res\.aiPersona\)/g, '');
code = code.replace(/&& hasPersona\(res\.aiPersona\) && Boolean\(res\.competitorReport\)/g, '');
code = code.replace(/&& res\.leadTarget && hasPersona\(res\.aiPersona\) && res\.competitorReport/g, '');

// Clean config.aiPersona from generateReply
code = code.replace(/persona: config\.aiPersona,/g, '');
code = code.replace(/const personaContext = `[\s\S]*?`;/g, 'const personaContext = ``;');
code = code.replace(/【你的账号人设与特征】：\$\{config\.aiPersona\?\.characteristics \|\| '未填写'\}\\n【你的目标受众画像】：\$\{config\.aiPersona\?\.targetUsers \|\| '未填写'\}\\n【你的核心引流目标】：\$\{config\.aiPersona\?\.goals \|\| config\.leadTarget\}\\n\\n/g, '');

// Clean generatePostDrafts
code = code.replace(/const isPersonaEmpty = !config\.aiPersona[\s\S]*?;/g, 'const isPersonaEmpty = false;');
code = code.replace(/const persona = config\.aiPersona;/g, 'const persona = {};');

// Clean evaluateAutoPostQueue
code = code.replace(/const isPersonaEmpty = !res\.aiPersona[\s\S]*?;/g, 'const isPersonaEmpty = false;');

// Clean storage listener
removeBlock('if (changes.aiPersona && changes.aiPersona.newValue) {', '}\n    }\n');

// Clean checkAutoOps
code = code.replace(/if \(res\.aiPersona && changes\.tweetQueue\.newValue && queue\.length < DRAFT_REFILL_THRESHOLD\) \{/g, 'if (changes.tweetQueue.newValue && queue.length < DRAFT_REFILL_THRESHOLD) {');

fs.writeFileSync('background.js', code);
