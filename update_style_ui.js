const fs = require('fs');
let html = fs.readFileSync('options/options.html', 'utf8');

const targetHTML = `<label><i data-lucide="book-open" width="16" height="16" style="color: var(--text-sub);"></i> 风格训练语料</label>
          <div style="font-size: 13px; color: #86868b; margin-bottom: 12px; margin-left: 22px;">提供历史高转化推文以模仿您的写作风格。</div>
          <textarea id="style-training-data" rows="8" placeholder="在此处粘贴纯文本..." class="modern-input" style="resize: vertical;"></textarea>`;

const replacementHTML = `<label><i data-lucide="book-open" width="16" height="16" style="color: var(--text-sub);"></i> 风格训练语料 (建议 3-10 条)</label>
          <div style="font-size: 13px; color: #86868b; margin-bottom: 12px; margin-left: 22px;">输入您过往的高赞推文，AI 将深度模仿您的行文风格与断句习惯。</div>
          <div id="style-training-list" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px;">
            <!-- Dynamic items -->
          </div>
          <button id="btn-add-style" class="magic-btn outline full-width" style="margin-bottom: 24px; border-style: dashed; justify-content: center;">
            <i data-lucide="plus" width="16" height="16" style="margin-right: 6px;"></i> 添加新语料
          </button>`;

if (html.includes(targetHTML)) {
  html = html.replace(targetHTML, replacementHTML);
  fs.writeFileSync('options/options.html', html);
  console.log("options.html updated successfully");
} else {
  // Try alternative matching
  const startIdx = html.indexOf('<label><i data-lucide="book-open"');
  if (startIdx !== -1) {
    const endIdx = html.indexOf('</textarea>', startIdx) + 11;
    html = html.substring(0, startIdx) + replacementHTML + html.substring(endIdx);
    fs.writeFileSync('options/options.html', html);
    console.log("options.html updated successfully via alternative match");
  } else {
    console.log("Could not find style training data HTML");
  }
}
