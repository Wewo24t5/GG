/* Nullorigo · ARCADE — at (−7, −7).
   Build on the plane, earn Ø, upgrade, expand. Everything starts at (0,0).
   World convention (same as nullorigo.com): plane point (x, y) -> three.js (x, height, −y). */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const IV = 0xF0ECE2, GOLD = 0xDEB86C, BG = 0x050506;
const $ = (id) => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const mobile = Math.min(innerWidth, innerHeight) < 700 || coarse;
const cl = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = cl(t); return t * t * (3 - 2 * t); }, o3 = (t) => 1 - Math.pow(1 - cl(t), 3);
const back = (t) => { t = cl(t); const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const P = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
const mn = (v) => String(v).replace('-', '−'), coord = (x, y) => `(${mn(x)}, ${mn(y)})`;
const key = (x, y) => x + ',' + y;
function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n === 0) return '0';
  if (n < .01) return n.toFixed(4);                      // a tap is worth 0.0001 Ø
  if (n < 1) return n.toFixed(3);
  if (n < 10) return n.toFixed(2);
  if (n < 1000) return n.toFixed(1);
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx']; let i = -1; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)) + u[i];
}

/* =====================================================================================================
   RULES — a long game. Paced by simulation (greedy player who visits at least daily, offline at 50 %):
   Line ≈ 6 h · Terrace ≈ 2 days · Orbit ≈ 5 days · Spiral ≈ 2 weeks · Monolith ≈ 1.5 months ·
   first level 10 ≈ 11 months · the whole plane (15 × 15) ≈ 5 years.
   ===================================================================================================== */
const TYPES = [
  { id: 'point',    name: 'Point',    cost: .02,   inc: 2.8e-6,  desc: 'A single square. Every city begins with one.' },
  { id: 'line',     name: 'Line',     cost: .4,    inc: 2.2e-5,  desc: 'Two pillars and a bridge. The first distance.' },
  { id: 'terrace',  name: 'Terrace',  cost: 8,     inc: 1.85e-4, desc: 'Rings of stone stepping up toward the light.' },
  { id: 'orbit',    name: 'Orbit',    cost: 160,   inc: 1.23e-3, desc: 'A tower that keeps its own satellites.' },
  { id: 'spiral',   name: 'Spiral',   cost: 3200,  inc: 9.3e-3,  desc: 'Every floor turns a little. Golden angle, slowly.' },
  { id: 'monolith', name: 'Monolith', cost: 64000, inc: 7.4e-2,  desc: 'Black, exact, edged in gold. Rare on any plane.' },
];
const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));
const MAXL = 10, RMAX = 7, RMIN = 2, TAP = .0001, OMAX = 10;
const EXPAND = { 2: .5, 3: 60, 4: 12000, 5: 4e6, 6: 9e8 };
const prox = (x, y) => 1 + .6 / Math.max(1, Math.max(Math.abs(x), Math.abs(y)));          // closer to (0,0) earns more
const incomeOf = (b, x, y) => TYPE[b.t].inc * Math.pow(1.85, b.L - 1) * prox(x, y);
const upCost = (b) => TYPE[b.t].cost * Math.pow(3.4, b.L);
const countOf = (t) => Object.values(S.b).filter((b) => b.t === t).length;
const buildCost = (t) => TYPE[t].cost * Math.pow(1.15, countOf(t));
const unlocked = (i) => i === 0 || S.life >= TYPES[i].cost * 1.5;                       // opens with everything you have ever earned
const originCost = () => .001 * Math.pow(6, S.origin - 1);
const tapBase = () => TAP * Math.pow(1.5, S.origin - 1);
const owned = (x, y) => Math.max(Math.abs(x), Math.abs(y)) <= S.R && !(x === 0 && y === 0);

const GOALS = [
  { t: 'Tap the origin 50 times',        p: () => [S.taps, 50], r: .002 },
  { t: 'Build a Point',                  p: () => [countOf('point'), 1], r: .005 },
  { t: 'Own 5 structures',               p: () => [nB(), 5], r: .05 },
  { t: 'Raise a Line',                   p: () => [countOf('line'), 1], r: .2 },
  { t: 'Expand the plane',               p: () => [S.R - RMIN, 1], r: 1 },
  { t: 'Catch a golden point',           p: () => [S.golds, 1], r: 1 },
  { t: 'Raise a Terrace',                p: () => [countOf('terrace'), 1], r: 5 },
  { t: 'Bring a structure to level 5',   p: () => [maxL(), 5], r: 20 },
  { t: 'Raise an Orbit',                 p: () => [countOf('orbit'), 1], r: 100 },
  { t: 'Earn 0.01 Ø per second',         p: () => [income(), .01], r: 200 },
  { t: 'Raise a Spiral',                 p: () => [countOf('spiral'), 1], r: 2000 },
  { t: 'Earn 0.1 Ø per second',          p: () => [income(), .1], r: 10000 },
  { t: 'Raise a Monolith',               p: () => [countOf('monolith'), 1], r: 50000 },
  { t: 'Own 100 structures',             p: () => [nB(), 100], r: 2e5 },
  { t: 'Bring a structure to level 10',  p: () => [maxL(), 10], r: 1e6 },
  { t: 'Earn 1 Ø per second',            p: () => [income(), 1], r: 3e6 },
  { t: 'Earn 10 Ø per second',           p: () => [income(), 10], r: 3e7 },
  { t: 'Claim the whole plane',          p: () => [S.R, RMAX], r: 1e8 },
];
const nB = () => Object.keys(S.b).length, maxL = () => Object.values(S.b).reduce((m, b) => Math.max(m, b.L), 0);

/* =====================================================================================================
   STATE (saved locally)
   ===================================================================================================== */
const SAVE = 'nullo.arcade.v2';   // v1 was the short prototype economy
const fresh = () => ({ v: 2, coins: 0, life: 0, best: 0, R: RMIN, b: {}, origin: 1, taps: 0, golds: 0, goal: 0, t: Date.now(), sound: false, boost: 0, seen: false });
let S = fresh();
let started = false;
try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && s.v === 2) S = Object.assign(fresh(), s); } catch (e) {}
started = !!S.seen;
const save = () => { S.t = Date.now(); try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) {} };
const boostOn = () => S.boost > Date.now();
function income() { let s = 0; for (const k in S.b) { const [x, y] = k.split(',').map(Number); s += incomeOf(S.b[k], x, y); } return s * (boostOn() ? 3 : 1); }
function earn(n) { S.coins += n; S.life += n; S.best = Math.max(S.best, S.coins); }

/* =====================================================================================================
   RENDERER + SCENE
   ===================================================================================================== */
const canvas = $('gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { const m = $('imsg'); if (m) { m.hidden = false; m.textContent = 'This browser cannot draw the plane in 3D (WebGL is off). Open the page in Safari or Chrome.'; } throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.6 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color(BG); scene.fog = new THREE.FogExp2(BG, .022);
const cam = new THREE.PerspectiveCamera(36, 1, .05, 400);
let comp = null, bloom = null;
if (!mobile) { comp = new EffectComposer(renderer); comp.addPass(new RenderPass(scene, cam)); bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .42, .45, .2); comp.addPass(bloom); comp.addPass(new OutputPass()); }
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); if (comp) { comp.setSize(w, h); bloom.resolution.set(w / 2, h / 2); } }
addEventListener('resize', resize); resize();
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose(); }   // soft reflections on metal and glass
scene.add(new THREE.HemisphereLight(0x8890a0, 0x050505, .55));
const key1 = new THREE.DirectionalLight(0xfff2dd, 1.25); key1.position.set(-14, 22, 9); scene.add(key1);
const rim = new THREE.DirectionalLight(0xaab4ff, .55); rim.position.set(12, 8, -16); scene.add(rim);

function glowTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.18, 'rgba(255,255,255,.5)'); gr.addColorStop(.5, 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const GLOW = glowTex();
const glow = (color, s, o) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(s, s, 1); return sp; };

/* ---------- the plane: dots, axes, ticks, land border ---------- */
const AX = 40;
const axMat = new THREE.LineBasicMaterial({ color: IV, transparent: true, opacity: .5 });
scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([P(-AX, 0), P(AX, 0), P(0, -AX), P(0, AX)]), axMat));
{ const tk = []; for (let k = 1; k <= AX; k++) { const L = k % 5 ? .07 : .14; for (const s of [-1, 1]) { const v = s * k; tk.push(P(v, -L), P(v, L), P(-L, v), P(L, v)); } }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tk), new THREE.LineBasicMaterial({ color: IV, transparent: true, opacity: .42 }))); }
const dotsIn = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: IV, size: 1.7 * renderer.getPixelRatio(), sizeAttenuation: false, transparent: true, opacity: .6, depthWrite: false }));
const dotsOut = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: IV, size: 1.4 * renderer.getPixelRatio(), sizeAttenuation: false, transparent: true, opacity: .16, depthWrite: false }));
scene.add(dotsIn, dotsOut);
const corners = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: IV, transparent: true, opacity: .22 })); scene.add(corners);
const border = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: GOLD, dashSize: .22, gapSize: .16, transparent: true, opacity: .55 })); scene.add(border);
const brackets = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: .9 })); scene.add(brackets);
let landR = S.R;                                         // animated land radius
function rebuildLand() {
  const inn = [], out = [], E = RMAX + 3;
  for (let x = -E; x <= E; x++) for (let y = -E; y <= E; y++) (Math.max(Math.abs(x), Math.abs(y)) <= S.R ? inn : out).push(x, 0, -y);
  dotsIn.geometry.setAttribute('position', new THREE.Float32BufferAttribute(inn, 3)); dotsOut.geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  rebuildCorners();
}
function rebuildCorners() {   // tiny corner marks on every free lot you own
  const v = [], c = .34, l = .09;
  for (let x = -S.R; x <= S.R; x++) for (let y = -S.R; y <= S.R; y++) { if (!owned(x, y) || S.b[key(x, y)]) continue;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const X = x + sx * c, Y = y + sy * c; v.push(P(X, Y, .005), P(X - sx * l, Y, .005), P(X, Y, .005), P(X, Y - sy * l, .005)); } }
  corners.geometry.dispose(); corners.geometry = new THREE.BufferGeometry().setFromPoints(v.length ? v : [P(0, 0), P(0, 0)]);
}
function drawBorder(R) {
  const e = R + .5, pts = [P(-e, -e, .01), P(e, -e, .01), P(e, e, .01), P(-e, e, .01)];
  border.geometry.dispose(); border.geometry = new THREE.BufferGeometry().setFromPoints(pts); border.computeLineDistances();
  const b = [], L = .55; for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const x = sx * e, y = sy * e; b.push(P(x, y, .012), P(x - sx * L, y, .012), P(x, y, .012), P(x, y - sy * L, .012)); }
  brackets.geometry.dispose(); brackets.geometry = new THREE.BufferGeometry().setFromPoints(b);
}
rebuildLand(); drawBorder(S.R);

/* ---------- pulses over the plane ---------- */
const ringGeo = new THREE.RingGeometry(.985, 1, 128);
const pulses = [];
function pulse(x, y, color = IV, size = 1.2, life = 1.1, op = .7) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.copy(P(x, y, .02)); scene.add(m); pulses.push({ m, t: 0, life, size, op });
}

/* =====================================================================================================
   ARCHITECTURE — dark metal, ivory edges, gold at level 10
   ===================================================================================================== */
const blkMat = new THREE.MeshStandardMaterial({ color: 0x121215, roughness: .48, metalness: .6, emissive: 0x040405, envMapIntensity: .32 });
const ringMat = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: .35, metalness: .7, emissive: 0x060607 });
const geoCache = new Map();
const boxGeo = (w, h, d) => { const k = `b${w},${h},${d}`; if (!geoCache.has(k)) { const g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, [g, new THREE.EdgesGeometry(g)]); } return geoCache.get(k); };
const cylGeo = (r, h) => { const k = `c${r},${h}`; if (!geoCache.has(k)) { const g = new THREE.CylinderGeometry(r, r, h, 40); geoCache.set(k, [g, new THREE.EdgesGeometry(g, 30)]); } return geoCache.get(k); };
const circle = (r, n = 96) => { const p = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; p.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); } return new THREE.BufferGeometry().setFromPoints(p); };

/* Each structure is drawn from a small kit of parts (slabs, shafts, glass bands, lit seams), merged into a few meshes
   and cached per (type, level), so a full 15 × 15 city stays light. Lot rotation varies by coordinate. */
const glassMat = new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: .12, metalness: .95, envMapIntensity: 1.1 });
const litMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(IV).multiplyScalar(.62) });
const litGoldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(.9) });
const beaconMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 1 });
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const place3 = (geo, x, y, z, ry = 0, rx = 0) => { _m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, 0)), _s); return geo.applyMatrix4(_m4); };
class Kit {
  constructor() { this.solid = []; this.glass = []; this.lit = []; this.gold = []; this.edges = []; this.beacons = []; this.top = 0; }
  add(geo, layer, edge, x, y, z, ry, rx, thr) {
    this[layer].push(place3(geo.clone(), x, y, z, ry, rx));
    if (edge) this.edges.push(place3(new THREE.EdgesGeometry(geo, thr || 1), x, y, z, ry, rx));
    geo.dispose();
  }
  box(w, h, d, x, y, z, { ry = 0, layer = 'solid', edge = layer === 'solid' } = {}) { this.add(new THREE.BoxGeometry(w, h, d), layer, edge, x, y, z, ry, 0); }
  cyl(r, h, x, y, z, { r2 = r, seg = 28, layer = 'solid', edge = layer === 'solid', thr = 30, ry = 0 } = {}) { this.add(new THREE.CylinderGeometry(r2, r, h, seg), layer, edge, x, y, z, ry, 0, thr); }
  ring(s, w, h, y, layer = 'lit', ry = 0) {   // a thin square band around a footprint of size s
    const o = s / 2 - w / 2; [[0, o, s, w], [0, -o, s, w], [o, 0, w, s - 2 * w], [-o, 0, w, s - 2 * w]].forEach(([x, z, a, b]) => {
      const c = Math.cos(ry), sn = Math.sin(ry); this.box(a, h, b, x * c + z * sn, y, -x * sn + z * c, { ry, layer }); }); }
  beacon(x, y, z, s = .03) { this.beacons.push([x, y, z, s]); }
  plinth(s = .76) { this.box(s, .035, s, 0, .0175, 0); }
  merge() {
    const m = (a) => a.length ? mergeGeometries(a, false) : null;
    return { solid: m(this.solid), glass: m(this.glass), lit: m(this.lit), gold: m(this.gold), edges: m(this.edges), beacons: this.beacons, top: this.top, ringY: this.ringY, floatY: this.floatY };
  }
}
const ARCH = new Map();
function blueprint(t, L) {
  const id = t + L; if (ARCH.has(id)) return ARCH.get(id);
  const k = new Kit(), q = Math.ceil(L / 2);
  if (t === 'point') {                                         // pavilion → stacked house with mast
    k.plinth(.74); const s = .46, fl = 1 + Math.floor((L - 1) / 3), fh = .19; let y = .035;
    for (let i = 0; i < fl; i++) { k.box(s, fh, s, 0, y + fh / 2, 0); k.box(s + .012, .055, s + .012, 0, y + fh * .58, 0, { layer: 'glass' }); k.ring(s + .016, .012, .006, y + fh * .58 - .032); y += fh; }
    k.ring(s, .025, .03, y + .015, 'solid');                                       // parapet
    if (L >= 3) k.box(.14, .06, .1, -.08, y + .03, .07);                             // rooftop unit
    if (L >= 4) k.box(.06, .05, .06, .12, y + .025, -.1);
    if (L >= 7) { const s2 = .3; k.box(s2, fh, s2, .05, y + fh / 2, -.04); k.box(s2 + .012, .055, s2 + .012, .05, y + fh * .58, -.04, { layer: 'glass' }); y += fh; k.ring(s2, .02, .025, y + .012, 'solid'); }
    if (L >= 9) { k.cyl(.006, .34, .05, y + .17, -.04, { seg: 6, edge: false }); k.beacon(.05, y + .35, -.04); }
    k.top = y + (L >= 9 ? .35 : .04);
  }
  else if (t === 'line') {                                     // twin towers, more bridges with each level
    k.box(.78, .035, .46, 0, .0175, 0); k.box(.62, .09, .26, 0, .08, 0); k.box(.63, .02, .27, 0, .06, 0, { layer: 'glass' });
    const h = .9 + .16 * L, w = .14, X = .17, base = .125;
    for (const sx of [-1, 1]) {
      k.box(w, h, w, sx * X, base + h / 2, 0);
      for (let y = base + .16; y < base + h - .06; y += .16) k.box(w + .012, .008, w + .012, sx * X, y, 0);          // floor bands
      k.box(.012, h - .16, .03, sx * (X + w / 2 + .002), base + h / 2, 0, { layer: 'lit' });                          // vertical light slit
      k.box(w - .04, .03, w - .04, sx * X, base + h + .015, 0); k.box(w - .07, .03, w - .07, sx * X, base + h + .045, 0); // stepped crown
    }
    const nb = 1 + Math.floor(L / 3);
    for (let i = 0; i < nb; i++) { const y = base + h * (1 - (i + .5) / (nb + .5)); k.box(2 * X - w, .05, .08, 0, y, 0); k.box(2 * X - w, .008, .06, 0, y - .03, 0, { layer: 'lit' }); }
    if (L >= 6) { k.cyl(.005, .4, X, base + h + .26, 0, { seg: 6, edge: false }); k.beacon(X, base + h + .47, 0); }
    k.top = base + h + (L >= 6 ? .47 : .06);
  }
  else if (t === 'terrace') {                                  // ziggurat with lit coves and a crown pavilion
    k.plinth(.78); const n = 2 + Math.floor(L / 2), th = .12; let y = .035;
    for (let i = 0; i < n; i++) { const s = .72 - i * (.42 / n);
      k.box(s, th, s, 0, y + th / 2, 0); k.box(s + .01, .03, s + .01, 0, y + th * .55, 0, { layer: 'glass' });
      y += th; if (i < n - 1) { const s2 = .72 - (i + 1) * (.42 / n); k.ring((s + s2) / 2, .012, .006, y + .003); }      // light cove on each step
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) k.box(.014, .03, .014, cx * (s / 2 - .02), y + .015, cz * (s / 2 - .02)); }
    if (L >= 4) { const ps = .72 - (n - 1) * (.42 / n) - .06;
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) k.box(.02, .14, .02, cx * ps / 2, y + .07, cz * ps / 2);
      k.box(ps + .05, .025, ps + .05, 0, y + .152, 0); y += .165; }
    k.top = y;
  }
  else if (t === 'orbit') {                                    // observatory: buttressed shaft, deck, geodesic dome
    k.plinth(.72); k.cyl(.2, .05, 0, .06, 0, { seg: 40 });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; k.box(.035, .26, .17, Math.sin(a) * .13, .2, Math.cos(a) * .13, { ry: a }); }
    const h = .8 + .12 * L, r = .095, b = .085;
    k.cyl(r, h, 0, b + h / 2, 0, { seg: 36 });
    for (let y = b + .2; y < b + h - .1; y += .2) k.cyl(r + .008, .012, 0, y, 0, { seg: 36 });
    k.box(.012, h - .24, .02, r + .002, b + h / 2, 0, { layer: 'lit' });
    const dy = b + h * .78; k.cyl(.21, .035, 0, dy, 0, { seg: 44 }); k.cyl(.212, .008, 0, dy - .024, 0, { seg: 44, layer: 'lit' });
    k.add(new THREE.SphereGeometry(.12, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), 'solid', true, 0, b + h, 0, 0, 0, 20);   // dome
    k.box(.24, .01, .016, 0, b + h + .06, 0, { layer: 'lit', ry: .6 });                                                  // dome slit
    k.cyl(.004, .3, 0, b + h + .27, 0, { seg: 6, edge: false }); k.beacon(0, b + h + .43, 0);
    k.top = b + h + .43; k.ringY = dy;
  }
  else if (t === 'spiral') {                                   // twisting tower around a core, a lit underside per floor
    k.plinth(.74); const n = 4 + L, step = .11, a = 12 * Math.PI / 180;
    k.cyl(.065, n * step + .08, 0, .035 + (n * step + .08) / 2, 0, { seg: 20 });
    for (let i = 0; i < n; i++) { const y = .1 + i * step;
      k.box(.46, .045, .46, 0, y, 0, { ry: i * a }); k.box(.44, .008, .44, 0, y - .03, 0, { ry: i * a, layer: 'lit' }); }
    const y = .1 + n * step; k.cyl(.08, .26, 0, y + .1, 0, { r2: 0, seg: 4, ry: Math.PI / 4 }); k.beacon(0, y + .25, 0, .025);
    k.top = y + .25;
  }
  else if (t === 'monolith') {                                 // stepped base, slab with gold seams, a floating cube
    [.76, .6, .46].forEach((s, i) => k.box(s, .035, s, 0, .0175 + i * .035, 0));
    const h = 1.6 + .2 * L, w = .3, b = .105;
    k.box(w, h, w, 0, b + h / 2, 0);
    for (const [x, z, ry] of [[w / 2 + .002, 0, 0], [-w / 2 - .002, 0, 0], [0, w / 2 + .002, Math.PI / 2], [0, -w / 2 - .002, Math.PI / 2]]) k.box(.006, h - .1, .012, x, b + h / 2, z, { ry, layer: 'gold' });
    for (let y = b + .6; y < b + h - .2; y += .6) k.ring(w + .008, .006, .006, y, 'gold');
    k.top = b + h + .32; k.floatY = b + h + .2;
  }
  const bp = k.merge(); ARCH.set(id, bp); return bp;
}
const rotFor = (x, y) => (((x * 7 + y * 13) % 4 + 4) % 4) * Math.PI / 2;

function makeBuilding(t, L) {
  const g = new THREE.Group(), gold = L >= MAXL || t === 'monolith', q = Math.ceil(L / 2), bp = blueprint(t, L);
  const edge = new THREE.LineBasicMaterial({ color: gold ? GOLD : IV, transparent: true, opacity: gold ? .85 : .42 });
  const lite = new THREE.MeshBasicMaterial({ color: gold ? GOLD : IV, transparent: true, opacity: 1 });
  g.userData = { edge, lite, spin: [], top: bp.top, gold };
  if (bp.solid) g.add(new THREE.Mesh(bp.solid, blkMat));
  if (bp.glass) g.add(new THREE.Mesh(bp.glass, glassMat));
  if (bp.lit) g.add(new THREE.Mesh(bp.lit, L >= MAXL ? litGoldMat : litMat));
  if (bp.gold) g.add(new THREE.Mesh(bp.gold, litGoldMat));
  if (bp.edges) g.add(new THREE.LineSegments(bp.edges, edge));
  for (const [x, y, z, s] of bp.beacons) { const c = new THREE.Mesh(boxGeo(s, s, s)[0], beaconMat); c.position.set(x, y, z); g.add(c); const gl = glow(GOLD, .5, .35); gl.position.set(x, y, z); g.add(gl); g.userData.capGlow = gl; }
  if (t === 'orbit') {                                          // orbits keep their satellites
    const nr = Math.ceil(q / 2) + (L >= MAXL ? 1 : 0);
    for (let i = 0; i < nr; i++) { const ring = new THREE.Group(); ring.position.y = bp.ringY + .05 + i * .16; ring.rotation.x = .35 + i * .45; ring.rotation.z = i * .9;
      ring.add(new THREE.LineLoop(circle(.3 + i * .05), edge)); const sat = new THREE.Mesh(boxGeo(.045, .045, .045)[0], lite); sat.position.x = .3 + i * .05; ring.add(sat);
      g.add(ring); g.userData.spin.push([ring, .6 + i * .35]); }
  }
  if (t === 'monolith') {                                       // the floating cube turns slowly above the slab
    const fc = new THREE.Group(); fc.position.y = bp.floatY; const m = new THREE.Mesh(boxGeo(.15, .15, .15)[0], blkMat); m.add(new THREE.LineSegments(boxGeo(.15, .15, .15)[1], edge)); fc.add(m);
    const gl = glow(GOLD, .9, .35); fc.add(gl); g.add(fc); g.userData.spin.push([fc, .35]); g.userData.float = fc;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.007, .007, 3, 6, 1, true), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = bp.top + 1.5; g.add(beam);
  }
  if (L >= MAXL && t !== 'monolith') { const beam = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1.4, 6, 1, true), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.y = bp.top + .75; g.add(beam); }
  return g;
}

/* ---------- live buildings ---------- */
const live = new Map();               // key -> { g, x, y, born, flash, emit }
const lotOf = new Map();              // mesh uuid -> key, for picking
function place(x, y, anim) {
  const k = key(x, y), b = S.b[k], old = live.get(k);
  if (old) { scene.remove(old.g); }
  const g = makeBuilding(b.t, b.L); g.position.copy(P(x, y, 0)); g.rotation.y = rotFor(x, y); scene.add(g);
  g.traverse((o) => { if (o.isMesh) lotOf.set(o.uuid, k); });
  live.set(k, { g, x, y, born: anim ? performance.now() : 0, grow: anim === 'build' ? 0 : anim === 'up' ? .82 : 1, flash: anim ? 1 : 0, emit: Math.random() * 2.5 });
}
function unplace(x, y) { const k = key(x, y), o = live.get(k); if (o) { scene.remove(o.g); live.delete(k); } }
for (const k in S.b) { const [x, y] = k.split(',').map(Number); place(x, y, null); }

/* ---------- the origin core at (0,0) ---------- */
const core = new THREE.Group(); scene.add(core);
const coreCube = new THREE.Mesh(new THREE.BoxGeometry(.26, .26, .26), new THREE.MeshBasicMaterial({ color: 0xffffff })); coreCube.position.y = .55; core.add(coreCube);
const corePad = new THREE.Mesh(boxGeo(.7, .05, .7)[0], blkMat); corePad.position.y = .025; corePad.add(new THREE.LineSegments(boxGeo(.7, .05, .7)[1], new THREE.LineBasicMaterial({ color: IV, transparent: true, opacity: .5 }))); core.add(corePad);
const coreGlow = glow(IV, 2.4, .8); coreGlow.position.y = .55; core.add(coreGlow);
const frames = [];
function rebuildCore() { frames.forEach((f) => core.remove(f)); frames.length = 0;
  const n = Math.min(5, Math.ceil(S.origin / 2));
  for (let i = 0; i < n; i++) { const s = .42 + i * .12, f = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-s, 0, -s), new THREE.Vector3(s, 0, -s), new THREE.Vector3(s, 0, s), new THREE.Vector3(-s, 0, s)]),
      new THREE.LineBasicMaterial({ color: i === n - 1 && S.origin >= OMAX ? GOLD : IV, transparent: true, opacity: .75 - i * .1 }));
    f.position.y = .55; f.userData.sp = (i % 2 ? -1 : 1) * (.25 + i * .12); f.rotation.x = .4 + i * .3; core.add(f); frames.push(f); } }
rebuildCore();
const coreHit = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.2, .9), new THREE.MeshBasicMaterial({ visible: false })); coreHit.position.y = .55; core.add(coreHit);

/* ---------- golden point ---------- */
const goldG = new THREE.Group(); goldG.visible = false; scene.add(goldG);
const gCube = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .2), new THREE.MeshBasicMaterial({ color: GOLD })); goldG.add(gCube);
const gGlow = glow(GOLD, 2.2, .9); goldG.add(gGlow);
const gHit = new THREE.Mesh(new THREE.SphereGeometry(.7, 8, 8), new THREE.MeshBasicMaterial({ visible: false })); goldG.add(gHit);
const gDash = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: GOLD, dashSize: .14, gapSize: .12, transparent: true, opacity: .8 })); scene.add(gDash);
const GP = { on: false, x: 0, y: 0, t: 0, life: 9, next: 22 };
function spawnGold() {
  const lots = []; for (let x = -S.R; x <= S.R; x++) for (let y = -S.R; y <= S.R; y++) if (owned(x, y)) lots.push([x, y]);
  const [x, y] = lots[Math.floor(Math.random() * lots.length)];
  Object.assign(GP, { on: true, x, y, t: 0 }); goldG.visible = true;
  const h = 1.7 + (S.b[key(x, y)] ? live.get(key(x, y))?.g.userData.top || 0 : 0);
  goldG.position.copy(P(x, y, h)); GP.h = h;
  gDash.geometry.dispose(); gDash.geometry = new THREE.BufferGeometry().setFromPoints([P(x, y, h - .12), P(x, y, .02), P(x, y, .02), P(x, 0, .02), P(x, y, .02), P(0, y, .02)]); gDash.computeLineDistances(); gDash.visible = true;
  pulse(x, y, GOLD, 1.6, 1.4, .9); sfx('gold');
}
function catchGold() {
  if (!GP.on) return; GP.on = false; goldG.visible = gDash.visible = false; S.golds++;
  const inc = income();
  if (Math.random() < .4 && inc > 0) { S.boost = Math.max(Date.now(), S.boost) + 20000; toast('GOLDEN HOUR · ×3 INCOME · 20 S', true); }
  else { const r = Math.max(.002, inc * 60); earn(r); toast(`GOLDEN POINT ${coord(GP.x, GP.y)} · +${fmt(r)} Ø`, true); popAt(P(GP.x, GP.y, GP.h), '+' + fmt(r), true); }
  pulse(GP.x, GP.y, GOLD, 2.6, 1.6, 1); burst(P(GP.x, GP.y, GP.h), 22, true); sfx('catch'); GP.next = 35 + Math.random() * 45;
}

/* ---------- coins: small gold squares rising from the city ---------- */
const coinGeo = new THREE.PlaneGeometry(.06, .06), coinMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const coins = [];
function coin(pos, vel, life, color) {
  let c = coins.find((c) => !c.on); if (!c) { if (coins.length > 220) return; const m = new THREE.Mesh(coinGeo, coinMat.clone()); scene.add(m); c = { m }; coins.push(c); }
  Object.assign(c, { on: true, t: 0, life, v: vel.clone() }); c.m.position.copy(pos); c.m.visible = true; c.m.material.color.set(color || GOLD); c.m.rotation.z = Math.random() * 3;
}
function burst(pos, n, gold) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = .6 + Math.random() * 1.4; coin(pos, new THREE.Vector3(Math.cos(a) * s, 1 + Math.random() * 2.2, Math.sin(a) * s), .8 + Math.random() * .6, gold ? GOLD : IV); } }

/* =====================================================================================================
   CAMERA
   ===================================================================================================== */
const CAM = { yaw: -.62, yawT: -.62, tilt: .98, tiltT: .98, zoom: 1, zoomT: 1, d: 0, fx: 0, fy: 0, fxT: 0, fyT: 0, intro: S.seen ? 1 : 0, idle: 0, off: 0 };
const baseDist = () => 6.5 + landR * 2.35;
function placeCam(dt) {
  const k = 1 - Math.exp(-dt * 6); CAM.yaw += (CAM.yawT - CAM.yaw) * k; CAM.tilt += (CAM.tiltT - CAM.tilt) * k; CAM.zoom += (CAM.zoomT - CAM.zoom) * k;
  CAM.fx += (CAM.fxT - CAM.fx) * (1 - Math.exp(-dt * 2.5)); CAM.fy += (CAM.fyT - CAM.fy) * (1 - Math.exp(-dt * 2.5));
  const narrow = cam.aspect < 1 ? Math.pow(1 / cam.aspect, .8) : 1;          // portrait screens: step back so the plane fits
  const I = o3(CAM.intro), d = baseDist() * CAM.zoom * narrow * lerp(2.4, 1, I), tilt = lerp(1.5, CAM.tilt, I), yaw = CAM.yaw + (1 - I) * .9;
  const tx = CAM.fx, ty = CAM.fy, h = d * Math.cos(tilt);
  cam.position.set(tx + h * Math.sin(yaw), d * Math.sin(tilt), -ty + h * Math.cos(yaw)); cam.lookAt(tx, 0, -ty);
  // on phones the card covers the lower half: lift the picture so the selected point stays visible
  CAM.off += ((innerWidth < 760 && !ui.card.hidden ? .2 : 0) - CAM.off) * (1 - Math.exp(-dt * 5));
  if (CAM.off > .002) cam.setViewOffset(innerWidth, innerHeight, 0, innerHeight * CAM.off, innerWidth, innerHeight); else cam.clearViewOffset();
}

/* =====================================================================================================
   AUDIO — quiet, off by default (like the site)
   ===================================================================================================== */
let ac = null, master = null;
function audio() { if (ac) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } master = ac.createGain(); master.gain.value = .5; master.connect(ac.destination); }
function tone(f, t0, dur, type = 'sine', vol = .14) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + .012); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + .05); }
function sfx(kind) {
  if (!S.sound || !ac) return; const t = ac.currentTime;
  if (kind === 'tap') tone(880 + Math.min(S.combo || 0, 24) * 22, t, .09, 'triangle', .06);
  else if (kind === 'build') { tone(110, t, .5, 'sine', .22); tone(440, t + .05, .5, 'triangle', .07); tone(660, t + .12, .6, 'sine', .05); }
  else if (kind === 'up') [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * .07, .45, 'triangle', .06));
  else if (kind === 'gold') [1318, 1760].forEach((f, i) => tone(f, t + i * .1, .9, 'sine', .05));
  else if (kind === 'catch') [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, t + i * .05, .8, 'sine', .06));
  else if (kind === 'no') tone(150, t, .18, 'square', .03);
  else if (kind === 'goal') [392, 523, 659, 784].forEach((f, i) => tone(f, t + i * .11, 1.1, 'sine', .07));
}

/* =====================================================================================================
   UI
   ===================================================================================================== */
const ui = { coins: $('coins'), rate: $('rate'), dock: $('dock'), card: $('card'), goal: $('goal'), toasts: $('toasts'), pops: $('pops'), lab: $('lab'), boost: $('boost') };
let mode = null;            // building type id while placing
let sel = null;             // { x, y } selected lot (or origin)
let hover = null;
const ICON = {
  point: '<rect x="8" y="9" width="8" height="8"/><path d="M8 9 12 6.5 16 9"/>',
  line: '<path d="M8 19V7M16 19V7M6.5 7h11"/>',
  terrace: '<path d="M5 19h14M6.5 15.5h11M8 12h8M9.5 8.5h5"/>',
  orbit: '<path d="M12 19V6"/><ellipse cx="12" cy="11" rx="7" ry="2.6"/>',
  spiral: '<path d="M7 18h10M7.6 15.2l9.6-1.6M8.6 12.6l8.4-3M10 10.2l6.8-4.2"/>',
  monolith: '<rect x="9.5" y="4" width="5" height="15"/><path d="M6 19h12"/>',
};
const svg = (id, gold) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="${gold ? '#DEB86C' : '#F0ECE2'}" stroke-width="1.1" aria-hidden="true">${ICON[id]}</svg>`;
function renderDock() {
  ui.dock.innerHTML = TYPES.map((T, i) => { const u = unlocked(i), c = buildCost(T.id);
    return `<button class="bt${mode === T.id ? ' on' : ''}${u ? '' : ' locked'}" data-t="${T.id}" ${u ? '' : 'aria-disabled="true"'} aria-label="${u ? T.name + ', costs ' + fmt(c) + ' Ø' : 'Locked'}">
      ${svg(T.id, T.id === 'monolith')}<span class="nm">${u ? T.name : 'Locked'}</span><span class="cs" data-c="${c}">${u ? fmt(c) + ' Ø' : '· · ·'}</span><span class="kb">${i + 1}</span></button>`; }).join('')
    + (S.R < RMAX ? `<button class="bt ex" data-x="1" aria-label="Expand the plane"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#DEB86C" stroke-width="1.1" aria-hidden="true"><path d="M8 8h8v8H8z" stroke-dasharray="2 2"/><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/></svg><span class="nm">Expand · ${2 * S.R + 3}×${2 * S.R + 3}</span><span class="cs" data-c="${EXPAND[S.R]}">${fmt(EXPAND[S.R])} Ø</span></button>` : '');
  ui.dock.querySelectorAll('.bt').forEach((b) => b.onclick = () => { if (b.dataset.x) return expand(); if (b.classList.contains('locked')) { sfx('no'); toast('EARN MORE Ø TO UNLOCK'); return; } setMode(mode === b.dataset.t ? null : b.dataset.t); });
  affordDock();
}
function affordDock() { ui.dock.querySelectorAll('.cs[data-c]').forEach((s) => s.parentElement.classList.toggle('poor', S.coins < +s.dataset.c)); }
function setMode(t) { mode = t; renderDock(); document.body.classList.toggle('placing', !!t); if (t) { closeCard(); toast(`PLACE A ${TYPE[t].name.toUpperCase()} · TAP A FREE POINT`); } updateGhost(); }

function openCard(x, y) {
  sel = { x, y }; CAM.fxT = x * .35; CAM.fyT = y * .35;
  const k = key(x, y), b = S.b[k];
  let h = `<button class="x" type="button" aria-label="Close">✕</button><div class="c">${coord(x, y)}</div>`;
  if (x === 0 && y === 0) {
    const oc = originCost();
    h += `<div class="row"><span class="st live">ORIGIN</span><span class="lv">${lvl(S.origin, OMAX)}</span></div><h3>Nullorigo</h3><p>Everything starts here. Tap the origin to draw Ø from zero. Fast taps build a combo.</p>
      <div class="kv"><span>Per tap</span><b>${fmt(tapBase())} Ø</b></div><div class="kv"><span>Fast taps</span><b>up to ×2</b></div>
      ${S.origin < OMAX ? `<button class="go" type="button" data-a="origin" ${S.coins < oc ? 'disabled' : ''}>Strengthen origin · ${fmt(oc)} Ø<small>×1.5 per tap</small></button>` : '<div class="mx">Origin at full strength</div>'}`;
  } else if (b) {
    const T = TYPE[b.t], inc = incomeOf(b, x, y) * (boostOn() ? 3 : 1);
    h += `<div class="row"><span class="st${b.L >= MAXL ? ' gold' : ''}">${T.name.toUpperCase()}</span><span class="lv">${lvl(b.L, MAXL)}</span></div><h3>${T.name} · level ${b.L}</h3><p>${T.desc}</p>
      <div class="kv"><span>Income</span><b>${fmt(inc)} Ø/s</b></div><div class="kv"><span>Origin bonus</span><b>×${prox(x, y).toFixed(2)}</b></div>`;
    if (b.L < MAXL) { const uc = upCost(b), nx = { ...b, L: b.L + 1 }; h += `<button class="go" type="button" data-a="up" ${S.coins < uc ? 'disabled' : ''}>Upgrade → level ${b.L + 1} · ${fmt(uc)} Ø<small>+${fmt(incomeOf(nx, x, y) - incomeOf(b, x, y))} Ø/s</small></button>`; }
    else h += `<div class="mx">Maximum level · edged in gold</div>`;
    h += `<button class="sell" type="button" data-a="sell">Sell · +${fmt(b.spent * .4)} Ø</button>`;
  } else if (owned(x, y)) {
    h += `<div class="row"><span class="st">FREE</span></div><h3>An empty point.</h3><p>Choose a structure below and tap here to build. Closer to (0,0) earns more: ×${prox(x, y).toFixed(2)}.</p>`;
  } else {
    h += `<div class="row"><span class="st">OUTSIDE</span></div><h3>Beyond your plane.</h3><p>Expand the plane to build here.</p>` + (S.R < RMAX ? `<button class="go" type="button" data-a="expand" ${S.coins < EXPAND[S.R] ? 'disabled' : ''}>Expand · ${fmt(EXPAND[S.R])} Ø</button>` : '');
  }
  ui.card.innerHTML = h; ui.card.hidden = false;
  ui.card.querySelector('.x').onclick = closeCard;
  ui.card.querySelectorAll('[data-a]').forEach((btn) => btn.onclick = () => act(btn.dataset.a, x, y, btn));
  setReticle(x, y);
}
const lvl = (L, M) => `<i class="lvb">${Array.from({ length: M }, (_, i) => `<b class="${i < L ? 'f' : ''}${L >= M ? ' g' : ''}"></b>`).join('')}</i>`;
function closeCard() { ui.card.hidden = true; sel = null; CAM.fxT = CAM.fyT = 0; setReticle(null); }
function refreshCard() { if (sel && !ui.card.hidden) { const f = document.activeElement && ui.card.contains(document.activeElement) ? document.activeElement.dataset.a : null; openCard(sel.x, sel.y); if (f) ui.card.querySelector(`[data-a="${f}"]`)?.focus(); } }

function act(a, x, y, btn) {
  const k = key(x, y), b = S.b[k];
  if (a === 'up' && b && b.L < MAXL) { const c = upCost(b); if (S.coins < c) return sfx('no'); S.coins -= c; b.spent += c; b.L++; place(x, y, 'up'); pulse(x, y, b.L >= MAXL ? GOLD : IV, 1.4, 1, .8); burst(P(x, y, live.get(k).g.userData.top), 10, b.L >= MAXL); sfx('up'); if (b.L >= MAXL) toast(`${TYPE[b.t].name.toUpperCase()} ${coord(x, y)} · EDGED IN GOLD`, true); }
  else if (a === 'sell' && b) { if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = 'Tap again to sell'; return; } S.coins += b.spent * .4; delete S.b[k];   // a refund, not new earnings
    unplace(x, y); rebuildCorners(); pulse(x, y, IV, 1, .8, .5); sfx('no'); }
  else if (a === 'origin') { const c = originCost(); if (S.origin >= OMAX || S.coins < c) return sfx('no'); S.coins -= c; S.origin++; rebuildCore(); pulse(0, 0, GOLD, 2.4, 1.3, .9); burst(P(0, 0, .55), 18, true); sfx('up'); }
  else if (a === 'expand') return expand();
  save(); renderDock(); refreshCard();
}
function build(x, y) {
  const t = mode, c = buildCost(t);
  if (!owned(x, y) || S.b[key(x, y)]) return sfx('no');
  if (S.coins < c) { sfx('no'); toast(`NEED ${fmt(c - S.coins)} Ø MORE`); return; }
  S.coins -= c; S.b[key(x, y)] = { t, L: 1, spent: c }; place(x, y, 'build'); rebuildCorners();
  pulse(x, y, IV, 1.3, 1, .9); pulse(x, y, IV, .7, .7, .6); sfx('build'); save(); renderDock();
  if (S.coins < buildCost(t)) setMode(null); else updateGhost();
}
function expand() {
  if (S.R >= RMAX) return; const c = EXPAND[S.R];
  if (S.coins < c) { sfx('no'); toast(`EXPANSION NEEDS ${fmt(c)} Ø`); return; }
  S.coins -= c; S.R++; rebuildLand(); pulse(0, 0, GOLD, S.R + 1, 1.8, .8); sfx('goal'); toast(`THE PLANE GROWS · ${2 * S.R + 1} × ${2 * S.R + 1}`, true); save(); renderDock(); if (sel) refreshCard();
}
let combo = 0, comboT = 0;
function tapOrigin(sx, sy) {
  combo = performance.now() - comboT < 650 ? Math.min(combo + 1, 30) : 0; comboT = performance.now(); S.combo = combo;
  const g = tapBase() * (1 + combo * .035); earn(g); S.taps++;
  coreCube.scale.setScalar(1.35); pulse(0, 0, combo > 12 ? GOLD : IV, .9 + combo * .03, .6, .7); burst(P(0, 0, .6), 3 + Math.min(6, combo >> 2), combo > 12);
  popScreen(sx, sy, '+' + fmt(g) + (combo > 2 ? `<em>×${(1 + combo * .035).toFixed(2)}</em>` : ''), combo > 12); sfx('tap');
  if (sel && sel.x === 0 && sel.y === 0) refreshCardSoon();
}
let cardT = 0; function refreshCardSoon() { clearTimeout(cardT); cardT = setTimeout(refreshCard, 120); }

/* ---------- reticle (site style: ring + dashed lines to both axes) ---------- */
const ret = new THREE.Group(); ret.visible = false; scene.add(ret);
const retRing = new THREE.Mesh(new THREE.RingGeometry(.44, .47, 64), new THREE.MeshBasicMaterial({ color: IV, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false })); retRing.rotation.x = -Math.PI / 2; retRing.position.y = .015; ret.add(retRing);
const retDash = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: IV, dashSize: .16, gapSize: .13, transparent: true, opacity: .5 })); scene.add(retDash);
function setReticle(x, y) {
  if (x === null) { ret.visible = retDash.visible = false; ui.lab.hidden = true; return; }
  ret.visible = retDash.visible = true; ret.position.copy(P(x, y, 0));
  retDash.geometry.dispose(); retDash.geometry = new THREE.BufferGeometry().setFromPoints([P(x, y, .015), P(x, 0, .015), P(x, y, .015), P(0, y, .015)]); retDash.computeLineDistances();
  ui.lab.hidden = false; ui.lab.textContent = coord(x, y); ui.lab.dataset.x = x; ui.lab.dataset.y = y;
}
/* ---------- ghost while placing ---------- */
let ghost = null;
function updateGhost() {
  if (ghost) { scene.remove(ghost); ghost = null; }
  if (!mode || !hover || !owned(hover.x, hover.y) || S.b[key(hover.x, hover.y)]) return;
  ghost = makeBuilding(mode, 1); ghost.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: IV, transparent: true, opacity: .07, depthWrite: false }); } if (o.isLineSegments || o.isLineLoop) { o.material = o.material.clone(); o.material.opacity = .5; } });
  ghost.position.copy(P(hover.x, hover.y, 0)); ghost.rotation.y = rotFor(hover.x, hover.y); scene.add(ghost);
}

/* ---------- toasts, pop numbers, goal ---------- */
function toast(t, gold) { const d = document.createElement('div'); d.className = 'toast' + (gold ? ' g' : ''); d.textContent = t; ui.toasts.prepend(d); while (ui.toasts.children.length > 3) ui.toasts.lastChild.remove(); setTimeout(() => d.classList.add('out'), 2600); setTimeout(() => d.remove(), 3300); }
function popScreen(x, y, html, gold) { const d = document.createElement('div'); d.className = 'pop' + (gold ? ' g' : ''); d.innerHTML = html; d.style.left = x + 'px'; d.style.top = y + 'px'; ui.pops.appendChild(d); setTimeout(() => d.remove(), 1100); }
const _v = new THREE.Vector3();
function toScreen(v) { _v.copy(v).project(cam); return [(_v.x + 1) / 2 * innerWidth, (1 - _v.y) / 2 * innerHeight, _v.z < 1]; }
function popAt(v, html, gold) { const [x, y] = toScreen(v); popScreen(x, y, html, gold); }
function renderGoal() {
  if (S.goal >= GOALS.length) { ui.goal.innerHTML = `<div class="gt">ALL GOALS</div><div class="gx">Everything starts at (0,0).</div>`; return; }
  const G = GOALS[S.goal], [c, n] = G.p(), f = cl(c / n);
  ui.goal.innerHTML = `<div class="gt">GOAL ${String(S.goal + 1).padStart(2, '0')} / ${GOALS.length}</div><div class="gx">${G.t}</div><div class="gb"><i style="transform:scaleX(${f})"></i></div><div class="gr"><span>${Number.isInteger(n) && n <= 1000 ? Math.min(Math.floor(c), n) + ' / ' + n : fmt(Math.min(c, n)) + ' / ' + fmt(n)}</span><span>REWARD ${fmt(G.r)} Ø</span></div>`;
  if (c >= n) { earn(G.r); toast(`GOAL COMPLETE · ${G.t.toUpperCase()} · +${fmt(G.r)} Ø`, true); sfx('goal'); S.goal++; save(); setTimeout(renderGoal, 50); }
}

/* =====================================================================================================
   INPUT — drag to turn, wheel / pinch to zoom, tap to build or open
   ===================================================================================================== */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function pick(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
  if (GP.on && ray.intersectObject(gHit, false).length) return { gold: true };
  if (ray.intersectObject(coreHit, false).length) return { x: 0, y: 0 };
  const hs = ray.intersectObjects([...live.values()].map((o) => o.g), true).filter((h) => lotOf.has(h.object.uuid));
  if (hs.length) { const [x, y] = lotOf.get(hs[0].object.uuid).split(',').map(Number); return { x, y }; }
  if (ray.ray.intersectPlane(plane, hit)) { const x = Math.round(hit.x), y = Math.round(-hit.z); if (Math.max(Math.abs(x), Math.abs(y)) <= RMAX + 2) return { x, y }; }
  return null;
}
const ptr = new Map(); let drag = null, pinch = null;
canvas.addEventListener('pointerdown', (e) => {
  audio(); canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); CAM.idle = 0;
  if (ptr.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
  else if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: CAM.zoomT }; drag = null; }
});
canvas.addEventListener('pointermove', (e) => {
  if (ptr.has(e.pointerId)) ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptr.size === 2) { const [a, b] = [...ptr.values()]; CAM.zoomT = cl(pinch.z * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), .45, 1.7); return; }
  if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 7) drag.moved = true;
    if (drag.moved) { CAM.yawT -= dx * .006; CAM.tiltT = cl(CAM.tiltT + dy * .004, .62, 1.38); drag.x = e.clientX; drag.y = e.clientY; } return; }
  if (e.pointerType === 'mouse') { const p = pick(e.clientX, e.clientY), h = p && !p.gold ? p : null;
    if ((h && (!hover || h.x !== hover.x || h.y !== hover.y)) || (!h && hover)) { hover = h; updateGhost(); }
    canvas.style.cursor = p && (p.gold || (p.x === 0 && p.y === 0) || S.b[key(p.x, p.y)] || (mode && owned(p.x, p.y))) ? 'pointer' : 'grab'; }
});
function up(e) {
  const wasTap = drag && !drag.moved && ptr.size === 1; ptr.delete(e.pointerId); if (ptr.size < 2) pinch = null; if (!ptr.size) drag = null;
  if (!wasTap) return; const p = pick(e.clientX, e.clientY); if (!p) { if (!mode) closeCard(); return; }
  if (p.gold) return catchGold();
  if (p.x === 0 && p.y === 0) { tapOrigin(e.clientX, e.clientY); if (!sel || sel.x || sel.y) openCard(0, 0); return; }
  if (mode) { if (owned(p.x, p.y) && !S.b[key(p.x, p.y)]) { hover = p; build(p.x, p.y); } else if (S.b[key(p.x, p.y)]) { setMode(null); openCard(p.x, p.y); } else { sfx('no'); toast(owned(p.x, p.y) ? 'TAKEN' : 'OUTSIDE YOUR PLANE · EXPAND TO BUILD HERE'); } return; }
  openCard(p.x, p.y);
}
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', (e) => { ptr.delete(e.pointerId); drag = pinch = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); CAM.zoomT = cl(CAM.zoomT * Math.exp(e.deltaY * .0012), .45, 1.7); CAM.idle = 0; }, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') { if (mode) setMode(null); else if (!$('menu').hidden) $('menu').hidden = true; else closeCard(); }
  const n = +e.key; if (n >= 1 && n <= TYPES.length && unlocked(n - 1)) setMode(mode === TYPES[n - 1].id ? null : TYPES[n - 1].id);
  if ((e.key === 'u' || e.key === 'U') && sel && S.b[key(sel.x, sel.y)]) act('up', sel.x, sel.y);
  if (e.key === ' ' && e.target === document.body) { e.preventDefault(); const [x, y] = toScreen(P(0, 0, .55)); tapOrigin(x, y); }
});

/* ---------- menu / sound / intro / welcome back ---------- */
const sb = $('sound'); const setSound = (on) => { S.sound = on; sb.setAttribute('aria-pressed', on); sb.querySelector('span').textContent = on ? 'Sound on' : 'Sound off'; if (on) { audio(); ac.resume(); } save(); };
sb.onclick = () => setSound(!S.sound); setSound(S.sound);
$('menub').onclick = () => { $('menu').hidden = !$('menu').hidden; };
$('mclose').onclick = () => { $('menu').hidden = true; };
$('reset').onclick = (e) => { const b = e.currentTarget; if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again · erase everything'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'Reset progress'; }, 3000); return; }
  try { localStorage.removeItem(SAVE); } catch (_) {} location.reload(); };
// the intro button is wired by a tiny inline script too, so it answers even before this module has loaded
function start() { if (started) return; started = true; S.seen = true; audio(); save(); const i = $('intro'); if (i) { i.classList.add('out'); setTimeout(() => i.remove(), 900); } }
if (S.seen) $('intro')?.remove(); else { document.addEventListener('arcade:start', start); if (window.__arcadeStart) start(); }
{ // earnings while away: half rate, up to two hours
  const away = Math.min(86400, (Date.now() - S.t) / 1000), inc = income() / (boostOn() ? 3 : 1), g = inc * away * .5;
  if (S.seen && away > 30 && g >= .0001) { $('wbv').textContent = '+' + fmt(g) + ' Ø'; $('wbt').textContent = (away >= 5400 ? `${(away / 3600).toFixed(1)} h` : `${Math.floor(away / 60)} min`) + ' on the plane while you were away · half rate, up to a day'; $('welcome').hidden = false;
    $('wbc').onclick = () => { earn(g); $('welcome').hidden = true; burst(P(0, 0, .6), 30, true); sfx('catch'); save(); }; }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else last = performance.now(); });
setInterval(save, 4000);

/* =====================================================================================================
   LOOP
   ===================================================================================================== */
let last = performance.now(), tick = 0, shownCoins = S.coins;
renderDock(); renderGoal();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const T = now / 1000;
  // economy
  const inc = income(); earn(inc * dt);
  tick += dt; if (tick > .25) { tick = 0; affordDock(); renderGoal(); ui.rate.textContent = '+' + fmt(inc) + ' Ø/s'; ui.boost.hidden = !boostOn(); if (boostOn()) ui.boost.textContent = `×3 · ${Math.ceil((S.boost - Date.now()) / 1000)} S`;
    if (sel && !ui.card.hidden) refreshButtons(); }
  shownCoins += (S.coins - shownCoins) * (1 - Math.exp(-dt * 10)); if (Math.abs(S.coins - shownCoins) < .5) shownCoins = S.coins; ui.coins.textContent = fmt(shownCoins);
  // camera
  if (CAM.intro < 1) CAM.intro = Math.min(1, CAM.intro + dt / (reduce ? .01 : 3.2) * (started ? 1 : 0));
  CAM.idle += dt; if (CAM.idle > 10 && !reduce) CAM.yawT -= dt * .025;
  landR += (S.R - landR) * (1 - Math.exp(-dt * 2.2)); drawBorder(landR);
  placeCam(dt);
  // buildings: growth, flash, coins
  live.forEach((o) => {
    if (o.grow < 1) { o.grow = Math.min(1, o.grow + dt / .85); o.g.scale.y = Math.max(.001, back(o.grow)); }
    if (o.flash > 0) { o.flash = Math.max(0, o.flash - dt / 1.1); const c = o.g.userData.edge.color; c.set(o.g.userData.gold ? GOLD : IV).lerp(new THREE.Color(GOLD), o.flash); o.g.userData.edge.opacity = lerp(o.g.userData.gold ? .9 : .5, 1, o.flash); }
    o.g.userData.spin.forEach(([r, s]) => r.rotation.y += dt * s);
    if (o.g.userData.capGlow) o.g.userData.capGlow.material.opacity = .22 + .14 * Math.max(0, Math.sin(T * 2.4 + o.x * 1.7 + o.y));
    if (o.g.userData.float) o.g.userData.float.position.y = o.g.userData.top - .12 + Math.sin(T * 1.3 + o.x) * .03;
    o.emit -= dt; if (o.emit < 0) { o.emit = 2.2 + Math.random() * 2.4; coin(P(o.x + (Math.random() - .5) * .3, o.y + (Math.random() - .5) * .3, o.g.userData.top + .1), new THREE.Vector3(0, .55 + Math.random() * .3, 0), 1.6); }
  });
  // origin core
  coreCube.scale.setScalar(lerp(coreCube.scale.x, 1, 1 - Math.exp(-dt * 10))); coreCube.rotation.y += dt * .5; coreCube.position.y = .55 + Math.sin(T * 1.6) * .03;
  coreGlow.material.opacity = .65 + .2 * Math.sin(T * 2.2) + Math.min(.4, combo * .02); frames.forEach((f) => { f.rotation.y += dt * f.userData.sp; f.position.y = coreCube.position.y; });
  if (performance.now() - comboT > 900) combo = 0;
  // golden point
  if (CAM.intro >= 1) { if (!GP.on) { GP.next -= dt; if (GP.next < 0) spawnGold(); } else { GP.t += dt; const fade = cl((GP.life - GP.t) / 1.5);
    gCube.rotation.y += dt * 1.6; gCube.rotation.x += dt * .7; goldG.position.y = GP.h + Math.sin(T * 3) * .06; gGlow.material.opacity = (.7 + .25 * Math.sin(T * 6)) * fade; gCube.material.opacity = fade; gCube.material.transparent = true; gDash.material.opacity = .8 * fade;
    if (GP.t > GP.life) { GP.on = false; goldG.visible = gDash.visible = false; GP.next = 30 + Math.random() * 40; } } }
  // particles + pulses
  coins.forEach((c) => { if (!c.on) return; c.t += dt; if (c.t > c.life) { c.on = false; c.m.visible = false; return; } c.v.y -= dt * 1.4 * (c.v.length() > 1 ? 1 : 0); c.m.position.addScaledVector(c.v, dt); c.m.quaternion.copy(cam.quaternion); c.m.material.opacity = Math.sin(Math.PI * c.t / c.life) * .95; });
  for (let i = pulses.length - 1; i >= 0; i--) { const p = pulses[i]; p.t += dt / p.life; if (p.t >= 1) { scene.remove(p.m); p.m.material.dispose(); pulses.splice(i, 1); continue; } p.m.scale.setScalar(.2 + o3(p.t) * p.size); p.m.material.opacity = p.op * (1 - p.t); }
  retRing.scale.setScalar(1 + .06 * Math.sin(T * 3));
  // coordinate label follows the reticle
  if (!ui.lab.hidden) { const [x, y] = toScreen(P(+ui.lab.dataset.x, +ui.lab.dataset.y, 0)); ui.lab.style.transform = `translate(${x + 16}px, ${y - 30}px)`; }
  if (comp) { bloom.strength = .4 + (GP.on ? .1 : 0) + (boostOn() ? .12 : 0); comp.render(); } else renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
function refreshButtons() { // enable / disable card buttons live as Ø comes in
  if (!sel) return; const b = S.b[key(sel.x, sel.y)];
  const go = ui.card.querySelector('button.go'); if (!go) return;
  const need = go.dataset.a === 'up' && b ? upCost(b) : go.dataset.a === 'origin' ? originCost() : go.dataset.a === 'expand' ? EXPAND[S.R] : 0;
  go.disabled = S.coins < need;
}
document.documentElement.classList.add('ready');
requestAnimationFrame(frame);

/* test hooks (harmless in production) */
window.__arcade = { info: () => { let n = 0, tri = 0; scene.traverseVisible((o) => { if (o.isMesh || o.isLine || o.isPoints || o.isSprite) { n++; if (o.isMesh && o.geometry.index) tri += o.geometry.index.count / 3; } }); return { drawObjects: n, triangles: Math.round(tri) }; }, screen: (x, y, h = 0) => toScreen(P(x, y, h)), S, act, build: (x, y, t) => { mode = t; build(x, y); }, expand, earn, spawnGold, catchGold, openCard, setMode, income };
