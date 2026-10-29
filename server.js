// 4-quadrant RTSP viewer: serves the UI, stores camera URIs and supervises go2rtc.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 8080;
const GO2RTC_API = 1984;
const GO2RTC_WEBRTC = 8555;
const SLOTS = 4;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const GO2RTC_YAML = path.join(ROOT, 'go2rtc.yaml');
const GO2RTC_EXE = path.join(ROOT, 'bin', process.platform === 'win32' ? 'go2rtc.exe' : 'go2rtc');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- config ----------

function loadConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const cams = Array.isArray(data.cams) ? data.cams : [];
    return { cams: Array.from({ length: SLOTS }, (_, i) => (typeof cams[i] === 'string' ? cams[i] : '')) };
  } catch {
    return { cams: Array(SLOTS).fill('') };
  }
}

function validateCams(cams) {
  if (!Array.isArray(cams) || cams.length !== SLOTS) return `Expected ${SLOTS} camera entries`;
  for (let i = 0; i < SLOTS; i++) {
    const uri = cams[i];
    if (typeof uri !== 'string') return `Camera ${i + 1}: must be a string`;
    if (uri === '') continue;
    if (/[\r\n]/.test(uri)) return `Camera ${i + 1}: must be a single line`;
    if (!/^rtsps?:\/\/\S+$/i.test(uri)) return `Camera ${i + 1}: must start with rtsp:// or rtsps:// and contain no spaces`;
  }
  return null;
}

// ---------- go2rtc ----------

function writeGo2rtcYaml(cams) {
  // JSON strings are valid YAML double-quoted scalars, so URIs with special chars stay intact.
  const streams = cams
    .map((uri, i) => (uri ? `  cam${i + 1}: ${JSON.stringify(uri)}` : null))
    .filter(Boolean);
  const yaml = [
    'api:',
    `  listen: ":${GO2RTC_API}"`,
    '  origin: "*"',
    'rtsp:',
    '  listen: ""',
    'webrtc:',
    `  listen: ":${GO2RTC_WEBRTC}"`,
    'log:',
    '  level: info',
    streams.length ? 'streams:' : 'streams: {}',
    ...streams,
    '',
  ].join('\n');
  fs.writeFileSync(GO2RTC_YAML, yaml);
}

let child = null;
let stopping = false;
let restartTimer = null;
let backoff = 1000;

function startGo2rtc() {
  if (!fs.existsSync(GO2RTC_EXE)) {
    console.error(`[go2rtc] ${GO2RTC_EXE} not found. Run setup.ps1 (powershell -ExecutionPolicy Bypass -File setup.ps1) first.`);
    return;
  }
  writeGo2rtcYaml(loadConfig().cams);
  const startedAt = Date.now();
  child = spawn(GO2RTC_EXE, ['-c', GO2RTC_YAML], { cwd: ROOT, windowsHide: true });
  console.log(`[go2rtc] started (pid ${child.pid})`);
  const pipe = (stream) => stream.on('data', (d) => process.stdout.write(`[go2rtc] ${d}`));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) return;
    console.warn(`[go2rtc] exited (code ${code}, signal ${signal}); restarting in ${backoff} ms`);
    // Reset backoff if it ran for a while; otherwise grow it up to 30 s.
    backoff = Date.now() - startedAt > 60000 ? 1000 : Math.min(backoff * 2, 30000);
    restartTimer = setTimeout(startGo2rtc, backoff);
  });
}

function restartGo2rtc() {
  clearTimeout(restartTimer);
  backoff = 1000;
  if (!child) return startGo2rtc();
  stopping = true;
  child.once('exit', () => {
    stopping = false;
    startGo2rtc();
  });
  child.kill();
}

function shutdown() {
  stopping = true;
  clearTimeout(restartTimer);
  if (child) child.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => child && child.kill());

// ---------- http ----------

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// Proxy go2rtc's player scripts so the page loads them same-origin.
function proxyGo2rtc(res, file) {
  const upstream = http.get({ host: '127.0.0.1', port: GO2RTC_API, path: `/${file}` }, (up) => {
    res.writeHead(up.statusCode, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
    up.pipe(res);
  });
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('go2rtc is not running');
  });
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/config') {
    if (req.method === 'GET') return sendJson(res, 200, loadConfig());
    if (req.method === 'POST') {
      let cams;
      try {
        cams = JSON.parse(await readBody(req)).cams;
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON' });
      }
      cams = Array.isArray(cams) ? cams.map((c) => (typeof c === 'string' ? c.trim() : c)) : cams;
      const error = validateCams(cams);
      if (error) return sendJson(res, 400, { error });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ cams }, null, 2));
      restartGo2rtc();
      return sendJson(res, 200, { cams });
    }
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (pathname === '/vendor/video-stream.js' || pathname === '/vendor/video-rtc.js') {
    return proxyGo2rtc(res, path.basename(pathname));
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    return res.end();
  }
  if (pathname === '/') return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
  if (pathname === '/config') return serveFile(res, path.join(PUBLIC_DIR, 'config.html'));

  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  serveFile(res, file);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Viewer:  http://localhost:${PORT}/`);
  console.log(`Config:  http://localhost:${PORT}/config`);
  startGo2rtc();
});
