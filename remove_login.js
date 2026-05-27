const fs = require('fs');

let html = fs.readFileSync('options/options.html', 'utf8');
// Remove the login overlay
html = html.replace(/<div id="view-login" class="login-overlay active">[\s\S]*?<\/div>\n\n  <!-- Main App/g, "<!-- Main App");
// If that regex failed, let's just do it manually with a simpler replace
if (html.includes('id="view-login"')) {
  html = html.replace(/<div id="view-login"[\s\S]*?<\/div>\s*<\/div>\s*/, '');
}
fs.writeFileSync('options/options.html', html);

let js = fs.readFileSync('options/options.js', 'utf8');
// Remove login logic
js = js.replace(/\/\/ ==========================================\n\/\/ LOGIN LOGIC\n\/\/ ==========================================\n[\s\S]*?\}\);\n/g, "");
fs.writeFileSync('options/options.js', js);
