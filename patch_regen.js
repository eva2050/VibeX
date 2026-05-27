const fs = require('fs');
const code = fs.readFileSync('content/x_scraper.js', 'utf8');

// We need to add "let lastReplyTweetData = null;" near the top or wherever appropriate.
let newCode = code.replace(
  "function handleDirectReply",
  "let lastReplyTweetData = null;\nfunction handleDirectReply"
);

// We need to assign lastReplyTweetData in the replyBtn listener
newCode = newCode.replace(
  "const tweetData = getTweetData();\n      if (!tweetData) return;\n\n      const nativeReply",
  "const tweetData = getTweetData();\n      if (!tweetData) return;\n      window.lastReplyTweetData = tweetData;\n\n      const nativeReply"
);

// We need to use window.lastReplyTweetData in the Regenerate listener
newCode = newCode.replace(
  "chrome.runtime.sendMessage({\n              action: 'magicPrompt',\n              promptType: 'draft_reply'\n            }, (res) => {",
  "chrome.runtime.sendMessage({\n              action: 'magicPrompt',\n              promptType: 'draft_reply',\n              contextData: window.lastReplyTweetData\n            }, (res) => {"
);

fs.writeFileSync('content/x_scraper.js', newCode);
