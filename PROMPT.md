# Origins by Nullorigo — 3D Edition

You are building the 3D edition of an existing generative NFT collection. Read this whole file before writing code.

## Files in this folder

- `origins.js` — the existing 2D generator. **This is the single source of truth. Do not change it.** Load it and reuse it.
  - `ORIGINS.all()[n]` returns the traits of token `n` (1…3333): `family`, figure parameters (`n`, `d`, `a`, `b`, `R`, `r`, `rings`, `lines`, `count`, `angle`, `order`, `v`, `ratio`, `stars`, `show`, `seed`, …), `ink` (Ivory / Gold / Silver), `density`, `rotation`, `gold` (the golden point `[x, y]`), `special` (None / Origin / Gold).
  - `ORIGINS.draw(ctx, n, size, opts)` draws the 2D original. Read it to understand how every family is built, and reuse the same maths.
  - `ORIGINS.metadata(n)` returns the token metadata.
- `origins-2d-references.jpg` — the 2D originals you are translating, one per family, in this order:
  6 Rose · 16 Spiral · 7 Orbits · 22 Waves · 23 Phyllotaxis · 11 Lissajous ·
  21 Spirograph · 1 Harmonograph · 14 Rings · 55 Times Table · 8 Envelope · 2 Hilbert ·
  74 Sierpinski · 30 Constellation · 76 Ulam · 187 (special: Origin) · 3 (special: Gold) · 5 (Silver ink).

## The idea

Origins is 3333 mathematical figures drawn on one coordinate plane, black background, thin ivory lines, one golden point per work. The 3D edition turns each figure into a **light sculpture floating above that coordinate plane**, like a precise installation in a dark museum room.

Rules:
1. **Every 3D work is generated from the same token traits.** Token 1 in 3D is the same work as token 1 in 2D. Deterministic: the same token always renders the identical image.
2. **The 2D figure must still be recognisable** when you look from above. The third dimension adds depth and drama, never noise.
3. **Calm, precise, expensive.** Less is more.

## The look (non‑negotiable)

- **Background:** near‑black `#09090A`, very light fog so far parts fade softly.
- **Colours:** only the inks. Ivory `#F0ECE2`, Gold `#DEB86C`, Silver `#CED4DE`. The golden point is always gold. No other colours anywhere.
- **Lines are glowing filaments with real thickness**: use `Line2` / `LineMaterial` with `worldUnits: true`, or thin `TubeGeometry`. They must never break, flicker or vanish at distance.
- **Glow:** selective bloom on lines and points only. The floor and text never bloom. Dense families (Harmonograph, Sierpinski, Times Table) must not turn into a white blob: lower their opacity per line and keep detail readable.
- **Points on curves stay square**: small glowing cubes, not spheres. The square is the brand motif.
- **The plane:** a dark glossy floor with the grid of small dots and the two axes with tick marks, exactly like the 2D card (1 unit = 1 grid step, axes to ±12). The sculpture floats above it (base height ≈ 1.5 units). The 2D figure is also drawn very faintly on the floor, like a shadow or a blueprint — that is the link between the two editions. A soft, blurred reflection of the sculpture in the floor.
- **The golden point:** a gold cube with a soft glow at `(x, y)` at sculpture height. Dashed gold lines drop to the floor and run to both axes, like in 2D, with the label `(x, y)` (use the real minus sign −).
- **Light and finish:** ACES filmic tone mapping, dark gallery mood, subtle rim light, very fine film grain, soft vignette, a gentle depth of field focused on the figure. Chromatic aberration ≤ 0.5 px or none.
- **Frame overlay** identical to the 2D card, drawn in 2D on top of the render: `O R I G I N S` top left, 4‑digit token number top right, `FAMILY · FIGURE` bottom left, `n / 3333` bottom centre, the formula bottom right, thin frame. Font: Jost (Google Fonts), same sizes and letter spacing as `origins.js`.
- **Avoid:** rainbow or neon colours, cyberpunk, chrome blobs, glass spheres, lens flares, busy backgrounds, particle spam, "generic 3D render" look, anything that looks like a stock screensaver.

## Family → 3D (keep every parameter from the traits)

- **Rose** — the petal curve `r = amp·cos(k·t)` in XY; petals curl upward like a flower opening (height grows toward the petal tips).
- **Spiral** — the Archimedean spiral rises as a helix (height grows with `t`); each arm is its own filament.
- **Orbits** — rings tilted by small deterministic angles, like an orrery; satellites are cubes on the rings; the centre cube stays.
- **Waves** — each wave line sits at its own depth, so the lines form a wave terrain; optional very faint translucent surface between them.
- **Phyllotaxis** — the seeds sit on a shallow dome, like the head of a sunflower; cube size grows outward as in 2D.
- **Lissajous** — a true 3D Lissajous: `z = 9·sin(c·t + phase)` with `c` derived from `a` and `b` so the curve stays closed.
- **Spirograph** — the hypotrochoid gets a gentle vertical wave, becoming a crown / torus‑knot shape.
- **Harmonograph** — add a third damped pendulum for `z` with the same damping: a decaying 3D trace. Thinner, more transparent lines.
- **Rings** — the square rings become stepped terraces (a ziggurat): inner rings higher. Filled and hollow cubes stay as in 2D.
- **Times Table** — points on the circle; every chord bows upward into an arc (height ∝ chord length): a dome of string art.
- **Envelope** — the string art becomes a real ruled surface: endpoints on the x‑axis at height 0, endpoints on the y‑axis at height H, giving a hyperbolic‑paraboloid saddle made of straight lines. "Nested" = two layers at different heights.
- **Hilbert** — a 3D Hilbert curve (order 3 in 2D → 64‑point 3D curve; order 4 → 512‑point 3D curve).
- **Sierpinski** — the chaos game in 3D: a tetrahedron for 3 vertices, a pyramid for 4, a prism with apex for 5–6. Fine point cloud, vertices as cubes.
- **Constellation** — every star gets a seeded height; lines connect them in 3D; faint vertical lines drop each star to the floor, like a star map.
- **Ulam** — the square spiral is drawn faintly on the floor; the lit numbers become thin pillars (height grows slowly with `n`).
- **Special: Origin** (gold point at (0, 0)) — the origin cube is larger, with a thin vertical beam of gold light. It must feel like the rarest piece.
- **Special: Gold** — the whole sculpture in gold filament, warmer glow. **Silver ink** — cooler, slightly brighter.

## Camera and framing

- The same camera for every token: three‑quarter view, about 30° elevation, focal length like a 35 mm lens (fov ≈ 38°), figure centred and filling about 65% of the frame. Apply the `rotation` trait to the figure, not to the camera.
- Square 1:1.

## Deliverables

1. `viewer.html` — three.js pinned to `0.160.0`. Token number input, previous / next buttons, slow orbit, toggle for the frame overlay.
2. `render.mjs` — headless renders with Playwright: a 2048 × 2048 PNG per token. Clean anti‑aliasing: render at 2× and downscale, or accumulate 8–16 jittered frames.
3. Optional loop — a seamless 6‑second orbit (±20°), 1080 × 1080, MP4 (H.264) and WebM, for `animation_url`.
4. Metadata — reuse `ORIGINS.metadata(n)`, add `animation_url` and the trait `Edition: 3D`.
5. Batch mode for all 3333 tokens: resumable (skips finished files), checks every PNG is not blank (mean brightness threshold), logs failures, can run in parallel workers.

## How to work (important)

1. **Step 1:** build the viewer and render a contact sheet of the 18 reference tokens listed above, in the same order as `origins-2d-references.jpg`, next to their 2D originals. **Stop and show me. Do not batch‑render until I approve.**
2. **Step 2:** we iterate on the look together until every family is beautiful.
3. **Step 3:** batch render.

## Quality bar — check before showing me anything

- No aliasing or shimmering on thin lines, no z‑fighting, no clipped figures.
- Lines keep their thickness and stay visible from every angle.
- The top‑down view matches the 2D original.
- Exposure is consistent across all families and inks; Gold and Silver are clearly different from Ivory.
- Dense families keep their detail.
- Two renders of the same token are pixel‑identical.
