// serve.cjs <root> [port=8137]
// Minimal static server so template.html can fetch("./data.json") and load
// fonts/assets over HTTP (file:// blocks the fetch). Serve the template folder,
// then point shoot.mjs / export-pdf.mjs at http://localhost:<port>/template.html
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2] || '.', port = +process.argv[3] || 8137;
const types = { '.html': 'text/html', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/template.html';
  const f = path.join(root, u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); }
    else { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); }
  });
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
