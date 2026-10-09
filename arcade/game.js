/* Nullorigo · ARCADE — at (−7, −7).
   Build on the plane, earn Ø, upgrade, expand. Everything starts at (0,0).
   World convention (same as nullorigo.com): plane point (x, y) -> three.js (x, height, −y). */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toLocaleString('en-US');
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx']; let i = -1; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n)) + u[i];
}

/* =====================================================================================================
   RULES
   ===================================================================================================== */
const TYPES = [
  { id: 'point',    name: 'Point',    cost: 15,     inc: .38,  desc: 'A single square. Every city begins with one.' },
  { id: 'line',     name: 'Line',     cost: 160,    inc: 2,  desc: 'Two pillars and a bridge. The first distance.' },
  { id: 'terrace',  name: 'Terrace',  cost: 1200,   inc: 7.6,   desc: 'Rings of stone stepping up toward the light.' },
  { id: 'orbit',    name: 'Orbit',    cost: 9000,   inc: 27,   desc: 'A tower that keeps its own satellites.' },
  { id: 'spiral',   name: 'Spiral',   cost: 70000,  inc: 110,  desc: 'Every floor turns a little. Golden angle, slowly.' },
  { id: 'monolith', name: 'Monolith', cost: 600000, inc: 450, desc: 'Black, exact, edged in gold. Rare on any plane.' },
];
const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));
const MAXL = 5, RMAX = 7, RMIN = 2;
const EXPAND = { 2: 300, 3: 6000, 4: 1.5e5, 5: 4e6, 6: 1.2e8 };   // paced by simulation: Orbit ≈ 13 min, Monolith ≈ 1 h, full plane ≈ 5 h of play
const prox = (x, y) => 1 + .6 / Math.max(1, Math.max(Math.abs(x), Math.abs(y)));          // closer to (0,0) earns more
const incomeOf = (b, x, y) => TYPE[b.t].inc * Math.pow(1.85, b.L - 1) * prox(x, y);
const upCost = (b) => TYPE[b.t].cost * Math.pow(3.4, b.L);
const countOf = (t) => Object.values(S.b).filter((b) => b.t === t).length;
const buildCost = (t) => Math.round(TYPE[t].cost * Math.pow(1.15, countOf(t)));
const unlocked = (i) => i === 0 || S.best >= TYPES[i].cost * .45;
const originCost = () => 60 * Math.pow(4.2, S.origin - 1);
const tapBase = () => Math.pow(3, S.origin - 1);
const owned = (x, y) => Math.max(Math.abs(x), Math.abs(y)) <= S.R && !(x === 0 && y === 0);

const GOALS = [
  { t: 'Build a Point',                 p: () => [countOf('point'), 1], r: 20 },
  { t: 'Tap the origin 25 times',       p: () => [S.taps, 25], r: 40 },
  { t: 'Own 5 structures',              p: () => [nB(), 5], r: 120 },
  { t: 'Upgrade a structure to level 2', p: () => [maxL(), 2], r: 160 },
  { t: 'Expand the plane',              p: () => [S.R - RMIN, 1], r: 400 },
  { t: 'Catch a golden point',          p: () => [S.golds, 1], r: 600 },
  { t: 'Earn 25 Ø per second',          p: () => [income(), 25], r: 1500 },
  { t: 'Raise an Orbit',                p: () => [countOf('orbit'), 1], r: 6000 },
  { t: 'Bring a structure to level 5',  p: () => [maxL(), 5], r: 20000 },
  { t: 'Earn 500 Ø per second',         p: () => [income(), 500], r: 60000 },
  { t: 'Raise a Spiral',                p: () => [countOf('spiral'), 1], r: 120000 },
  { t: 'Own 40 structures',             p: () => [nB(), 40], r: 500000 },
  { t: 'Raise a Monolith',              p: () => [countOf('monolith'), 1], r: 2e6 },
  { t: 'Claim the whole plane',         p: () => [S.R, RMAX], r: 2e7 },
  { t: 'Earn 100K Ø per second',        p: () => [income(), 1e5], r: 1e8 },
];
const nB = () => Object.keys(S.b).length, maxL = () => Object.values(S.b).reduce((m, b) => Math.max(m, b.L), 0);

/* =====================================================================================================
   STATE (saved locally)
   ===================================================================================================== */
const SAVE = 'nullo.arcade.v1';
const fresh = () => ({ v: 1, coins: 30, life: 0, best: 30, R: RMIN, b: {}, origin: 1, taps: 0, golds: 0, goal: 0, t: Date.now(), sound: false, boost: 0, seen: false });
let S = fresh();
try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && s.v === 1) S = Object.assign(fresh(), s); } catch (e) {}
const save = () => { S.t = Date.now(); try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) {} };
const boostOn = () => S.boost > Date.now();
function income() { let s = 0; for (const k in S.b) { const [x, y] = k.split(',').map(Number); s += incomeOf(S.b[k], x, y); } return s * (boostOn() ? 3 : 1); }
function earn(n) { S.coins += n; S.life += n; S.best = Math.max(S.best, S.coins); }

/* =====================================================================================================
   RENDERER + SCENE
   ===================================================================================================== */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.6 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color(BG); scene.fog = new THREE.FogExp2(BG, .022);
const cam = new THREE.PerspectiveCamera(36, 1, .05, 400);
let comp = null, bloom = null;
if (!mobile) { comp = new EffectComposer(renderer); comp.addPass(new RenderPass(scene, cam)); bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .42, .45, .2); comp.addPass(bloom); comp.addPass(new OutputPass()); }
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); if (comp) { comp.setSize(w, h); bloom.resolution.set(w / 2, h / 2); } }
addEventListener('resize', resize); resize();
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
   ARCHITECTURE — dark metal, ivory edges, gold at level 5
   ===================================================================================================== */
const blkMat = new THREE.MeshStandardMaterial({ color: 0x121215, roughness: .5, metalness: .5, emissive: 0x050506 });
const ringMat = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: .35, metalness: .7, emissive: 0x060607 });
const geoCache = new Map();
const boxGeo = (w, h, d) => { const k = `b${w},${h},${d}`; if (!geoCache.has(k)) { const g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, [g, new THREE.EdgesGeometry(g)]); } return geoCache.get(k); };
const cylGeo = (r, h) => { const k = `c${r},${h}`; if (!geoCache.has(k)) { const g = new THREE.CylinderGeometry(r, r, h, 40); geoCache.set(k, [g, new THREE.EdgesGeometry(g, 30)]); } return geoCache.get(k); };
const circle = (r, n = 96) => { const p = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; p.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); } return new THREE.BufferGeometry().setFromPoints(p); };

function makeBuilding(t, L) {
  const g = new THREE.Group(), gold = L >= MAXL || t === 'monolith';
  const edge = new THREE.LineBasicMaterial({ color: gold ? GOLD : IV, transparent: true, opacity: gold ? .9 : .5 });
  const lite = new THREE.MeshBasicMaterial({ color: gold ? GOLD : IV, transparent: true, opacity: 1 });
  g.userData = { edge, lite, spin: [], top: 0, gold };
  const part = (geo, y, ry = 0, x = 0, z = 0) => { const m = new THREE.Mesh(geo[0], blkMat); m.add(new THREE.LineSegments(geo[1], edge)); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  const cap = (y, s = .085) => { const c = new THREE.Mesh(boxGeo(s, s, s)[0], lite); c.position.y = y + s / 2 + .01; g.add(c); const gl = glow(gold ? GOLD : IV, .55, .3); gl.position.y = c.position.y; g.add(gl); g.userData.capGlow = gl; };
  let top = 0;
  if (t === 'point') { const h = .26 + .15 * L; part(boxGeo(.44, h, .44), h / 2); top = h; if (L >= 3) cap(top); }
  else if (t === 'line') { const h = .8 + .3 * L; part(boxGeo(.12, h, .12), h / 2, 0, -.15); part(boxGeo(.12, h, .12), h / 2, 0, .15);
    part(boxGeo(.46, .06, .16), h + .03); if (L >= 2) part(boxGeo(.3, .04, .1), h * .55); top = h + .06; if (L >= 3) cap(top); }
  else if (t === 'terrace') { let y = 0; const n = 1 + L; for (let i = 0; i < n; i++) { const s = .72 - i * (.5 / n), h = .13; part(boxGeo(+s.toFixed(3), h, +s.toFixed(3)), y + h / 2); y += h; } top = y; if (L >= 2) cap(top); }
  else if (t === 'orbit') { const h = .7 + .26 * L; part(cylGeo(.12, +h.toFixed(2)), h / 2); top = h;
    const nr = Math.ceil(L / 2) + (L >= 5 ? 1 : 0);
    for (let i = 0; i < nr; i++) { const ring = new THREE.Group(); ring.position.y = h * (.45 + .2 * i); ring.rotation.x = .35 + i * .5; ring.rotation.z = i * .9;
      ring.add(new THREE.LineLoop(circle(.3 + i * .05), edge)); const sat = new THREE.Mesh(boxGeo(.05, .05, .05)[0], lite); sat.position.x = .3 + i * .05; ring.add(sat);
      g.add(ring); g.userData.spin.push([ring, .6 + i * .35]); }
    cap(top, .07); }
  else if (t === 'spiral') { const n = 3 + 2 * L; for (let i = 0; i < n; i++) part(boxGeo(.5, .06, .5), .05 + i * .115, i * (137.5 / 13) * Math.PI / 180); top = .08 + n * .115; cap(top); }
  else if (t === 'monolith') { const h = 1.7 + .42 * L; part(boxGeo(.62, .05, .62), .025); part(boxGeo(.32, h, .32), h / 2 + .05); top = h + .05; cap(top, .1);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, 3, 6, 1, true), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = top + 1.5; g.add(beam); }
  if (L >= MAXL && t !== 'monolith') { const beam = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1.4, 6, 1, true), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.y = top + .8; g.add(beam); }
  g.userData.top = top; return g;
}

/* ---------- live buildings ---------- */
const live = new Map();               // key -> { g, x, y, born, flash, emit }
const lotOf = new Map();              // mesh uuid -> key, for picking
function place(x, y, anim) {
  const k = key(x, y), b = S.b[k], old = live.get(k);
  if (old) { scene.remove(old.g); }
  const g = makeBuilding(b.t, b.L); g.position.copy(P(x, y, 0)); scene.add(g);
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
  const n = Math.min(5, S.origin);
  for (let i = 0; i < n; i++) { const s = .42 + i * .12, f = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-s, 0, -s), new THREE.Vector3(s, 0, -s), new THREE.Vector3(s, 0, s), new THREE.Vector3(-s, 0, s)]),
      new THREE.LineBasicMaterial({ color: i === n - 1 && S.origin >= 5 ? GOLD : IV, transparent: true, opacity: .75 - i * .1 }));
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
  else { const r = Math.max(60, inc * 45); earn(r); toast(`GOLDEN POINT ${coord(GP.x, GP.y)} · +${fmt(r)} Ø`, true); popAt(P(GP.x, GP.y, GP.h), '+' + fmt(r), true); }
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
function audio() { if (ac) return; ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .5; master.connect(ac.destination); }
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
    h += `<div class="row"><span class="st live">ORIGIN</span><span class="lv">${lvl(Math.min(S.origin, 5), 5)}</span></div><h3>Nullorigo</h3><p>Everything starts here. Tap the origin to draw Ø from zero. Fast taps build a combo.</p>
      <div class="kv"><span>Per tap</span><b>${fmt(tapBase() + income() * .04)} Ø</b></div>
      <button class="go" type="button" data-a="origin" ${S.coins < oc ? 'disabled' : ''}>Strengthen origin · ${fmt(oc)} Ø</button>`;
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
  else if (a === 'sell' && b) { if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = 'Tap again to sell'; return; } earn(b.spent * .4); delete S.b[k]; unplace(x, y); rebuildCorners(); pulse(x, y, IV, 1, .8, .5); sfx('no'); }
  else if (a === 'origin') { const c = originCost(); if (S.coins < c) return sfx('no'); S.coins -= c; S.origin++; rebuildCore(); pulse(0, 0, GOLD, 2.4, 1.3, .9); burst(P(0, 0, .55), 18, true); sfx('up'); }
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
  const g = (tapBase() + income() * .04) * (1 + combo * .07); earn(g); S.taps++;
  coreCube.scale.setScalar(1.35); pulse(0, 0, combo > 12 ? GOLD : IV, .9 + combo * .03, .6, .7); burst(P(0, 0, .6), 3 + Math.min(6, combo >> 2), combo > 12);
  popScreen(sx, sy, '+' + fmt(g) + (combo > 2 ? `<em>×${(1 + combo * .07).toFixed(2)}</em>` : ''), combo > 12); sfx('tap');
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
  ghost.position.copy(P(hover.x, hover.y, 0)); scene.add(ghost);
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
  ui.goal.innerHTML = `<div class="gt">GOAL ${String(S.goal + 1).padStart(2, '0')} / ${GOALS.length}</div><div class="gx">${G.t}</div><div class="gb"><i style="transform:scaleX(${f})"></i></div><div class="gr"><span>${n > 50 ? fmt(Math.min(c, n)) + ' / ' + fmt(n) : Math.min(Math.floor(c), n) + ' / ' + n}</span><span>REWARD ${fmt(G.r)} Ø</span></div>`;
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
function start() { $('intro').classList.add('out'); setTimeout(() => $('intro').remove(), 900); S.seen = true; audio(); save(); }
if (S.seen) $('intro').remove(); else $('start').onclick = start;
{ // earnings while away: half rate, up to two hours
  const away = Math.min(7200, (Date.now() - S.t) / 1000), inc = income() / (boostOn() ? 3 : 1), g = inc * away * .5;
  if (S.seen && away > 30 && g >= 1) { $('wbv').textContent = '+' + fmt(g) + ' Ø'; $('wbt').textContent = `${Math.floor(away / 60)} min on the plane while you were away`; $('welcome').hidden = false;
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
  if (CAM.intro < 1) CAM.intro = Math.min(1, CAM.intro + dt / (reduce ? .01 : 3.2) * (document.getElementById('intro') ? 0 : 1));
  CAM.idle += dt; if (CAM.idle > 10 && !reduce) CAM.yawT -= dt * .025;
  landR += (S.R - landR) * (1 - Math.exp(-dt * 2.2)); drawBorder(landR);
  placeCam(dt);
  // buildings: growth, flash, coins
  live.forEach((o) => {
    if (o.grow < 1) { o.grow = Math.min(1, o.grow + dt / .85); o.g.scale.y = Math.max(.001, back(o.grow)); }
    if (o.flash > 0) { o.flash = Math.max(0, o.flash - dt / 1.1); const c = o.g.userData.edge.color; c.set(o.g.userData.gold ? GOLD : IV).lerp(new THREE.Color(GOLD), o.flash); o.g.userData.edge.opacity = lerp(o.g.userData.gold ? .9 : .5, 1, o.flash); }
    o.g.userData.spin.forEach(([r, s]) => r.rotation.y += dt * s);
    if (o.g.userData.capGlow) o.g.userData.capGlow.material.opacity = .24 + .08 * Math.sin(T * 2 + o.x * 1.7 + o.y);
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
window.__arcade = { screen: (x, y, h = 0) => toScreen(P(x, y, h)), S, act, build: (x, y, t) => { mode = t; build(x, y); }, expand, earn, spawnGold, catchGold, openCard, setMode, income };
