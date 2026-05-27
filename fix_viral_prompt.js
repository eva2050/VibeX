const fs = require('fs');
let bg = fs.readFileSync('background.js', 'utf8');

const targetStr = "promptPrefix = '你是一位 X 上资深运营专家，擅长病毒式传播。任务：将我提供的原始内容进行“推特化”二创重写，打造下一条高传播推文。要求：1. 不改变原意，保留核心价值点 2. 第一行必须是强钩子 3. 长段落拆成短句或列表 4. 结尾要有互动或行动号召 5. 总长度控制在 280 字符内。请直接输出重写后的内容：\\n\\n原始内容：\\n';";
const replacementStr = "promptPrefix = '你是一位 X 上资深运营专家，擅长病毒式传播。任务：将我提供的原始内容进行“推特化”二创重写，打造下一条高传播推文。要求：1. 不改变原意，保留核心价值点 2. 第一行必须是极其吸睛的钩子 3. 长段落拆成短句或列表 4. 结尾视情况添加互动，但绝对禁止在开头和结尾重复相同的句子，避免冗余 5. 总长度控制在 280 字符内。请直接输出重写后的内容：\\n\\n原始内容：\\n';";

if (bg.includes(targetStr)) {
  bg = bg.replace(targetStr, replacementStr);
  fs.writeFileSync('background.js', bg);
  console.log('Successfully updated viral_rewrite prompt');
} else {
  console.log('Target string not found in background.js');
}
