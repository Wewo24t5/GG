/* Nullorigo · ORIGINS — 3D edition.
   Token traits come from origins.js (window.ORIGINS, unchanged). This module only lifts the same maths into 3D
   and renders it: floor (grid, axes, faint 2D blueprint, blurred reflection) + sculpture (filaments, square cubes, bloom).
   World axes: X = 2D x, Z = −2D y, Y = height above the coordinate plane. 1 unit = 1 grid step. */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const ORIGINS = window.ORIGINS;
const PI = Math.PI, TAU = 2 * Math.PI;

/* ---------- same PRNG as origins.js (needed for Rings / Sierpinski / Constellation, which reseed from p.seed) ---------- */
function xmur3(str){for(var i=0,h=1779033703^str.length;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19}
  return function(){h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return (h^=h>>>16)>>>0}}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function rng(key){return mulberry(xmur3(key)())}
function rint(r,a,b){return a+Math.floor(r()*(b-a+1))}
function gcd(a,b){return b?gcd(b,a%b):a}
function isPrime(n){if(n<2)return false;for(var d=2;d*d<=n;d++)if(n%d===0)return false;return true}
function d2xy(n,d){var rx,ry,s,t=d,x=0,y=0;for(s=1;s<n;s*=2){rx=1&(t/2);ry=1&(t^rx);if(ry===0){if(rx===1){x=s-1-x;y=s-1-y}var tt=x;x=y;y=tt}x+=s*rx;y+=s*ry;t=Math.floor(t/4)}return[x,y]}
/* 3D Hilbert curve (Skilling's transpose algorithm): index -> [x,y,z], each in 0..2^bits−1 */
function d2xyz(bits, d) {
  const n = 3, X = [0, 0, 0];
  for (let j = 0; j < bits * n; j++) { const bit = (d >> (bits * n - 1 - j)) & 1; X[j % n] |= bit << (bits - 1 - Math.floor(j / n)); }
  const N = 2 << (bits - 1);
  let t = X[n - 1] >> 1;
  for (let i = n - 1; i > 0; i--) X[i] ^= X[i - 1];
  X[0] ^= t;
  for (let Q = 2; Q !== N; Q <<= 1) { const P = Q - 1;
    for (let i = n - 1; i >= 0; i--) { if (X[i] & Q) X[0] ^= P; else { t = (X[0] ^ X[i]) & P; X[0] ^= t; X[i] ^= t; } } }
  return X;
}

/* ---------- palette (sRGB, identical to origins.js) ---------- */
export const BG = [9, 9, 10], IV = [240, 236, 226], GOLD = [222, 184, 108], SILVER = [206, 212, 222];
const mixA = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const col = (a) => new THREE.Color().setRGB(a[0] / 255, a[1] / 255, a[2] / 255, THREE.SRGBColorSpace);

const B = 1.5;        // sculpture base height above the plane
const PXU = 1 / 40;   // one 2D pixel (on the 1000-px card) in grid units

/* =====================================================================================================
   FIGURE: token traits -> abstract 3D description (no three.js objects yet)
   paths: polylines [{pts:[[x,y,h]...], a, w}]   a = ink amount (like mix(BG, ink, a) in 2D), w = 2D line width px
   segs:  independent segments [{pts:[[x,y,h],[x,y,h]]...}] grouped by {a,w}
   cubes: [{x,y,h,r}]  r = half size in 2D px (as sq(x,y,r) in 2D);  hollow: same, drawn as edges
   ===================================================================================================== */
export function buildFigure(p) {
  const F = { paths: [], segGroups: [], cubes: [], hollow: [], clouds: [], sheets: [], drops: [], bloom: 1, lineBoost: 1 };
  const rot = p.rotation * PI / 180;
  const fit = (!rot || /Rose|Spiral|Phyllotaxis|Orbits|Times Table|Spirograph/.test(p.family)) ? 1 : 1 / (Math.abs(Math.cos(rot)) + Math.abs(Math.sin(rot)));
  const P = (gx, gy, norot) => { if (rot && !norot) { const c = Math.cos(rot), s = Math.sin(rot); return [(gx * c - gy * s) * fit, (gx * s + gy * c) * fit]; } return [gx, gy]; };
  const V = (gx, gy, h, norot) => { const q = P(gx, gy, norot); return [q[0], q[1], h]; };
  const seg = (a, w) => { const g = { a, w, pts: [] }; F.segGroups.push(g); return g; };
  const cube = (v, r) => F.cubes.push({ x: v[0], y: v[1], h: v[2], r });
  const f = p.family;
  let i, t, pts;

  if (f === 'Rose') {
    const kk = p.n / p.d, turns = p.d * ((p.n % 2 && p.d % 2) ? 1 : 2); pts = [];
    for (i = 0; i <= 3000; i++) { t = i / 3000 * PI * turns; const rr = p.amp * Math.cos(kk * t), u = rr / p.amp;
      pts.push(V(rr * Math.cos(t), rr * Math.sin(t), B + 0.25 + 3.4 * u * u)); }      // petals open upward
    F.paths.push({ pts, a: .62, w: 1.1 });
    for (i = 0; i <= 3000; i += 75) cube(pts[i], 2.4);
    F.goldH = B + 0.9;
  }
  else if (f === 'Spiral') {
    const sg = p.cw ? -1 : 1, tmax = 10.2 / p.a;
    for (let m = 0; m < p.arms; m++) { pts = [];
      for (t = 0; t < tmax; t += p.step) { const ang = sg * t + m * TAU / p.arms; pts.push(V(p.a * t * Math.cos(ang), p.a * t * Math.sin(ang), B + 0.2 + 5.4 * Math.pow(t / tmax, 1.15))); }
      F.paths.push({ pts, a: .62, w: 1.1 });
      for (i = 0; i < pts.length; i += 14) cube(pts[i], 2.5); }
    F.goldH = B + 1.6;
  }
  else if (f === 'Orbits') {
    const Hc = B + 2.4;
    for (i = 0; i < p.rings; i++) {
      const R = 1.6 + i * (8 / Math.max(1, p.rings - 1));
      const tilt = (p.phase[(i + 5) % 12] / 6.283 - .5) * 0.42, az = p.phase[(i + 9) % 12];     // small deterministic tilt, like an orrery
      const ax = Math.cos(az), ay = Math.sin(az), ct = Math.cos(tilt), st = Math.sin(tilt);
      const onRing = (th) => { const x = R * Math.cos(th), y = R * Math.sin(th);
        const d = x * ax + y * ay, px = x - d * ax, py = y - d * ay;                     // rotate about horizontal axis (ax, ay)
        return [d * ax + px * ct, d * ay + py * ct, Hc + Math.hypot(px, py) * st * Math.sign(-ay * x + ax * y)]; };
      pts = []; for (let k = 0; k <= 720; k++) pts.push(onRing(k / 720 * TAU));
      F.paths.push({ pts, a: i % 2 ? .5 : .36, w: 1 });
      for (let m = 0; m < p.sats[i]; m++) { t = p.phase[(i + m) % 12] + m * 2.1; cube(onRing(t), m === 0 ? 3.2 : 2.4); }
    }
    cube([0, 0, Hc], 7);
    F.paths.push({ pts: [[0, 0, 0.02], [0, 0, Hc - .2]], a: .2, w: .8 });               // the orrery's stem
    F.goldH = Hc;
  }
  else if (f === 'Waves') {
    const dz = Math.min(.95, 6 / p.lines), lines = [];
    for (let k = 0; k < p.lines; k++) { pts = []; const A = 8.4 * Math.exp(-k * p.decay), ph = k * p.shift, h = B + (p.lines - 1 - k) * dz;
      for (i = 0; i <= 880; i++) { const gx = -11 + i / 880 * 22; pts.push(V(gx, A * Math.sin(gx * p.freq + ph) * Math.exp(-Math.abs(gx) * .06), h)); }
      F.paths.push({ pts, a: Math.max(.22, .78 - k * .07), w: 1 }); lines.push(pts); }
    for (let gx = -10; gx <= 10; gx++) cube(V(gx, 8.4 * Math.sin(gx * p.freq) * Math.exp(-Math.abs(gx) * .06), B + (p.lines - 1) * dz), 2.5);
    for (let k = 0; k + 1 < lines.length; k++) F.sheets.push({ a: lines[k], b: lines[k + 1], step: 4 });   // faint terrain between lines
    F.goldH = B + (p.lines - 1) * dz * .5;
  }
  else if (f === 'Phyllotaxis') {
    const ga = p.angle * PI / 180, scl = 9.6 / Math.sqrt(p.count), dome = (r) => B + 3.1 * (1 - Math.pow(r / 9.6, 2));
    for (i = 1; i < p.count; i++) { const r2 = scl * Math.sqrt(i); t = i * ga; cube(V(r2 * Math.cos(t), r2 * Math.sin(t), dome(r2)), 1.3 + 2.3 * (i / p.count)); }
    cube([0, 0, dome(0)], 5);
    F.bloom = .6; F.goldH = B + 1.5;
  }
  else if (f === 'Lissajous') {
    const c = Math.max(1, Math.abs(p.a - p.b)); pts = [];                                   // closed: a, b, c are integers
    for (i = 0; i <= 3200; i++) { t = i / 3200 * TAU; pts.push(V(9 * Math.sin(p.a * t + p.phase), 9 * Math.sin(p.b * t), B + 3.6 + 3.6 * Math.sin(c * t + p.phase + PI / 4))); }
    F.paths.push({ pts, a: .62, w: 1 });
    for (i = 0; i < 3200; i += 100) cube(pts[i], 2.4);
    F.goldH = B + 3.6;
  }
  else if (f === 'Spirograph') {
    const Rr = p.R - p.r, d = p.r * p.dd, turns2 = p.r / gcd(p.R, p.r), scale = 9.4 / (Rr + d), N = 5000; pts = [];
    for (i = 0; i <= N; i++) { t = i / N * TAU * turns2;
      const x = (Rr * Math.cos(t) + d * Math.cos(Rr / p.r * t)) * scale, y = (Rr * Math.sin(t) - d * Math.sin(Rr / p.r * t)) * scale, u = Math.hypot(x, y) / 9.4;
      pts.push(V(x, y, B + 0.4 + 3.2 * u * u + 0.55 * Math.sin(2 * t))); }                // a crown with a gentle wave
    F.paths.push({ pts, a: .62, w: .9 });
    for (i = 0; i <= N; i += Math.round(N / (turns2 * 12))) cube(pts[i], 2.2);
    F.goldH = B + 1.8;
  }
  else if (f === 'Harmonograph') {
    const raw = []; let mx = 0, mz = 0; const f3 = Math.max(p.f1, p.f2) + 1 + p.det, p3 = p.p1 + p.p2;
    for (i = 0; i <= 7000; i++) { t = i * .05; const e = Math.exp(-p.damp * t);
      const x2 = Math.sin(p.f1 * t + p.p1) * e + Math.sin((p.f2 + p.det) * t) * e * .6, y2 = Math.sin((p.f1 + p.det) * t) * e + Math.sin(p.f2 * t + p.p2) * e * .6;
      const z2 = Math.sin(f3 * t + p3) * e;                                                   // third pendulum, same damping
      raw.push([x2, y2, z2]); mx = Math.max(mx, Math.abs(x2), Math.abs(y2)); mz = Math.max(mz, Math.abs(z2)); }
    // the trace descends as it decays: wide early loops float high, the quiet end settles low — a vortex
    pts = raw.map((q, k) => { const e = Math.exp(-p.damp * k * .05); return V(q[0] / mx * 9.2, q[1] / mx * 9.2, B + .3 + 4.4 * e + .7 * e * q[2] / mz); });
    F.paths.push({ pts, a: .34, w: .55 });
    for (i = 0; i < raw.length; i += 350) cube(pts[i], 2.2);
    F.bloom = .55; F.goldH = B + 2.4;
  }
  else if (f === 'Rings') {
    const r = rng('rings' + p.seed), hk = (k) => B + (p.rings - k) * .46;                    // inner rings higher: a ziggurat
    for (let k = 1; k <= p.rings; k++) { const e = k + .5, top = hk(k), bot = k < p.rings ? hk(k + 1) : 0.02, a = k % 5 ? .2 : .32;
      const sqr = (h) => [[-e, e, h], [e, e, h], [e, -e, h], [-e, -e, h], [-e, e, h]];
      F.paths.push({ pts: sqr(top), a, w: 1 });
      F.paths.push({ pts: sqr(bot), a: a * .6, w: .8 });
      const g = seg(a * .55, .7); [[-e, e], [e, e], [e, -e], [-e, -e]].forEach(c => g.pts.push([c[0], c[1], bot], [c[0], c[1], top])); }
    for (let gx = -p.rings; gx <= p.rings; gx++) for (let gy = -p.rings; gy <= p.rings; gy++) {
      const k = Math.max(Math.abs(gx), Math.abs(gy)); if (!k) continue;
      if (r() < .92 - k * p.fall) F.cubes.push({ x: gx, y: gy, h: hk(k), r: 3 }); else F.hollow.push({ x: gx, y: gy, h: hk(k), r: 3 }); }
    F.cubes.push({ x: 0, y: 0, h: hk(0), r: 6 });
    F.bloom = .7; F.goldH = B + 1;
  }
  else if (f === 'Times Table') {
    const NP = p.pts, RA = 9.2, pp = [];
    for (i = 0; i < NP; i++) { t = i / NP * TAU + PI / 2; pp.push(P(RA * Math.cos(t), RA * Math.sin(t))); }
    const g = seg(.36, .6);
    for (i = 0; i < NP; i++) { const jj = Math.floor(i * p.mult) % NP; if (jj === i) continue;
      const a = pp[i], b = pp[jj], L = Math.hypot(a[0] - b[0], a[1] - b[1]), H = .3 * L, S = 14; let prev = null;
      for (let s = 0; s <= S; s++) { const u = s / S, q = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, B + 4 * u * (1 - u) * H];
        if (prev) g.pts.push(prev, q); prev = q; } }                                          // every chord bows into an arc
    pts = []; for (i = 0; i <= 720; i++) { t = i / 720 * TAU; pts.push([RA * Math.cos(t), RA * Math.sin(t), B]); }
    F.paths.push({ pts, a: .3, w: 1 });
    for (i = 0; i < NP; i += Math.max(1, Math.round(NP / 40))) cube([pp[i][0], pp[i][1], B], 2);
    F.bloom = .6; F.goldH = B + 1;
  }
  else if (f === 'Envelope') {
    const quads = { all: [[1, 1], [-1, 1], [-1, -1], [1, -1]], opposite: [[1, 1], [-1, -1]], single: [[1, 1]], nested: [[1, 1], [-1, 1], [-1, -1], [1, -1]] }[p.quads];
    const layers = p.quads === 'nested' ? [{ S: 10, h0: B, h1: B + 4.6 }, { S: 5, h0: B + 2.6, h1: B + 4.9 }] : [{ S: 10, h0: B, h1: B + 4.6 }];
    layers.forEach(Ly => quads.forEach((qd, qi) => { const g = seg(qi % 2 ? .42 : .58, 1);           // ruled surface: x-axis low, y-axis high
      for (let i2 = 0; i2 <= p.lines; i2++) g.pts.push(V(qd[0] * i2 * Ly.S / p.lines, 0, Ly.h0), V(0, qd[1] * (p.lines - i2) * Ly.S / p.lines, Ly.h1));
      for (let i2 = 0; i2 <= p.lines; i2++) { cube(V(qd[0] * i2 * Ly.S / p.lines, 0, Ly.h0), 2.1); cube(V(0, qd[1] * i2 * Ly.S / p.lines, Ly.h1), 2.1); } }));
    F.goldH = B + 2.3;
  }
  else if (f === 'Hilbert') {
    const bits = p.order === 3 ? 2 : 3, n3 = 1 << bits, cnt = n3 * n3 * n3;              // order 3 -> 4³ = 64 pts, order 4 -> 8³ = 512 pts
    const sp = 14 / (n3 - 1), hs = 5.2 / (n3 - 1); pts = [];
    for (i = 0; i < cnt; i++) { const q = d2xyz(bits, i); pts.push(V(-7 + q[0] * sp, -7 + q[1] * sp, B + q[2] * hs)); }
    F.paths.push({ pts, a: .62, w: 1.1 });
    for (i = 0; i < pts.length; i++) cube(pts[i], p.order === 3 ? 2.8 : 2);
    F.goldH = B + 2.6;
  }
  else if (f === 'Sierpinski') {
    const vs = [], H = 7.2;
    for (i = 0; i < p.v; i++) { t = i / p.v * TAU + PI / 2; vs.push(V(9.3 * Math.cos(t), 9.3 * Math.sin(t), B)); }
    if (p.v >= 5) for (i = 0; i < p.v; i++) { t = i / p.v * TAU + PI / 2; vs.push(V(4.65 * Math.cos(t), 4.65 * Math.sin(t), B + H * .55)); }  // prism top
    vs.push([0, 0, B + H]);                                                                    // apex: tetrahedron (3) / pyramid (4) / prism + apex (5–6)
    const r = rng('sier3d' + p.seed), cloud = []; let c = [0, 0, B], last = -1;
    for (i = 0; i < 70000; i++) { const vi = Math.floor(r() * vs.length); if (p.v === 4 && vi === last) continue; last = vi;
      for (let k = 0; k < 3; k++) c[k] += (vs[vi][k] - c[k]) * (1 - p.ratio); if (i > 20) cloud.push(c[0], c[1], c[2]); }
    F.clouds.push({ pos: cloud, a: .85, size: 1.8, opacity: .3 });
    vs.forEach(v => cube(v, 3.4));
    F.bloom = .5; F.goldH = B + 1.4;
  }
  else if (f === 'Constellation') {
    const r = rng('const' + p.seed), ps = [[0, 0]];
    while (ps.length < p.stars) { const cand = [rint(r, -9, 9), rint(r, -9, 9)]; let ok = true;
      for (i = 0; i < ps.length; i++) if (Math.abs(cand[0] - ps[i][0]) + Math.abs(cand[1] - ps[i][1]) < 2) { ok = false; break; } if (ok) ps.push(cand); }
    const rh = rng('const3d' + p.seed), H = new Map(); ps.forEach(s => H.set(s, B + .3 + rh() * 4.8));   // seeded height per star
    const W3 = (s) => [s[0], s[1], H.get(s)], g = seg(.62, 1.2);
    if (p.closed) { ps.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])); for (i = 0; i < ps.length; i++) g.pts.push(W3(ps[i]), W3(ps[(i + 1) % ps.length])); }
    else { const inT = [ps[0]], rest = ps.slice(1);
      while (rest.length) { let best = null, bd = 1e9; inT.forEach(a => rest.forEach(b => { const d2 = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d2 < bd) { bd = d2; best = [a, b]; } }));
        g.pts.push(W3(best[0]), W3(best[1])); inT.push(best[1]); rest.splice(rest.indexOf(best[1]), 1); } }
    const dg = seg(.16, .7); ps.forEach(s => { dg.pts.push([s[0], s[1], 0.02], [s[0], s[1], H.get(s)]); cube(W3(s), 4); });   // star-map drop lines
    F.goldH = B + 1.2;
  }
  else if (f === 'Ulam') {
    const S = 26 / 40; let x3 = 0, y3 = 0, dx = 1, dy = 0, sl = 1; const up = [[0, 0]];
    while (up.length < 35 * 35) { for (let h = 0; h < 2; h++) { for (let s4 = 0; s4 < sl; s4++) { x3 += dx; y3 += dy; up.push([x3, y3]); } const tmp = dx; dx = -dy; dy = tmp; } sl++; }
    const g = seg(.45, .8), maxN = 33 * 33;
    for (i = 0; i < up.length; i++) { const a4 = up[i][0], b4 = up[i][1]; if (Math.abs(a4) > 16 || Math.abs(b4) > 14) continue; const nn = i + 1;
      const lit = p.show === 'primes' ? isPrime(nn) : p.show === 'twin primes' ? (isPrime(nn) && (isPrime(nn + 2) || isPrime(nn - 2))) : (Math.round(Math.sqrt(nn)) * Math.round(Math.sqrt(nn)) === nn);
      if (lit) { const h = .35 + 4.6 * Math.sqrt(Math.min(1, nn / maxN)); g.pts.push([a4 * S, b4 * S, 0.02], [a4 * S, b4 * S, h]); cube([a4 * S, b4 * S, h], 3.3); } }
    F.goldH = B + .5;
  }
  F.goldH = F.goldH || B + 1;
  return F;
}

/* =====================================================================================================
   2D capture: replays origins.js on a recording canvas.
   - texts(): exact frame strings / fonts / colours of the 2D card (frame overlay + golden label)
   - blueprint(): the 2D figure only (no background, plane, golden point or frame) for the floor
   ===================================================================================================== */
function proxyCtx(real, onText, blockAfterFigure) {
  let clipped = false, figureDone = false;
  const blocked = { fillRect: 1, strokeRect: 1, stroke: 1, fill: 1, fillText: 1 };
  return new Proxy(real, {
    get(t, k) { const v = t[k]; if (typeof v !== 'function') return v;
      return (...a) => {
        if (k === 'clip') clipped = true;
        else if (k === 'restore' && clipped && !figureDone) { figureDone = true; }
        if (k === 'fillText' && onText) onText({ text: a[0], x: a[1], y: a[2], font: t.font, fill: t.fillStyle, align: t.textAlign });
        if (blockAfterFigure && figureDone && blocked[k]) return;
        return v.apply(t, a); }; },
    set(t, k, v) { t[k] = v; return true; } });
}
export function capture2D(no) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1000;
  const texts = []; ORIGINS.draw(proxyCtx(cv.getContext('2d'), (x) => texts.push(x), false), no, 1000);
  // order in origins.js: [golden label], O R I G I N S, number, family, formula, n / 3333
  return { label: texts[texts.length - 6], frame: texts.slice(-5) };
}
export function blueprintCanvas(no, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  ORIGINS.draw(proxyCtx(cv.getContext('2d'), null, true), no, size, { noBg: true, noPlane: true, noFrame: true });
  return cv;
}
/* frame overlay, same geometry as origins.js; s = output px per 1000-card unit */
export function drawFrame(ctx, no, size, labelPos) {
  const s = size / 1000, cap = capture2D(no), mu = (t) => { const c = mixA(BG, IV, t); return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`; };
  ctx.save(); ctx.scale(s, s);
  ctx.strokeStyle = mu(.22); ctx.lineWidth = Math.max(1, 1 / s * .9); ctx.strokeRect(34, 34, 932, 932);
  ctx.textBaseline = 'alphabetic';
  cap.frame.forEach(T => { ctx.font = T.font; ctx.fillStyle = T.fill; ctx.textAlign = T.align; ctx.fillText(T.text, T.x, T.y); });
  if (labelPos) { const T = cap.label, right = labelPos.right; ctx.font = T.font; ctx.fillStyle = T.fill; ctx.textAlign = right ? 'left' : 'right';
    ctx.fillText(T.text, labelPos.x / s + (right ? 14 : -14), labelPos.y / s - 10); }
  ctx.restore();
}

/* =====================================================================================================
   RENDERER
   ===================================================================================================== */
const FULLSCREEN_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

export class Origins3D {
  constructor(canvas, { size = 1024, ss = 2, preserveDrawingBuffer = false } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = true;
    this.camera = new THREE.PerspectiveCamera(38, 1, .5, 600);
    this.view = { azimuth: 38, elevation: 30, distance: 43, target: new THREE.Vector3(0, 2.0, 0), top: false };
    this.time = 0;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.setSize(size, ss);
  }

  setSize(size, ss = this.ss) {
    this.size = size; this.ss = ss; const S = Math.round(size * ss);
    this.renderer.setSize(size, size, false);
    const mk = (w, opt = {}) => new THREE.WebGLRenderTarget(w, w, { type: THREE.HalfFloatType, ...opt });
    [this.floorRT, this.reflRT, this.blurRT, this.sculptRT].forEach(r => r && r.dispose());
    this.floorRT = mk(S, { samples: 4 });
    const R = Math.max(64, Math.round(S / 4));
    this.reflRT = mk(R, { samples: 4 }); this.blurRT = mk(R);
    this.sculptRT = mk(S, { samples: 4 });
    if (this.composer) this.composer.dispose?.();
    this.composer = new EffectComposer(this.renderer, this.sculptRT);
    this.composer.renderToScreen = false;
    this.composer.setPixelRatio(1); this.composer.setSize(S, S);
    this.renderPass = new RenderPass(null, this.camera, null, new THREE.Color(0), 1);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(S, S), .7, .55, 0);
    this.composer.addPass(this.renderPass); this.composer.addPass(this.bloomPass);
    if (this.lineMats) this.lineMats.forEach(m => m.resolution.set(S, S));
    this.S = S;
  }

  /* ---------------- scene for a token ---------------- */
  setToken(no) {
    this.no = no; const p = this.p = ORIGINS.all()[no];
    const F = this.F = buildFigure(p);
    const inkRGB = p.ink === 'Gold' ? GOLD : p.ink === 'Silver' ? SILVER : IV;
    this.inkBoost = p.ink === 'Silver' ? 1.12 : p.ink === 'Gold' ? 1.05 : 1;
    this.disposeScene();
    this.lineMats = []; this.pointsMats = [];
    const lineMat = (rgb, w, o = {}) => { const m = new LineMaterial({ color: col(rgb).multiplyScalar(o.boost || 1), linewidth: w, worldUnits: true, transparent: !!o.opacity && o.opacity < 1, opacity: o.opacity ?? 1,
        dashed: !!o.dashed, dashSize: o.dashSize || 1, gapSize: o.gapSize || 1, fog: true, toneMapped: false, depthWrite: o.depthWrite ?? true, blending: o.blending ?? THREE.NormalBlending });
      m.resolution.set(this.S, this.S); this.lineMats.push(m); return m; };
    const LW = (w) => .012 + .03 * w;                                              // 2D px width -> world-units filament
    const W = (q) => [q[0], q[2], -q[1]];                                          // (x, y, h) -> three.js (X, Y, Z)
    const segsObj = (flat, rgb, w, o) => { const g = new LineSegmentsGeometry(); g.setPositions(flat); const l = new LineSegments2(g, lineMat(rgb, w, o)); if (o && o.dashed) l.computeLineDistances(); return l; };

    /* ---- sculpture scene ---- */
    const sc = this.sculpt = new THREE.Scene(); sc.fog = new THREE.FogExp2(0x000000, .0075);
    const grp = this.sculptGroup = new THREE.Group(); sc.add(grp);
    const boost = this.inkBoost * F.lineBoost;
    F.paths.forEach(L => { const flat = []; for (let i = 1; i < L.pts.length; i++) flat.push(...W(L.pts[i - 1]), ...W(L.pts[i])); grp.add(segsObj(flat, mixA(BG, inkRGB, L.a), LW(L.w), { boost })); });
    F.segGroups.forEach(G => { if (!G.pts.length) return; const flat = []; G.pts.forEach(q => flat.push(...W(q))); grp.add(segsObj(flat, mixA(BG, inkRGB, G.a), LW(G.w), { boost })); });
    // translucent terrain sheets (Waves)
    F.sheets.forEach(Sh => { const pos = []; for (let i = 0; i + Sh.step < Sh.a.length; i += Sh.step) { const a0 = W(Sh.a[i]), a1 = W(Sh.a[i + Sh.step]), b0 = W(Sh.b[i]), b1 = W(Sh.b[i + Sh.step]); pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      grp.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col(inkRGB), transparent: true, opacity: .009, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }))); });
    // point clouds (Sierpinski) — square points, the brand motif
    F.clouds.forEach(Cl => { const g = new THREE.BufferGeometry(); const flat = []; for (let i = 0; i < Cl.pos.length; i += 3) flat.push(Cl.pos[i], Cl.pos[i + 2], -Cl.pos[i + 1]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
      const m = new THREE.PointsMaterial({ color: col(mixA(BG, inkRGB, Cl.a)).multiplyScalar(boost), size: Cl.size * PXU * 2.6, sizeAttenuation: true, transparent: true, opacity: Cl.opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
      m.userData.baseSize = m.size; this.pointsMats.push(m); const pts3 = new THREE.Points(g, m); pts3.userData.noReflect = true; grp.add(pts3); });
    // cubes
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cubeMat = new THREE.MeshStandardMaterial({ color: col(inkRGB), emissive: col(inkRGB), emissiveIntensity: .3 * boost, roughness: .45, metalness: 0, side: THREE.DoubleSide, fog: true });
    const addCubes = (list, mat) => { if (!list.length) return; const im = new THREE.InstancedMesh(box, mat, list.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
      list.forEach((c, i) => { const e = 2 * c.r * PXU; v.set(c.x, c.h, -c.y); s.set(e, e, e); m4.compose(v, q, s); im.setMatrixAt(i, m4); }); grp.add(im); };   // squares stay axis-aligned, as in 2D
    addCubes(F.cubes, cubeMat);
    if (F.hollow.length) { const flat = []; const E = [[-1,-1,-1,1,-1,-1],[1,-1,-1,1,1,-1],[1,1,-1,-1,1,-1],[-1,1,-1,-1,-1,-1],[-1,-1,1,1,-1,1],[1,-1,1,1,1,1],[1,1,1,-1,1,1],[-1,1,1,-1,-1,1],[-1,-1,-1,-1,-1,1],[1,-1,-1,1,-1,1],[1,1,-1,1,1,1],[-1,1,-1,-1,1,1]];
      F.hollow.forEach(c => { const e = c.r * PXU; E.forEach(s2 => flat.push(c.x + s2[0] * e, c.h + s2[1] * e, -c.y + s2[2] * e, c.x + s2[3] * e, c.h + s2[4] * e, -c.y + s2[5] * e)); });
      grp.add(segsObj(flat, mixA(BG, inkRGB, .45), .018, { boost })); }
    // lights for the cubes: key + rim (dark gallery)
    sc.add(new THREE.AmbientLight(0xffffff, .25));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(10, 22, 14); sc.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.6); rim.position.set(-14, 9, -22); sc.add(rim);

    // golden point
    const gx = p.gold[0], gy = p.gold[1], origin = p.special === 'Origin';
    const gH = origin ? B + 2.6 : F.goldH; this.goldPos = new THREE.Vector3(gx, gH, -gy);
    const goldMat = new THREE.MeshStandardMaterial({ color: col(GOLD), emissive: col(GOLD), emissiveIntensity: .55, roughness: .45, side: THREE.DoubleSide, fog: true });
    const gc = new THREE.Mesh(box, goldMat); const ge = (origin ? 11 : 6) * 2 * PXU * 1.15; gc.scale.set(ge, ge, ge); gc.position.copy(this.goldPos); sc.add(gc);
    const dashO = { dashed: true, dashSize: .15, gapSize: .15 };
    sc.add(segsObj([gx, gH - ge / 2, -gy, gx, .02, -gy], mixA(BG, GOLD, .7), .022, dashO));
    if (origin) { // vertical beam of gold light
      const bg = new THREE.CylinderGeometry(.028, .028, 30, 16, 1, true); bg.translate(0, 15, 0);
      const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { c: { value: col(GOLD) } }, vertexShader: `varying float vH; void main(){ vH = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform vec3 c; varying float vH; void main(){ float a = smoothstep(0.,1.2,vH)*exp(-vH*.15); gl_FragColor = vec4(c*a*.22, 1.); }` });
      sc.add(new THREE.Mesh(bg, bm));
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 30, 24, 1, true).translate(0, 15, 0), bm.clone()); halo.material.fragmentShader = bm.fragmentShader.replace('*.22,', '*.018,'); sc.add(halo);
    }

    /* ---- floor scene ---- */
    const fl = this.floor = new THREE.Scene();
    const floorMat = new THREE.ShaderMaterial({ uniforms: { base: { value: col(BG) }, camPos: { value: new THREE.Vector3() } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 base; uniform vec3 camPos; varying vec3 vW;
        void main(){ float d = length(vW.xz); float pool = exp(-d*d/420.);           // soft gallery light pool under the work
          float fresnel = pow(1. - clamp(normalize(camPos - vW).y, 0., 1.), 3.);
          vec3 c = base*(.72 + .9*pool) + vec3(.0016,.0016,.0018)*fresnel*pool;
          float fade = exp(-pow(length(vW.xz)/70., 2.)); gl_FragColor = vec4(mix(base*.55, c, fade), 1.); }` });
    this.floorMat = floorMat;
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-PI / 2), floorMat); fl.add(floorMesh);
    // grid of dots (as in 2D: inside x 70..930, y 110..890 of the card)
    const dots = []; for (let i2 = -20; i2 <= 20; i2++) for (let j2 = -20; j2 <= 20; j2++) { const x = 500 + i2 * 40, y = 500 + j2 * 40; if (x > 70 && x < 930 && y > 110 && y < 890) dots.push([i2, -j2]); }
    const dotGeo = new THREE.PlaneGeometry(1.8 * PXU * 1.35, 1.8 * PXU * 1.35).rotateX(-PI / 2);
    const dotIm = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: col(mixA(BG, IV, .24)), fog: false }), dots.length);
    const m4 = new THREE.Matrix4(); dots.forEach((d, i) => { m4.makeTranslation(d[0], .004, -d[1]); dotIm.setMatrixAt(i, m4); }); fl.add(dotIm);
    // axes + ticks
    const axFlat = [-11, .006, 0, 11, .006, 0, 0, .006, 10, 0, .006, -10]; fl.add(segsObj(axFlat, mixA(BG, IV, .34), .024));
    const tk = []; for (let k = 1; k < 12; k++) for (let sgn = -1; sgn <= 1; sgn += 2) { const v = sgn * k, L = (k % 5 === 0 ? 6 : 3.5) * PXU;
      if (500 + v * 40 > 60 && 500 + v * 40 < 940) tk.push(v, .006, -L, v, .006, L); if (500 + v * 40 > 100 && 500 + v * 40 < 900) tk.push(-L, .006, -v, L, .006, -v); }
    fl.add(segsObj(tk, mixA(BG, IV, .46), .022));
    // the 2D figure as a faint blueprint on the plane
    const bpTex = new THREE.CanvasTexture(blueprintCanvas(no, 4096)); bpTex.colorSpace = THREE.SRGBColorSpace; bpTex.anisotropy = 8; bpTex.generateMipmaps = true; bpTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.bpTex = bpTex;
    const bp = new THREE.Mesh(new THREE.PlaneGeometry(25, 25).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: bpTex, transparent: true, opacity: .2, depthWrite: false, blending: THREE.AdditiveBlending }));
    bp.position.y = .008; fl.add(bp);
    // golden guides on the floor: foot -> both axes
    if (gx || gy) { const gf = []; if (gy) gf.push(gx, .01, -gy, gx, .01, 0); if (gx) gf.push(gx, .01, -gy, 0, .01, -gy); fl.add(segsObj(gf, mixA(BG, GOLD, .62), .022, dashO));
      const foot = new THREE.Mesh(new THREE.PlaneGeometry(.12, .12).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: col(mixA(BG, GOLD, .7)) })); foot.position.set(gx, .012, -gy); fl.add(foot); }

    // bloom character per ink / family
    const warm = p.special === 'Gold' ? 1.25 : p.ink === 'Silver' ? 1.1 : 1;
    this.bloomPass.strength = .48 * F.bloom * warm; this.bloomPass.radius = .28; this.bloomPass.threshold = .04; this.bloomPass.threshold = 0;
    this.buildPost();
  }

  disposeScene() {
    [this.sculpt, this.floor].forEach(s => s && s.traverse(o => { o.geometry && o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map && x.map.dispose(); x.dispose(); }); }));
  }

  buildPost() {
    if (this.blurMat) return;
    this.blurMat = new THREE.ShaderMaterial({ uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: FULLSCREEN_VS, depthTest: false,
      fragmentShader: `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
        void main(){ vec4 s = texture2D(tex, vUv)*.2270; const float o1 = 1.3846, o2 = 3.2308;
          s += (texture2D(tex, vUv + dir*o1) + texture2D(tex, vUv - dir*o1))*.3162 + (texture2D(tex, vUv + dir*o2) + texture2D(tex, vUv - dir*o2))*.0703; gl_FragColor = s; }` });
    this.compMat = new THREE.ShaderMaterial({ depthTest: false,
      uniforms: { floorTex: { value: null }, reflTex: { value: null }, sculptTex: { value: null }, exposure: { value: 1.0 }, seed: { value: 0 }, texel: { value: new THREE.Vector2() },
        invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, focus: { value: 50 }, reflK: { value: .16 }, outRes: { value: 1 } },
      vertexShader: FULLSCREEN_VS,
      fragmentShader: `uniform sampler2D floorTex, reflTex, sculptTex; uniform float exposure, seed, focus, reflK, outRes; uniform vec2 texel; uniform mat4 invProj, camWorld; varying vec2 vUv;
        vec3 aces(vec3 x){ const float a=2.51,b=.03,c=2.43,d=.59,e=.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
        vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - .055, step(.0031308, c)); }
        float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423) + seed*.0137); p += dot(p, p.yx + 19.19); return fract((p.x + p.y)*p.x); }
        void main(){
          // analytic distance to the plane y = 0 along this pixel's ray -> gentle depth of field on the floor only
          vec4 v = invProj*vec4(vUv*2. - 1., 1., 1.); vec3 dir = normalize((camWorld*vec4(v.xyz/v.w, 0.)).xyz); vec3 o = camWorld[3].xyz;
          float tHit = dir.y < -1e-4 ? -o.y/dir.y : 1e4; vec3 hit = o + dir*tHit;
          float coc = clamp((abs(tHit - focus) - 14.)/45., 0., 1.)*5.;
          vec3 fl = texture2D(floorTex, vUv).rgb;
          if (coc > .05) { vec3 acc = fl; float wsum = 1.;
            for (int i = 0; i < 12; i++) { float a = float(i)*2.39996 + 1.; float r = sqrt(float(i) + .5)/3.5; vec2 off = vec2(cos(a), sin(a))*r*coc*texel;
              acc += texture2D(floorTex, vUv + off).rgb; wsum += 1.; } fl = acc/wsum; }
          float fres = .35 + .65*pow(1. - clamp(-dir.y, 0., 1.), 2.);
          float reach = exp(-pow(length(hit.xz)/26., 2.));
          vec3 refl = texture2D(reflTex, vUv).rgb*reflK*fres*reach;
          vec3 sc = texture2D(sculptTex, vUv).rgb;
          vec3 c = aces((fl + refl + sc)*exposure);
          vec2 q = vUv - .5; c *= 1. - .42*smoothstep(.32, .78, length(q)*1.18);      // soft vignette
          c = toSRGB(c);
          c += (hash(floor(vUv*outRes)) - .5)*.022;                                    // very fine film grain, seeded per token
          gl_FragColor = vec4(c, 1.); }` });
  }

  updateCamera() {
    const v = this.view, cam = this.camera;
    if (v.top) { cam.position.set(0, 72, 0.0001); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.fov = 21.6; }
    else { const az = v.azimuth * PI / 180, el = v.elevation * PI / 180;
      cam.position.set(v.target.x + v.distance * Math.sin(az) * Math.cos(el), v.target.y + v.distance * Math.sin(el), v.target.z + v.distance * Math.cos(az) * Math.cos(el));
      cam.up.set(0, 1, 0); cam.lookAt(v.target); cam.fov = 38; }
    cam.aspect = 1; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  render() {
    const r = this.renderer; this.updateCamera();
    this.floorMat.uniforms.camPos.value.copy(this.camera.position);
    // floor
    r.setClearColor(col(BG), 1); r.setRenderTarget(this.floorRT); r.clear(); r.render(this.floor, this.camera);
    // mirrored sculpture -> blurred reflection
    this.sculptGroup.scale.y = -1; this.sculpt.children.forEach(o => { if (o !== this.sculptGroup && !o.isLight) o.userData._v = o.visible, o.visible = false; });
    // three scales gl_PointSize by the canvas height, not the render target's
    const ptScale = (h) => this.pointsMats.forEach(m => { m.size = m.userData.baseSize * h / this.size; });
    // point clouds stay out of the low-res reflection (1-px minimum point size would turn them into a haze)
    this.sculptGroup.children.forEach(o => { if (o.userData.noReflect) o.visible = false; });
    r.setClearColor(0x000000, 1); r.setRenderTarget(this.reflRT); r.clear(); r.render(this.sculpt, this.camera);
    this.sculptGroup.children.forEach(o => { if (o.userData.noReflect) o.visible = true; });
    this.sculptGroup.scale.y = 1; this.sculpt.children.forEach(o => { if (o.userData._v !== undefined) { o.visible = o.userData._v; delete o.userData._v; } });
    const R = this.reflRT.width; this.quad.material = this.blurMat;
    for (let k = 0; k < 2; k++) {
      this.blurMat.uniforms.tex.value = this.reflRT.texture; this.blurMat.uniforms.dir.value.set(1.6 / R, 0); r.setRenderTarget(this.blurRT); r.render(this.quadScene, this.quadCam);
      this.blurMat.uniforms.tex.value = this.blurRT.texture; this.blurMat.uniforms.dir.value.set(0, 1.6 / R); r.setRenderTarget(this.reflRT); r.render(this.quadScene, this.quadCam); }
    // sculpture + selective bloom (only the sculpture scene ever blooms)
    ptScale(this.S);
    this.renderPass.scene = this.sculpt; this.renderPass.camera = this.camera;
    this.composer.render();
    // composite -> canvas (ss× supersampled targets are box-filtered by the bilinear tap at each output pixel centre)
    const u = this.compMat.uniforms;
    u.floorTex.value = this.floorRT.texture; u.reflTex.value = this.reflRT.texture; u.sculptTex.value = this.composer.readBuffer.texture;
    u.texel.value.set(1 / this.S, 1 / this.S); u.seed.value = this.no; u.outRes.value = this.size;
    u.invProj.value.copy(this.camera.projectionMatrixInverse); u.camWorld.value.copy(this.camera.matrixWorld);
    u.focus.value = this.camera.position.distanceTo(this.view.target);
    u.exposure.value = 1.18;
    this.quad.material = this.compMat; r.setRenderTarget(null); r.render(this.quadScene, this.quadCam);
  }

  /* screen position (output px) of the golden cube, for the label */
  goldScreen() { const v = this.goldPos.clone().project(this.camera); return { x: (v.x * .5 + .5) * this.size, y: (1 - (v.y * .5 + .5)) * this.size, right: this.p.gold[0] >= 0 }; }
}
