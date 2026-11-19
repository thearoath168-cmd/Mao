// MedRef Agent — zero-dependency Node.js server (Node 20+).
//   node server.js          → http://localhost:3000
// Set ANTHROPIC_API_KEY for live research; without it the app runs in demo mode.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (KEY=value lines), so no dotenv dependency is needed.
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { runResearch, agentConfig } = await import('./lib/agent.js');
const { demoResult } = await import('./lib/demo.js');

const PORT = Number(process.env.PORT || 3000);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_HOURS || 24) * 3600_000;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 3);
const LANGS = new Set(['en', 'fr', 'km', 'vi', 'es']);
const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

const cache = new Map();   // key → { at, payload }
const inflight = new Map(); // key → Promise (dedupes identical concurrent searches)
let running = 0;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/config') return json(res, { demo: !agentConfig().apiKey, model: agentConfig().model });
    if (url.pathname === '/api/research') return research(req, res, url);
    return serveStatic(res, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, { error: 'Server error' }, 500);
  }
});

async function research(req, res, url) {
  const mode = url.searchParams.get('mode') === 'pathology' ? 'pathology' : 'medicine';
  const query = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
  const lang = LANGS.has(url.searchParams.get('lang')) ? url.searchParams.get('lang') : 'en';
  const fresh = url.searchParams.get('fresh') === '1';
  if (query.length < 2 || query.length > 120) return json(res, { error: 'Enter 2–120 characters.' }, 400);

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  const ctl = new AbortController();
  res.on('close', () => { clearInterval(heartbeat); });

  try {
    const cfg = agentConfig();
    if (!cfg.apiKey) {
      send('status', { step: 'demo', text: 'Demo mode — no ANTHROPIC_API_KEY set. Showing sample data.' });
      await new Promise((r) => setTimeout(r, 600));
      send('result', demoResult(mode, query, lang));
      return;
    }

    const key = `${mode}|${lang}|${query.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && !fresh && Date.now() - hit.at < CACHE_TTL_MS) {
      send('status', { step: 'cache', text: `From cache (researched ${new Date(hit.at).toLocaleString()})` });
      send('result', { ...hit.payload, meta: { ...hit.payload.meta, cached: true } });
      return;
    }

    const listener = (e, d) => send(e, d);
    let job = inflight.get(key);
    if (job) {
      job.listeners.add(listener);
    } else {
      if (running >= MAX_CONCURRENT) throw new Error('Server busy — please retry in a minute.');
      running++;
      const listeners = new Set([listener]);
      job = runResearch({
        mode, query, lang, signal: ctl.signal,
        onEvent: (e, d) => listeners.forEach((fn) => fn(e, d)),
      }, cfg).finally(() => { running--; inflight.delete(key); });
      job.listeners = listeners;
      inflight.set(key, job);
    }
    const payload = await job.finally(() => job.listeners.delete(listener));
    cache.set(key, { at: Date.now(), payload });
    send('result', payload);
  } catch (err) {
    console.error('[research]', err.message);
    send('fail', { message: err.message || 'Research failed' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return json(res, { error: 'Not found' }, 404);
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error();
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    // SPA fallback
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(await readFile(path.join(PUBLIC, 'index.html')));
  }
}

function json(res, body, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  const cfg = agentConfig();
  console.log(`MedRef Agent on http://localhost:${PORT}  (${cfg.apiKey ? `live, model ${cfg.model}` : 'DEMO mode — set ANTHROPIC_API_KEY'})`);
});
