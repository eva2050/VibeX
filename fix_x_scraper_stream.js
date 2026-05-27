const fs = require('fs');
let js = fs.readFileSync('content/x_scraper.js', 'utf8');

const streamCode = `
let streamBubble = null;
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'magicPromptStreamChunk') {
     if (!streamBubble) {
        streamBubble = document.createElement('div');
        streamBubble.style.cssText = 'position:fixed;bottom:120px;right:24px;width:320px;background:var(--primary, #0F0F0F);color:#fff;padding:16px;border-radius:16px;z-index:999999;box-shadow:0 12px 40px rgba(0,0,0,0.4);font-size:14px;line-height:1.6;max-height:400px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);white-space:pre-wrap;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        
        const header = document.createElement('div');
        header.innerHTML = '<span style="color:#00BA7C;margin-right:8px;">✨</span>AI 正在思考...';
        header.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px;font-weight:600;display:flex;align-items:center;';
        streamBubble.appendChild(header);
        
        const content = document.createElement('div');
        content.id = 'stream-bubble-content';
        streamBubble.appendChild(content);
        
        document.body.appendChild(streamBubble);
     }
     const contentEl = streamBubble.querySelector('#stream-bubble-content');
     if (contentEl) {
       contentEl.innerHTML += request.chunk.replace(/\\n/g, '<br>');
       streamBubble.scrollTop = streamBubble.scrollHeight;
     }
  } else if (request.action === 'magicPromptStreamEnd') {
     if (streamBubble) {
        streamBubble.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        streamBubble.style.opacity = '0';
        streamBubble.style.transform = 'translateY(10px)';
        const toRemove = streamBubble;
        setTimeout(() => toRemove.remove(), 400);
        streamBubble = null;
     }
  }
});
`;

if (!js.includes('magicPromptStreamChunk')) {
  js += '\n' + streamCode;
  fs.writeFileSync('content/x_scraper.js', js);
  console.log("Successfully added stream UI to x_scraper.js");
} else {
  console.log("Stream UI already exists");
}
