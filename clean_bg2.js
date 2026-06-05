const fs = require('fs');
let code = fs.readFileSync('background.js', 'utf8');

// 1. Clean chatWithAgent1 prompt
code = code.replace(/账号画像：[\s\S]*?\$\{formatLeadAsset\(config\.onboardingStrategy\)\}/g, '');
code = code.replace(/当前长期记忆：[\s\S]*?\$\{formatAgentMemory\(config\.agentMemory\)\}/g, '');
code = code.replace(/当前增长模板：[\s\S]*?\$\{formatGrowthPlaybook\(playbook\)\}/g, '');

// 2. Clean generatePostDrafts prompt
code = code.replace(/\$\{formatAgentMemory\(agentMemoryOverride \|\| config\.agentMemory\)\}/g, '');
code = code.replace(/\$\{formatLeadAsset\(config\.onboardingStrategy\)\}/g, '');
code = code.replace(/\$\{formatGrowthPlaybook\(playbook\)\}/g, '');
code = code.replace(/账号定位：[\s\S]*?- 核心发文目标：\$\{persona\.goals \|\| leadTarget\}[\s\S]*?长期记忆：[\s\S]*?当前增长模板：[\s\S]*?\$\{playbook\}/g, '');

// 3. Clean evaluateAutoPostQueue
code = code.replace(/const memoryContext = formatAgentMemory\(config\.agentMemory\);/g, 'const memoryContext = "";');
code = code.replace(/const playbookContext = formatGrowthPlaybook\(playbook\);/g, 'const playbookContext = "";');

fs.writeFileSync('background.js', code);
