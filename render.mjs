#!/usr/bin/env node
/* Origins 3D — headless renderer.
   node render.mjs --serve                      local server for viewer.html (http://localhost:8173/viewer.html)
   node render.mjs --contact                    18 reference tokens: PNGs + contact sheet next to the 2D originals
   node render.mjs 1 2 3 | --from 1 --to 3333   per token: 2D PNG (image), 3D PNG, metadata; resumable, parallel (--workers 4)
   node render.mjs --video 1 [--fps 30]         seamless 6 s orbit loop (±20°), 1080², MP4 (H.264) + WebM
   node render.mjs --transition 1               2D → 3D transition film (1 s 2D, 2.8 s rise, 5 s drift), MP4
   Options: --size 2048  --ss 2 (supersampling)  --out out  --gpu (use the real GPU instead of SwiftShader)
            --force (re-render existing files)  --base ipfs://CID/ (PNGs)  --anim-base ipfs://CID/ (folder with origins.html) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SIZE = +opt('size', 2048), SS = +opt('ss', 2), OUT = path.resolve(opt('out', 'out')), WORKERS = +opt('workers', 1);
const REFERENCES = [6, 16, 7, 22, 23, 11, 21, 1, 14, 55, 8, 2, 74, 30, 76, 187, 3, 5];
const MIN_MEAN = 3;   // mean brightness (0–255) below which a render counts as blank

/* ---------- static server ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function serve(port = 0) {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const base = u.startsWith('/__out/') ? OUT : ROOT, p = path.join(base, base === OUT ? u.slice(6) : u);   // /__out/ -> render output dir
      if (!p.startsWith(base) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/render.html`);
  await page.waitForFunction(() => window.R && window.R.ready, null, { timeout: 120000 });
  return page;
}
const savePNG = (url, file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); };
const pad = (n) => String(n).padStart(4, '0');

async function launch() {
  const args = flag('gpu') ? ['--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  return chromium.launch({ args });
}

/* ---------- token batch: resumable, checked, parallel ---------- */
async function batch(tokens) {
  const srv = await serve(); const port = srv.address().port; const browser = await launch();
  const done3 = (n) => fs.existsSync(path.join(OUT, 'png', pad(n) + '.png')) && fs.existsSync(path.join(OUT, 'png3d', pad(n) + '.png'));
  const todo = tokens.filter((n) => flag('force') || !done3(n));
  console.log(`${tokens.length} tokens, ${tokens.length - todo.length} already done, ${todo.length} to render, ${WORKERS} worker(s)`);
  const failLog = path.join(OUT, 'failures.log'); let done = 0; const t0 = Date.now();
  const worker = async () => {
    const page = await openPage(browser, port);
    while (todo.length) {
      const n = todo.shift();
      try {
        const r = await page.evaluate(([n, size, ss]) => window.R.render3D(n, { size, ss }), [n, SIZE, SS]);
        if (!(r.mean >= MIN_MEAN)) throw new Error(`blank render (mean brightness ${r.mean.toFixed(2)})`);
        const r2 = await page.evaluate(([n, size]) => window.R.render2D(n, { size }), [n, SIZE]);
        savePNG(r2.url, path.join(OUT, 'png', pad(n) + '.png'));      // `image`: the 2D card
        savePNG(r.url, path.join(OUT, 'png3d', pad(n) + '.png'));     // 3D still for the site / announcements
        writeMeta(n, await page.evaluate((n) => window.R.metadata(n), n));
        done++; const el = (Date.now() - t0) / 1000;
        console.log(`#${pad(n)}  ok  mean ${r.mean.toFixed(1)}  [${done}/${tokens.length}  ${(el / done).toFixed(1)} s/token]`);
      } catch (e) { fs.mkdirSync(OUT, { recursive: true }); fs.appendFileSync(failLog, `${new Date().toISOString()}  #${pad(n)}  ${e.message}\n`); console.error(`#${pad(n)}  FAILED  ${e.message}`); }
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: Math.max(1, WORKERS) }, worker));
  await browser.close(); srv.close();
}
function writeMeta(n, m) {
  const base = opt('base', 'ipfs://CID/'), anim = opt('anim-base', 'ipfs://CID/');
  // image = the 2D card; animation_url = the token page (2D card that lifts into 3D on click), one shared file for all tokens
  m.image = base + pad(n) + '.png'; m.animation_url = anim + 'origins.html?n=' + n;
  const f = path.join(OUT, 'metadata', pad(n) + '.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(m, null, 2));
}

/* ---------- contact sheet: 2D original above its 3D edition, same order as origins-2d-references.jpg ---------- */
async function contact() {
  const srv = await serve(); const port = srv.address().port; const browser = await launch(); const page = await openPage(browser, port);
  const cells = [];
  for (const n of REFERENCES) {
    const t = Date.now();
    const r3 = await page.evaluate(([n, size, ss]) => window.R.render3D(n, { size, ss }), [n, SIZE, SS]);
    savePNG(r3.url, path.join(OUT, 'png3d', pad(n) + '.png'));
    const r2 = await page.evaluate(([n]) => window.R.render2D(n, { size: 1024 }), [n]);
    savePNG(r2.url, path.join(OUT, '2d', pad(n) + '.png'));
    const rt = await page.evaluate(([n, ss]) => window.R.render3D(n, { size: 1024, ss, top: true }), [n, SS]);   // top-down check
    savePNG(rt.url, path.join(OUT, 'top', pad(n) + '.png'));
    console.log(`#${pad(n)}  mean ${r3.mean.toFixed(1)}  ${((Date.now() - t) / 1000).toFixed(1)} s`);
    cells.push(n);
  }
  // compose in the page: 6 columns; per token: 2D original, 3D edition, 3D seen from above
  const cell = 600, cols = 6, rows = Math.ceil(cells.length / cols) * 3;
  const url = await page.evaluate(async ([cells, cell, cols, rows]) => {
    const load = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
    const gap = 16, lab = 30, W = cols * cell + (cols + 1) * gap, H = rows * (cell + lab) + (rows + 1) * gap;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#050506'; x.fillRect(0, 0, W, H);
    x.font = '300 18px Jost'; x.fillStyle = '#8b8a86'; x.textBaseline = 'middle';
    for (let i = 0; i < cells.length; i++) {
      const n = cells[i], col = i % cols, row = Math.floor(i / cols) * 3, p4 = String(n).padStart(4, '0');
      for (const [k, dir, name] of [[0, '2d', '2D'], [1, 'png3d', '3D'], [2, 'top', '3D · top view']]) {
        const im = await load(`/__out/${dir}/${p4}.png`), X = gap + col * (cell + gap), Y = gap + (row + k) * (cell + lab + gap);
        x.fillText(`#${p4}  ${name}`, X + 2, Y + lab / 2); x.drawImage(im, X, Y + lab, cell, cell);
      }
    }
    return c.toDataURL('image/jpeg', .92);
  }, [cells, cell, cols, rows]);
  savePNG(url, path.join(OUT, 'contact-sheet.jpg'));
  console.log('contact sheet ->', path.join(OUT, 'contact-sheet.jpg'));
  await browser.close(); srv.close();
}

/* ---------- seamless orbit loop ---------- */
async function video(n) {
  const fps = +opt('fps', 30), secs = 6, size = +opt('vsize', 1080), frames = fps * secs;
  const srv = await serve(); const port = srv.address().port; const browser = await launch(); const page = await openPage(browser, port);
  const dir = path.join(OUT, 'frames', pad(n)); fs.mkdirSync(dir, { recursive: true });
  for (let f = 0; f < frames; f++) {
    const file = path.join(dir, `f${String(f).padStart(4, '0')}.png`); if (fs.existsSync(file) && !flag('force')) continue;
    const az = 38 + 20 * Math.sin(f / frames * 2 * Math.PI);   // ±20°, returns exactly to the start
    const r = await page.evaluate(([n, size, ss, az]) => window.R.render3D(n, { size, ss, azimuth: az }), [n, size, SS, az]);
    savePNG(r.url, file); if (f % 10 === 0) console.log(`frame ${f}/${frames}`);
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(OUT, 'video'), { recursive: true });
  const inp = ['-y', '-framerate', String(fps), '-i', path.join(dir, 'f%04d.png')];
  spawnSync('ffmpeg', [...inp, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'video', pad(n) + '.mp4')], { stdio: 'inherit' });
  spawnSync('ffmpeg', [...inp, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-row-mt', '1', path.join(OUT, 'video', pad(n) + '.webm')], { stdio: 'inherit' });
}

/* ---------- 2D → 3D transition film (announcement / fallback for clients without HTML): hold 2D, rise, calm drift ---------- */
async function transitionFilm(n) {
  const fps = +opt('fps', 30), size = +opt('vsize', 1080), hold = fps * 1, rise = Math.round(fps * 2.8), drift = fps * 5;
  const srv = await serve(); const port = srv.address().port; const browser = await launch(); const page = await openPage(browser, port);
  const dir = path.join(OUT, 'frames', 'transition-' + pad(n)); fs.mkdirSync(dir, { recursive: true });
  const total = hold + rise + drift;
  for (let f = 0; f < total; f++) {
    const file = path.join(dir, `f${String(f).padStart(4, '0')}.png`); if (fs.existsSync(file) && !flag('force')) continue;
    const lift = f < hold ? 0 : Math.min(1, (f - hold) / rise);
    const az = 38 + 9 * Math.sin(Math.max(0, f - hold) / fps / 16 * 2 * Math.PI) * Math.min(1, Math.max(0, (lift - .6) / .4));   // same drift as the token page
    const r = await page.evaluate(([n, size, ss, lift, az]) => window.R.transition(n, { size, ss, lift, azimuth: az }), [n, size, SS, lift, az]);
    savePNG(r.url, file); if (f % 15 === 0) console.log(`frame ${f}/${total}`);
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(OUT, 'video'), { recursive: true });
  spawnSync('ffmpeg', ['-y', '-framerate', String(fps), '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'video', `transition-${pad(n)}.mp4`)], { stdio: 'inherit' });
}

/* ---------- main ---------- */
if (flag('serve')) { const port = +opt('port', 8173); await serve(port); console.log(`viewer: http://localhost:${port}/viewer.html`); }
else if (flag('contact')) await contact();
else if (flag('video')) await video(+opt('video', 1));
else if (flag('transition')) await transitionFilm(+opt('transition', 1));
else {
  let tokens = argv.filter((a, i) => /^\d+$/.test(a) && !/^--/.test(argv[i - 1] || '')).map(Number);
  if (opt('from')) { tokens = []; for (let n = +opt('from'); n <= +opt('to', 3333); n++) tokens.push(n); }
  if (!tokens.length) { console.log('usage: node render.mjs --contact | --from 1 --to 3333 [--workers 4] | 1 2 3 | --video 1 | --serve'); process.exit(1); }
  await batch(tokens);
}
