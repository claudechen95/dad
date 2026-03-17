#!/usr/bin/env node
// Simple local dev server — no Vercel CLI needed
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./api/records');

// Load .env.local if present
const envFile = path.join(__dirname, '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .forEach(l => {
      const [k, ...v] = l.split('=');
      if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    });
}

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API routes
  if (url.pathname === '/api/records') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', async () => {
      if (body) {
        try { req.body = JSON.parse(body); } catch { req.body = {}; }
      } else {
        req.body = {};
      }
      req.query = Object.fromEntries(url.searchParams);

      // Minimal res wrapper
      let statusCode = 200;
      const headers = {};
      const mockRes = {
        setHeader: (k, v) => { headers[k] = v; },
        status: (code) => { statusCode = code; return mockRes; },
        json: (data) => {
          res.writeHead(statusCode, { 'Content-Type': 'application/json', ...headers });
          res.end(JSON.stringify(data));
        },
        end: () => { res.writeHead(statusCode, headers); res.end(); },
      };
      await handler(req, mockRes);
    });
    return;
  }

  // Static files from public/
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(__dirname, 'public', filePath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end('Not Found');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  每日盈亏记录\n`);
  console.log(`  本地地址:  http://localhost:${PORT}`);
  const _u = process.env.UPSTASH_REDIS_REST_URL || '';
  const _hasRedis = _u.startsWith('https://') && !_u.includes('YOUR_');
  console.log(`\n  数据存储: ${_hasRedis ? 'Upstash Redis ✓' : '内存（重启后清空，适合测试）'}`);
  console.log(`\n  按 Ctrl+C 停止\n`);
});
