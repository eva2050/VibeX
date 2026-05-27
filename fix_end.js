const fs = require('fs');
let js = fs.readFileSync('options/options.js', 'utf8');

js = js.replace(/this\.style\.height = \(this\.scrollHeight\) \+ 'px';\n  \}/, "this.style.height = (this.scrollHeight) + 'px';\n  });\n}");
fs.writeFileSync('options/options.js', js);
