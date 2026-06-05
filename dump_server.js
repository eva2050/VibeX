const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      fs.writeFileSync('/Users/eva/Documents/antigravity/插件/storage_dump.json', body);
      res.end('ok');
      console.log('Dump received');
      server.close();
      process.exit(0);
    });
  }
});
server.listen(12345, () => console.log('Listening on 12345'));
