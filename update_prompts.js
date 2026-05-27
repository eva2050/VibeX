const fs = require('fs');

// 1. Update options.html to rename persona-target to reply-strategy
let html = fs.readFileSync('options/options.html', 'utf8');
html = html.replace(
  '<label><i data-lucide="target" width="16" height="16" style="color: var(--text-sub);"></i> 账号定位</label>',
  '<label><i data-lucide="message-square-dashed" width="16" height="16" style="color: var(--text-sub);"></i> 默认回复策略</label>'
);
html = html.replace(/persona-target/g, 'reply-strategy');
html = html.replace(
  /<div class="custom-select-dropdown">[\s\S]*?<\/div>/m,
  `<div class="custom-select-dropdown">
              <div class="custom-select-option" data-value="【高赞锐评】一针见血，带有反直觉的犀利观点">【高赞锐评】一针见血，带有反直觉的犀利观点</div>
              <div class="custom-select-option selected" data-value="【专业补充】极度赞同，并补充一条专业冷知识或数据">【专业补充】极度赞同，并补充一条专业冷知识或数据</div>
              <div class="custom-select-option" data-value="【情绪共鸣】极简口语，用极短的感叹表达强烈情绪共鸣">【情绪共鸣】极简口语，用极短的感叹表达强烈情绪共鸣</div>
              <div class="custom-select-option" data-value="【借势引流】巧妙切入话题，顺滑植入个人观点或经历">【借势引流】巧妙切入话题，顺滑植入个人观点或经历</div>
            </div>`
);
html = html.replace(
  /value="【干货与布道】垂直领域专家 \/ 知识博主"/,
  'value="【专业补充】极度赞同，并补充一条专业冷知识或数据"'
);
html = html.replace(
  /<span>【干货与布道】垂直领域专家 \/ 知识博主<\/span>/,
  '<span>【专业补充】极度赞同，并补充一条专业冷知识或数据</span>'
);
fs.writeFileSync('options/options.html', html);

// 2. Update options.js to load/save replyStrategy
let js = fs.readFileSync('options/options.js', 'utf8');
js = js.replace(/personaTarget/g, 'replyStrategy');
js = js.replace(
  /'【干货与布道】垂直领域专家 \/ 知识博主'/,
  "'【专业补充】极度赞同，并补充一条专业冷知识或数据'"
);
fs.writeFileSync('options/options.js', js);
