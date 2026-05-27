const fs = require('fs');
let code = fs.readFileSync('background.js', 'utf8');

const replacement = `
        let strategyPrompt = '';
        if (currentReplyStrategy.includes('杠精')) {
          strategyPrompt = '你是一个极其犀利、专挑漏洞的“抬杠带师”和反直觉思考者。任务：回复这条推文。策略：1. 找出原推文逻辑最薄弱的一点进行精准打击；2. 抛出一个极其反直觉的犀利观点；3. 多用反问句引发争议和辩论。要求：一针见血，带点嘲讽感但不做人身攻击，字数控制在40字以内。';
        } else if (currentReplyStrategy.includes('专业')) {
          strategyPrompt = '你是一个在行业内深耕多年、极具洞察力的行业老兵。任务：回复这条推文。策略：1. 先高度赞同原推的核心观点；2. 【关键】必须要补充一条极其硬核的冷知识、底层逻辑或具体数据来作为支撑，让作者觉得遇到了知音。要求：专业且真诚，展现极高的信息密度，字数控制在80字以内。';
        } else if (currentReplyStrategy.includes('极简')) {
          strategyPrompt = '你是一个极度厌恶长篇大论、浑身都是梗的网络乐子人。任务：回复这条推文。策略：1. 用一句极其精辟的吐槽、神级比喻或者互联网黑话来总结原推文；2. 绝不要分析，只要情绪价值和幽默感。要求：短平快，字数绝对不能超过15个字。';
        } else {
          strategyPrompt = '你是一位混迹推特多年的资深真实网友。任务：请使用“' + currentReplyStrategy + '”的策略，为这条推文写一条高质量的破冰回复。要求：口语化，不要有AI味。';
        }

        switch(req.promptType) {
          case 'draft_reply':
            promptPrefix = strategyPrompt + '\\n\\n绝对不要在输出中包含策略名本身，直接输出回复的正文内容。\\n\\n原推文：\\n';
            break;
`;

const targetStr = `        switch(req.promptType) {
          case 'draft_reply':
            promptPrefix = '你是一位混迹推特多年的资深真实网友。任务：请使用“' + currentReplyStrategy + '”的策略，为下面这条推文写一条高质量的破冰回复。要求：口语化、不要有AI翻译腔，字数在100字以内。绝对不要在输出中包含策略名本身（例如不要输出“【专业补充】极度赞同...”等字样），直接输出回复的正文内容。\\n\\n原推文：\\n';
            break;`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacement.trim());
  fs.writeFileSync('background.js', code);
  console.log('Successfully patched background.js prompt');
} else {
  console.log('Target string not found!');
}
