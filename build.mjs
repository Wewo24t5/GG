#!/usr/bin/env node
/* Builds self-contained single files (no network requests, fonts and three.js inlined):
   dist/origins.html — token page for `animation_url`: origins.js (unchanged) + 3D engine.
                       Use as  ipfs://<CID>/origins.html?n=<token>  (also ?token=, ?id=, #<token>).
   dist/arcade.html  — Nullorigo Arcade, the city-builder game at (−7, −7). */
import fs from 'node:fs';
import { build } from 'esbuild';

const url = (f) => new URL(f, import.meta.url);
const read = (f) => fs.readFileSync(url(f));
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
const font = (f) => 'data:font/woff2;base64,' + read('fonts/' + f).toString('base64');
const css = read('fonts/jost.css').toString().replace('url(jost-latin.woff2)', `url(${font('jost-latin.woff2')})`).replace('url(jost-latin-ext.woff2)', `url(${font('jost-latin-ext.woff2')})`);

async function page(template, entry, outName, extra = {}, target = 'es2022') {
  const out = await build({ entryPoints: [url(entry).pathname], bundle: true, minify: true, format: 'esm', target, write: false, legalComments: 'none' });
  let html = read(template).toString();
  const swap = (tag, s) => { const re = new RegExp(`<!--${tag}-->[\\s\\S]*?<!--/${tag}-->`); if (!re.test(html)) throw new Error(`${template}: marker ${tag}`); html = html.replace(re, () => s); };
  swap('FONTS', `<style>${css}</style>`);
  for (const [tag, s] of Object.entries(extra)) swap(tag, s);
  swap('APP', `<script type="module">${esc(out.outputFiles[0].text)}</script>`);
  fs.mkdirSync(url('dist/'), { recursive: true });
  fs.writeFileSync(url('dist/' + outName), html);
  console.log(`dist/${outName}  ${(html.length / 1024).toFixed(0)} KB`);
}

await page('token.html', 'src/token.js', 'origins.html', { ORIGINS: `<script>${esc(read('origins.js').toString())}</script>` });
await page('arcade/index.html', 'arcade/game.js', 'arcade.html', {}, ['es2020', 'safari14', 'chrome90', 'firefox90']);   // older phones too
