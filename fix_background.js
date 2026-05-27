const fs = require('fs');
let bg = fs.readFileSync('background.js', 'utf8');

const targetStr = "promptPrefix = '你是一位混迹推特多年的资深真实网友。任务：请使用“' + currentReplyStrategy + '”的策略，为下面这条推文写一条高质量的破冰回复。要求：口语化、不要有AI翻译腔，字数在100字以内。\\n\\n原推文：\\n';";
const replacementStr = "promptPrefix = '你是一位混迹推特多年的资深真实网友。任务：请使用“' + currentReplyStrategy + '”的策略，为下面这条推文写一条高质量的破冰回复。要求：口语化、不要有AI翻译腔，字数在100字以内。绝对不要在输出中包含策略名本身（例如不要输出“【专业补充】极度赞同...”等字样），直接输出回复的正文内容。\\n\\n原推文：\\n';";

if (bg.includes(targetStr)) {
  bg = bg.replace(targetStr, replacementStr);
  fs.writeFileSync('background.js', bg);
  console.log('Successfully updated background.js');
} else {
  console.log('Target string not found in background.js');
}
