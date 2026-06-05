const fs = require('fs');

let bgCode = fs.readFileSync('background.js', 'utf8');

// The goal is to extract the onMessage listener blocks.
// Let's first make a backup
fs.writeFileSync('background.backup.js', bgCode);
console.log("Backup created");
