const fs = require('fs');
let html = fs.readFileSync('options/options.html', 'utf8');

// Find the start of Settings section
const settingsStart = html.indexOf('<section id="view-persona" class="view-panel hidden">');
// Find the start of style-training-data label
const styleTrainingStart = html.indexOf('<label><i data-lucide="book-open" width="16" height="16" style="color: var(--text-sub);"></i> 风格训练语料</label>');

const correctSettingsForm = `<div class="glass-form" style="margin-top: 16px;">
          <label><i data-lucide="key" width="16" height="16" style="color: var(--text-sub);"></i> 模型 API Key (必填)</label>
          <input type="password" id="api-key-input" placeholder="sk-..." class="modern-input" style="margin-bottom: 16px;">
          
          <label><i data-lucide="message-square" width="16" height="16" style="color: var(--text-sub);"></i> 默认回复策略</label>
          <div class="custom-select-container" id="reply-strategy-container" style="margin-bottom: 16px;">
            <input type="hidden" id="reply-strategy" value="【专业补充】极度赞同，并补充一条专业冷知识或数据">
            <div class="custom-select-trigger" id="reply-strategy-trigger">
              <span>【专业补充】极度赞同，并补充一条专业冷知识或数据</span>
              <i data-lucide="chevron-down" width="16" height="16" style="color: var(--text-sub);"></i>
            </div>
            <div class="custom-select-dropdown">
              <div class="custom-select-option" data-value="【杠精流量】一针见血，带有反直觉的犀利观点，引发极大争议">【杠精流量】一针见血，反直觉的犀利观点</div>
              <div class="custom-select-option selected" data-value="【专业补充】极度赞同，并补充一条专业冷知识或数据">【专业补充】极度赞同，并补充专业数据</div>
              <div class="custom-select-option" data-value="【极简玩梗】一句精辟的吐槽或玩梗，不超15字">【极简玩梗】一句精辟的吐槽，不超15字</div>
            </div>
          </div>
          
          `;

// Replace the middle part
const prefix = html.substring(0, settingsStart + '<section id="view-persona" class="view-panel hidden">'.length) + '\n        <div class="brain-header">\n          <h2><i data-lucide="settings" width="28" height="28" style="color: var(--text-sub);"></i> 设置</h2>\n          <p>系统配置与模型参数。</p>\n        </div>\n\n        ';
const suffix = html.substring(styleTrainingStart);

fs.writeFileSync('options/options.html', prefix + correctSettingsForm + suffix);
