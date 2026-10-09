/* Origins — token page (animation_url).
   Shows the 2D card exactly as `image`; a click/tap lifts the work into its 3D edition, another one lays it back down.
   Token number: ?n=12, ?token=12, ?id=12 or #12. Self-contained: no network requests. */
import { Origins3D, drawFrame } from '../origins3d.js';

const ORIGINS = window.ORIGINS;
const q = new URLSearchParams(location.search);
const NO = Math.min(ORIGINS.SUPPLY, Math.max(1, parseInt(q.get('n') || q.get('token') || q.get('id') || location.hash.slice(1) || '1', 10) || 1));
const UP_MS = 2800, DOWN_MS = 2000;                       // 2D → 3D, 3D → 2D
const coarse = matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);
const card = $('card'), c2d = $('c2d'), cgl = $('cgl'), cov = $('cov'), hint = $('hint');
const octx = cov.getContext('2d');
let eng = null, state = '2d', lift = 0, from = 0, to = 0, t0 = 0, dur = 1, raf = 0;
const user = { az: 0, el: 0 }, orbitT0 = performance.now();

/* ---------- layout + 2D card (identical to the `image`) ---------- */
function px() { return Math.min(2048, Math.round(card.clientWidth * Math.min(2, devicePixelRatio || 1))); }
function layout() {
  const s = Math.floor(Math.min(innerWidth, innerHeight)); card.style.width = card.style.height = s + 'px';
  hint.style.fontSize = Math.max(7, s * .0112) + 'px'; hint.style.top = (s * .0635) + 'px';   // centred on the ORIGINS title line
  const P = px(); c2d.width = c2d.height = P; ORIGINS.draw(c2d.getContext('2d'), NO, P, { grain: true });
  if (eng) { eng.setSize(glSize(), eng.ss); cov.width = cov.height = eng.size; if (state !== '2d') frame(performance.now(), true); }
}
const glSize = () => Math.min(coarse ? 1400 : 2048, px());

/* ---------- 3D engine, prepared quietly after the card is on screen ---------- */
function prepare() {
  try {
    eng = new Origins3D(cgl, { size: glSize(), ss: (devicePixelRatio || 1) >= 1.5 ? 1.25 : 1.6 });
    eng.setToken(NO); eng.view.lift = 0; cov.width = cov.height = eng.size;
    card.classList.add('ready');
  } catch (e) { console.warn('3D unavailable, staying 2D', e); eng = null; hint.remove(); }
}

/* ---------- animation ---------- */
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function frame(now, once) {
  if (state === 'up' || state === 'down') {
    const k = Math.min(1, (now - t0) / dur); lift = from + (to - from) * k;
    if (k >= 1) { state = to ? '3d' : '2d'; card.classList.toggle('is3d', state === '3d'); hint.textContent = state === '3d' ? 'BACK TO 2D' : 'VIEW IN 3D'; }
  }
  const sway = reduced ? 0 : 9 * Math.sin((now - orbitT0) / 1000 / 16 * 2 * Math.PI);           // slow, calm drift
  eng.view.lift = lift; eng.view.azimuth = 38 + user.az + sway * smooth(.6, 1, lift); eng.view.elevation = 30 + user.el;
  eng.render();
  octx.clearRect(0, 0, cov.width, cov.height); drawFrame(octx, NO, eng.size, eng.goldScreen());
  c2d.style.opacity = 1 - smooth(0, .09, lift);            // the 2D card dissolves into its own top view
  if (state === '2d') { cgl.style.visibility = cov.style.visibility = 'hidden'; return; }
  cgl.style.visibility = cov.style.visibility = 'visible';
  if (!once && !document.hidden) raf = requestAnimationFrame((t) => frame(t));
}
function toggle() {
  if (!eng) return;
  const goingUp = state === '2d' || state === 'down';
  from = lift; to = goingUp ? 1 : 0; t0 = performance.now(); dur = Math.max(1, Math.abs(to - from) * (goingUp ? UP_MS : DOWN_MS));   // reversing mid-way continues from where it is
  state = goingUp ? 'up' : 'down'; hint.textContent = goingUp ? 'BACK TO 2D' : 'VIEW IN 3D';
  cancelAnimationFrame(raf); raf = requestAnimationFrame((t) => frame(t));
}

/* ---------- input: click / tap toggles, drag turns the sculpture ---------- */
let down = null;
card.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, drag: false }; card.setPointerCapture(e.pointerId); });
card.addEventListener('pointermove', (e) => {
  if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (!down.drag && Math.hypot(dx, dy) > 6 && state === '3d') down.drag = true;
  if (down.drag) { user.az -= dx * .28; user.el = Math.min(32, Math.max(-16, user.el + dy * .18)); down.x = e.clientX; down.y = e.clientY; }
});
card.addEventListener('pointerup', () => { if (down && !down.drag) toggle(); down = null; });
card.addEventListener('pointercancel', () => { down = null; });
card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state !== '2d') { cancelAnimationFrame(raf); raf = requestAnimationFrame((t) => frame(t)); } });
addEventListener('resize', layout);

document.title = 'Origins #' + String(NO).padStart(4, '0');
await document.fonts.load('300 17px Jost').catch(() => {}); await document.fonts.load('400 17px Jost').catch(() => {});
layout();
(window.requestIdleCallback || ((f) => setTimeout(f, 60)))(prepare, { timeout: 800 });
