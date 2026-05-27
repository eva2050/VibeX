const fs = require('fs');
let code = fs.readFileSync('content/x_scraper.js', 'utf8');

// Replace the editor selector and focus logic
code = code.replace(
  /const editor = document\.querySelector\('div\[data-testid="tweetTextarea_0"\]'\);/g,
  `let editor = null;
          const dialog = document.querySelector('[role="dialog"]');
          if (dialog) {
            editor = dialog.querySelector('[contenteditable="true"]');
          } else {
            editor = document.querySelector('[data-testid="tweetTextarea_0"] [contenteditable="true"]');
            if (!editor) {
              const editors = document.querySelectorAll('[contenteditable="true"]');
              if (editors.length > 0) editor = editors[editors.length - 1];
            }
          }`
);

// We need to also patch it inside the `chrome.runtime.sendMessage` callback where it was doing exactly the same query
code = code.replace(
  /const ed = document\.querySelector\('div\[data-testid="tweetTextarea_0"\]'\);/g,
  `let ed = null;
                const dlg = document.querySelector('[role="dialog"]');
                if (dlg) {
                  ed = dlg.querySelector('[contenteditable="true"]');
                } else {
                  ed = document.querySelector('[data-testid="tweetTextarea_0"] [contenteditable="true"]');
                  if (!ed) {
                    const eds = document.querySelectorAll('[contenteditable="true"]');
                    if (eds.length > 0) ed = eds[eds.length - 1];
                  }
                }`
);

fs.writeFileSync('content/x_scraper.js', code);
