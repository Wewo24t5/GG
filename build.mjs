#!/usr/bin/env node
/* Builds dist/origins.html — one self-contained file for `animation_url` (no network requests):
   origins.js (unchanged) + the 3D engine + three.js (bundled, minified) + Jost (inlined).
   Use as  ipfs://<CID>/origins.html?n=<token>  (also accepts ?token=, ?id=, #<token>). */
import fs from 'node:fs';
import { build } from 'esbuild';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url));
const out = await build({ entryPoints: [new URL('src/token.js', import.meta.url).pathname], bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const font = (f) => 'data:font/woff2;base64,' + read('fonts/' + f).toString('base64');
const css = read('fonts/jost.css').toString().replace('url(jost-latin.woff2)', `url(${font('jost-latin.woff2')})`).replace('url(jost-latin-ext.woff2)', `url(${font('jost-latin-ext.woff2')})`);
const origins = read('origins.js').toString().replace(/<\/script/gi, '<\\/script');
let html = read('token.html').toString();
const swap = (tag, s) => { const re = new RegExp(`<!--${tag}-->[\\s\\S]*?<!--/${tag}-->`); if (!re.test(html)) throw new Error('marker ' + tag); html = html.replace(re, () => s); };
swap('FONTS', `<style>${css}</style>`);
swap('ORIGINS', `<script>${origins}</script>`);
swap('APP', `<script type="module">${js}</script>`);
fs.mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('dist/origins.html', import.meta.url), html);
console.log(`dist/origins.html  ${(html.length / 1024).toFixed(0)} KB`);
