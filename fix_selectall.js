const fs = require('fs');
let js = fs.readFileSync('content/x_scraper.js', 'utf8');

const targetRegen = `                if (ed) {
                  ed.focus();
                  insertIntoDraftJs(ed, res.result);`;

const replaceRegen = `                if (ed) {
                  ed.focus();
                  document.execCommand('selectAll', false, null);
                  insertIntoDraftJs(ed, res.result);`;

if (js.includes(targetRegen)) {
  js = js.replace(targetRegen, replaceRegen);
  fs.writeFileSync('content/x_scraper.js', js);
  console.log("Successfully fixed selectAll in regenerate");
} else {
  console.log("Could not find targetRegen");
}
