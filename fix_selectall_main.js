const fs = require('fs');
let js = fs.readFileSync('content/x_scraper.js', 'utf8');

const targetMain = `          if (editor) {
            editor.focus();
            insertIntoDraftJs(editor, res.result);`;

const replaceMain = `          if (editor) {
            editor.focus();
            document.execCommand('selectAll', false, null);
            insertIntoDraftJs(editor, res.result);`;

if (js.includes(targetMain)) {
  js = js.replace(targetMain, replaceMain);
  fs.writeFileSync('content/x_scraper.js', js);
  console.log("Successfully fixed selectAll in main reply");
} else {
  console.log("Could not find targetMain");
}
