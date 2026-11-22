/* Serveur local de test : mêmes fonctions que Vercel, stockage = dossier (aucun accès au vrai Blob) */
const http = require('http'), fs = require('fs'), path = require('path');
const handler = require('../api/index.js');
const root = path.join(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.json': 'application/json', '.png': 'image/png' };
http.createServer((req, res) => {
  let p = new URL(req.url, 'http://x').pathname;
  if (p.startsWith('/api/') || p === '/robots.txt' || p === '/sitemap.xml') {
    if (p === '/robots.txt') req.url = '/api/seo/robots'; if (p === '/sitemap.xml') req.url = '/api/seo/sitemap';
    return handler(req, res);
  }
  if (p === '/gestionnaire' || p === '/gestionnaire/') p = '/gestionnaire/index.html'; if (p === '/') p = '/index.html';
  const f = path.join(root, p.replace(/\.\./g, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', mime[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
}).listen(process.env.PORT || 8110, '127.0.0.1');
