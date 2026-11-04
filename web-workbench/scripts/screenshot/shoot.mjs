#!/usr/bin/env node
/**
 * Headless screenshot runner for the built workbench.
 *
 * It serves `web-workbench/dist` on an ephemeral local port, launches Chrome
 * (or Edge) in headless mode, connects over CDP, waits for webfonts, optionally
 * applies the demo host mock, and writes a PNG.
 *
 *   node web-workbench/scripts/screenshot/shoot.mjs --mock --theme dark --out shot.png
 *
 * Flags:
 *   --out <path>      output PNG (default: screenshot.png)
 *   --width <px>      viewport width (default: 1280)
 *   --height <px>     viewport height (default: 900)
 *   --theme <name>    dark | light (default: dark)
 *   --mock            inject scripts/screenshot/mock-host.js (demo records)
 *   --eval <file>     run a JS snippet (async body) before the screenshot
 *   --wait <ms>       extra settle time after fonts load (default: 1200)
 *   --keep-open       leave the local server running for manual inspection
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, '../../..');
const dist = path.join(workspace, 'web-workbench', 'dist');
const mockFile = path.join(here, 'mock-host.js');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')) return argv[index + 1];
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
};

const out = path.resolve(option('out', 'screenshot.png'));
const width = Number(option('width', '1280'));
const height = Number(option('height', '900'));
const theme = option('theme', 'dark');
const useMock = flag('mock');
const evalFile = option('eval', '');
const settle = Number(option('wait', '1200'));
const keepOpen = flag('keep-open');

if (!['dark', 'light'].includes(theme)) {
  console.error('--theme must be "dark" or "light".');
  process.exit(1);
}

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('web-workbench/dist is missing. Run `npm run build` first.');
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const mockTag = useMock ? `<script>${fs.readFileSync(mockFile, 'utf8')}</script>` : '';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.join(dist, requested);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  if (requested === '/index.html') {
    const html = fs.readFileSync(file, 'utf8').replace('</head>', `${mockTag}</head>`);
    res.writeHead(200, { 'content-type': types['.html'] });
    res.end(html);
    return;
  }
  res.writeHead(200, {
    'content-type': types[path.extname(file)] || 'application/octet-stream',
  });
  fs.createReadStream(file).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const pageUrl = `http://127.0.0.1:${port}/?theme=${encodeURIComponent(theme)}`;

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = candidates.find((candidate) => fs.existsSync(candidate));
if (!chromePath) {
  console.error('No Chrome/Edge executable found. Set CHROME_PATH.');
  server.close();
  process.exit(1);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-shot-'));
const browser = spawn(
  chromePath,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-crash-reporter',
    '--no-first-run',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function devtoolsPort() {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 80; attempt++) {
    if (fs.existsSync(file)) {
      const [line] = fs.readFileSync(file, 'utf8').split('\n');
      if (line) return Number(line);
    }
    await sleep(100);
  }
  throw new Error('Chrome did not expose a DevTools port.');
}

let ws;
try {
  const devtools = await devtoolsPort();
  const targets = await (await fetch(`http://127.0.0.1:${devtools}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('No page target found.');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, { resolve, reject });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: pageUrl });

  for (let attempt = 0; attempt < 60; attempt++) {
    const state = await send('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (state.result?.value === 'complete') break;
    await sleep(100);
  }

  await send('Runtime.evaluate', {
    expression: 'document.fonts.ready',
    awaitPromise: true,
  });

  if (!useMock) {
    // The shell derives its theme from host config; force it for the shot.
    await send('Runtime.evaluate', {
      expression: `(() => {
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        const shell = document.querySelector('#workbench');
        if (shell) shell.dataset.theme = ${JSON.stringify(theme)};
      })()`,
    });
  }

  if (evalFile) {
    const snippet = fs.readFileSync(path.resolve(evalFile), 'utf8');
    const evaluated = await send('Runtime.evaluate', {
      expression: `(async () => { ${snippet} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) {
      throw new Error(evaluated.exceptionDetails.text || 'Evaluation failed');
    }
  }

  await sleep(settle);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`Screenshot: ${out} (${width}x${height}, ${theme})`);
} finally {
  ws?.close();
  browser.kill();
  if (!keepOpen) {
    server.close();
    setTimeout(() => {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch {
        /* Chrome may still hold the profile on Windows; it is under %TEMP%. */
      }
    }, 500);
  } else {
    console.log(`Preview server: http://127.0.0.1:${port}/?theme=${theme}`);
  }
}
