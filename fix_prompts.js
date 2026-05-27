const fs = require('fs');
let bg = fs.readFileSync('background.js', 'utf8');

// 1. Fix langConstraint
const targetLang = `        let langConstraint = '';
        if (config.engineLanguage === 'zh') langConstraint = '\\n【语言约束】：必须使用中文回复。';
        else if (config.engineLanguage === 'en') langConstraint = '\\n【语言约束】：必须使用英文回复。';
        else langConstraint = '\\n【语言约束】：请自动识别并使用原推文的语言进行回复。';`;

const replacementLang = `        let langConstraint = '';
        const actionName = req.promptType === 'viral_rewrite' ? '重写' : '回复';
        if (config.engineLanguage === 'zh') langConstraint = \`\\n【语言约束】：必须使用中文\${actionName}。\`;
        else if (config.engineLanguage === 'en') langConstraint = \`\\n【语言约束】：必须使用英文\${actionName}。\`;
        else langConstraint = \`\\n【语言约束】：请自动识别并使用原推文的语言进行\${actionName}。\`;`;

if (bg.includes(targetLang)) {
  bg = bg.replace(targetLang, replacementLang);
  console.log("Replaced langConstraint");
} else {
  console.log("Could not find langConstraint");
}

// 2. Fix viral_rewrite prompt to stop hallucinating hashtags
const targetPrompt = `   - 互动 (CTA)：结尾自然留下讨论空间，绝对禁止在结尾重复开头的钩子。\n\n请直接输出重构后的高传播推文：\n\n原始内容：\n';`;
const replacementPrompt = `   - 互动 (CTA)：结尾自然留下讨论空间，绝对禁止在结尾重复开头的钩子。\n   - 标签限制：如果需要添加 #标签，绝对不能超过 3 个。\n【严重警告】：完成正文后必须立即停止输出！绝对禁止无限重复相同的字词或标签！\n\n请直接输出重构后的高传播推文：\n\n原始内容：\n';`;

if (bg.includes(targetPrompt)) {
  bg = bg.replace(targetPrompt, replacementPrompt);
  console.log("Replaced viral_rewrite prompt");
} else {
  console.log("Could not find viral_rewrite prompt");
}

fs.writeFileSync('background.js', bg);
console.log("Successfully fixed prompts");
