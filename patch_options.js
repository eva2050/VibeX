const fs = require('fs');

// 1. Remove API Key input and Account Positioning from options.html
let html = fs.readFileSync('options/options.html', 'utf8');

const oldApiKeyUI = `
          <label><i data-lucide="key" width="16" height="16" style="color: var(--text-sub);"></i> 模型 API Key (必填)</label>
          <input type="password" id="api-key-input" placeholder="sk-..." class="modern-input">
`;
html = html.replace(oldApiKeyUI, '');

const oldPersonaTarget = `
          <label><i data-lucide="target" width="16" height="16" style="color: var(--text-sub);"></i> 账号定位</label>
          <div class="custom-select-container" id="persona-target-container" style="margin-bottom: 16px;">
            <input type="hidden" id="persona-target" value="【干货与布道】垂直领域专家 / 知识博主">
            <div class="custom-select-trigger" id="persona-target-trigger">
              <span>【干货与布道】垂直领域专家 / 知识博主</span>
              <i data-lucide="chevron-down" width="16" height="16" style="color: var(--text-sub);"></i>
            </div>
            <div class="custom-select-dropdown">
              <div class="custom-select-option" data-value="【Build in Public】独立开发者 / 技术极客">【Build in Public】独立开发者 / 技术极客</div>
              <div class="custom-select-option" data-value="【商业与搞钱】连续创业者 / 操盘手">【商业与搞钱】连续创业者 / 操盘手</div>
              <div class="custom-select-option selected" data-value="【干货与布道】垂直领域专家 / 知识博主">【干货与布道】垂直领域专家 / 知识博主</div>
              <div class="custom-select-option" data-value="【思考与沉淀】行业老兵 / 职场高管">【思考与沉淀】行业老兵 / 职场高管</div>
              <div class="custom-select-option" data-value="【生活与情绪】泛娱乐玩家 / 随笔记录者">【生活与情绪】泛娱乐玩家 / 随笔记录者</div>
            </div>
          </div>
`;

const newReplyStrategyUI = `
          <label><i data-lucide="message-square" width="16" height="16" style="color: var(--text-sub);"></i> 默认回复策略</label>
          <div class="custom-select-container" id="reply-strategy-container" style="margin-bottom: 16px;">
            <input type="hidden" id="reply-strategy" value="【赞同补充】高度赞同，并补充相关的个人经验或冷知识">
            <div class="custom-select-trigger" id="reply-strategy-trigger">
              <span>【赞同补充】高度赞同，并补充相关的个人经验或冷知识</span>
              <i data-lucide="chevron-down" width="16" height="16" style="color: var(--text-sub);"></i>
            </div>
            <div class="custom-select-dropdown">
              <div class="custom-select-option selected" data-value="【赞同补充】高度赞同，并补充相关的个人经验或冷知识">【赞同补充】高度赞同，并补充冷知识</div>
              <div class="custom-select-option" data-value="【抬杠反问】挑刺原推的一个漏洞，用反问句引发讨论">【抬杠反问】挑刺原推漏洞，反问引发讨论</div>
              <div class="custom-select-option" data-value="【极简神评】一句精辟的吐槽或总结，不超15字">【极简神评】精辟吐槽总结，不超15字</div>
              <div class="custom-select-option" data-value="【抛出问题】针对原推提出一个开放式问题，引导博主回复">【抛出问题】提开放式问题，引导互动</div>
            </div>
          </div>
`;
html = html.replace(oldPersonaTarget, newReplyStrategyUI);
fs.writeFileSync('options/options.html', html);

// 2. Update options.js to handle replyStrategy instead of personaTarget
let js = fs.readFileSync('options/options.js', 'utf8');

js = js.replace(/document\.getElementById\('api-key-input'\)\.value = items\.apiKey \|\| '';/, '');
js = js.replace(/const apiKey = document\.getElementById\('api-key-input'\)\.value;/, 'const apiKey = "";');

js = js.replace(/const personaTarget = document\.getElementById\('persona-target'\);/g, "const replyStrategy = document.getElementById('reply-strategy');");
js = js.replace(/personaTarget\.value/g, "replyStrategy.value");
js = js.replace(/items\.personaTarget \|\| '【干货与布道】垂直领域专家 \/ 知识博主'/g, "items.replyStrategy || '【赞同补充】高度赞同，并补充相关的个人经验或冷知识'");
js = js.replace(/persona-target/g, "reply-strategy");
js = js.replace(/personaTarget: personaTarget \? personaTarget\.value : ''/g, "replyStrategy: replyStrategy ? replyStrategy.value : ''");

fs.writeFileSync('options/options.js', js);
