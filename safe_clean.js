const fs = require('fs');
let code = fs.readFileSync('background.js', 'utf8');

function removeBlock(startString, endString) {
  const start = code.indexOf(startString);
  if (start === -1) return;
  const end = code.indexOf(endString, start);
  if (end === -1) return;
  code = code.substring(0, start) + code.substring(end + endString.length);
}

// 1. Remove formatAgentMemory
removeBlock('function formatAgentMemory(memory = {}) {', "return sections.length > 0 ? sections.join('\\n\\n') : '暂无长期记忆。';\n}\n");

// 2. Remove formatGrowthPlaybook & friends
removeBlock('function selectGrowthPlaybook(context = {}) {', 'function formatReplyOpportunity(opportunity = {}) {');
// Restore a simple selectGrowthPlaybook
code = code.replace(/function formatReplyOpportunity/, 'function selectGrowthPlaybook(context = {}) {\n  return GROWTH_PLAYBOOKS.indie_builder;\n}\n\nfunction formatReplyOpportunity');

// 3. Remove variables from chrome.storage.local.get arrays
const varsToRemove = ['leadTarget', 'aiPersona', 'agentMemory', 'competitorReport', 'accountBio', 'onboardingStrategy'];
varsToRemove.forEach(v => {
  const regex = new RegExp(`'${v}',?\\s*`, 'g');
  code = code.replace(regex, '');
});

// 4. Remove `isPersonaEmpty` checks in checkAutoOps
code = code.replace(/const isPersonaEmpty = \!res\.aiPersona[\s\S]*?;/, '');
code = code.replace(/\|\|\s*isPersonaEmpty/, '');
removeBlock('if (isPersonaEmpty) {', "if (!res.isRunning) {");

// 5. Clean chatWithAgent1
code = code.replace(/\$\{formatLeadAsset\(config\.onboardingStrategy\)\}/g, '');
code = code.replace(/\$\{formatAgentMemory\(config\.agentMemory\)\}/g, '');
code = code.replace(/\$\{formatGrowthPlaybook\(playbook\)\}/g, '');

// 6. Clean generatePostDrafts
code = code.replace(/\$\{formatAgentMemory\(agentMemoryOverride \|\| config\.agentMemory\)\}/g, '');

// 7. Clean evaluateAutoPostQueue
code = code.replace(/const memoryContext = formatAgentMemory\(config\.agentMemory\);/, 'const memoryContext = "";');
code = code.replace(/const playbookContext = formatGrowthPlaybook\(playbook\);/, 'const playbookContext = "";');

// 8. Remove old pet stuff from previous conversation
removeBlock('} else if (request.action === "rewriteTweet") {', '} else if (request.action === "getVoices") {');
// replace `} else if (request.action === "getVoices") {` with `} else if (request.action === "getVoices") {` 
// wait, the removeBlock removed `} else if (request.action === "getVoices") {`? No, it only removed up to `endString` but wait, `endString` IS removed. Let's make it safe.
code = code.replace(/\} else if \(request\.action === "rewriteTweet"\) \{[\s\S]*?\} else if \(request\.action === "getVoices"\) \{/, '} else if (request.action === "getVoices") {');

code = code.replace(/if \(request\.promptType === 'generate_art'\) \{[\s\S]*?\} else if \(request\.promptType === 'profile_audit'\) \{[\s\S]*?\} else if \(request\.promptType === 'chat'\)/, "if (request.promptType === 'chat')");

code = code.replace(/if \(request\.isPetChat\) \{[\s\S]*?\} else \{([\s\S]*?)\}\s*\/\/\s*end isPetChat else/g, "$1");

fs.writeFileSync('background.js', code);
