const fs = require('fs');
let bg = fs.readFileSync('background.js', 'utf8');

const targetStr = "promptPrefix = '你是一位 X 上资深运营专家，擅长病毒式传播。任务：将我提供的原始内容进行“推特化”二创重写，打造下一条高传播推文。要求：1. 不改变原意，保留核心价值点 2. 第一行必须是极其吸睛的钩子 3. 长段落拆成短句或列表 4. 结尾视情况添加互动，但绝对禁止在开头和结尾重复相同的句子，避免冗余 5. 总长度控制在 280 字符内。请直接输出重写后的内容：\\n\\n原始内容：\\n';";
const replacementStr = "promptPrefix = '你是一位 X (Twitter) 千万级爆款操盘手。你的任务是对提供的【原始内容】进行深度“降维打击式”二创，绝不能仅仅是同义词替换或改变语序，而是要进行多维度的重构。\\n\\n请严格遵守以下【多维度重构法则】：\\n1. 【内容深度解构】：如果原文只有一句话或一个梗，请将其扩充为一个有场景感的微故事、犀利的延伸观点或反共识洞察；如果原文是长篇大论，请剥离所有废话，提取最核心的价值点，浓缩成高信息密度的金句或列表。\\n2. 【推特爆款结构】：\\n   - 钩子 (Hook)：第一行必须极度吸睛（制造悬念、反直觉、痛点共鸣），让人立刻停止滑动屏幕。\\n   - 骨架 (Body)：拒绝长篇大论，使用极简短句，多用换行留白，制造情绪起伏或逻辑反差。\\n   - 互动 (CTA)：结尾自然留下讨论空间，绝对禁止在结尾重复开头的钩子。\\n\\n请直接输出重构后的高传播推文：\\n\\n原始内容：\\n';";

if (bg.includes(targetStr)) {
  bg = bg.replace(targetStr, replacementStr);
  fs.writeFileSync('background.js', bg);
  console.log('Successfully upgraded viral_rewrite prompt');
} else {
  console.log('Target string not found in background.js');
}
