# Render-Resolution Performance (High-DPI / 4K fix)

## Confirmed root cause

Both world canvases sized their backing store to
`cssWidth * devicePixelRatio × cssHeight * devicePixelRatio`, uncapped:

- **RPG** — `doResize()` in [`rpg-render.ts`](../src/render/rpg/rpg-render.ts)
  set `canvas.width = round(areaW * window.devicePixelRatio)` and the draw path
  ([`rpg-render-draw.ts`](../src/render/rpg/rpg-render-draw.ts)) applied the
  transform `setTransform(fs.scale * dpr, 0, 0, fs.scale * dpr, …)`.
- **Equation/Idle crisp** — `resizeCanvas()` in
  [`game-canvas.ts`](../src/render/canvas/game-canvas.ts) set the crisp backing
  to `containerW×DPR × containerH×DPR`, and the debug/HUD overlay canvas was
  *always* allocated at full `container × nativeDPR`.

On a fullscreen 4K monitor the RPG's fitted 9:16 area is roughly 1215×2160 CSS
px; at DPR 2 that is a **2430×4320 ≈ 10.5-megapixel** backing store. Every frame
the renderer re-rasterizes Canvas 2D paths, gradients, `shadowBlur`, alpha
blending, terrain, particles, and full-screen effects across that physical
backing. The RPG logical world is only **360×640**, so cost scaled with monitor
resolution and roughly with **devicePixelRatio²** for no visual benefit — the
world is the same size either way.

## New architecture

One authoritative, **pure** render-resolution policy:
[`render-resolution-policy.ts`](../src/render/canvas/render-resolution-policy.ts).

`computeRenderResolution({ cssWidth, cssHeight, nativeDevicePixelRatio, quality,
maxPixelBudget? })` returns a capped **effective** device-pixel ratio and
integer backing dimensions bounded by a pixel budget. It reads no browser
globals (native DPR is passed in via `readNativeDevicePixelRatio()`), preserves
aspect ratio (both axes scaled by the same effective DPR), and never returns
zero-sized or non-finite output.

Key distinction now made explicit everywhere:

| Concept | Meaning |
| --- | --- |
| Native device DPR | `window.devicePixelRatio` (monitor/browser) |
| Effective render DPR | capped world→backing scale actually used |
| CSS display size | the fitted `#rpg-area` / container size |
| Logical world | fixed `RPG_LOGICAL_WIDTH × RPG_LOGICAL_HEIGHT` (360×640) |

### RPG integration

`doResize()` runs the fitted CSS area through the policy and stores the
**effective** DPR in `rpgFieldSpace.dpr`. The draw transform already multiplied
world coordinates by `fs.scale * fs.dpr`, so lowering `fs.dpr` renders the whole
world into a smaller backing store; the browser upscales that backing to the CSS
area (smoothly — `image-rendering` left default). Because all input/collision math
lives in **CSS space** (`fs.offsetX`, `fs.scale` — no DPR factor), input,
collision, spawning, pathfinding, and gameplay are untouched. World bounds,
visible bounds, and aspect ratio are unchanged (they never depended on DPR).

The dev-only pixelated backbuffer
([`rpg-pixel-backbuffer.ts`](../src/render/rpg/rpg-pixel-backbuffer.ts)) still
divides `fs.dpr` (now the effective DPR) by its `PIXEL_DIV`, so there is one
authoritative resolution and the backbuffer is a further *intentional* dev
divisor rather than a second competing system.

### Equation/Idle integration

- **Pixelated mode** — unchanged: fixed ~320px internal backing, nearest-neighbor
  upscale, cheap on 4K.
- **Crisp mode** — backing = `CSS × effectiveDPR` via the policy; `cc.dpr` holds
  the effective DPR so `resetCanvasRenderState` still lets draw calls use CSS
  coordinates.
- **Overlay canvas** — capped by a larger `OVERLAY_MAX_BACKING_PIXELS` budget
  (crisp text matters more there); `cc.overlayDpr` tracks its effective DPR and
  the perf-stats overlay code uses it.

### Redundant full-frame work removed

The RPG frame previously cleared+filled the full physical backing at identity
transform **and** cleared+filled the visible-world rect under the world
transform. Since `#rpg-area` is always fitted to the exact safe-core aspect
ratio, `visibleBounds` maps precisely onto the full backing, so the second pass
was redundant. The identity-transform pass is kept (it is strictly safer: it
covers the whole backing regardless of transform rounding and runs *before* the
screen-shake translate, so shake can never expose an un-cleared edge); the
world-space clear+fill was removed.

## Settings

New setting `renderResolutionQuality: 'auto' | 'high' | 'balanced' |
'performance'`, default `'auto'`. It is **separate** from `graphicsQuality`
(effect richness): this controls backing pixel count only. Persisted values are
validated on load; older saves without the field default to `'auto'`. Exposed in
Settings → Visual → **Render Resolution**. Changing it re-runs the RPG and idle
resizes immediately — no restart.

## Pixel budgets (starting values)

Defined in `render-resolution-policy.ts`:

| Tier | Budget (physical px) |
| --- | --- |
| Auto | 1,500,000 |
| High | 3,000,000 |
| Balanced | 1,500,000 |
| Performance | 750,000 |
| Overlay | 4,000,000 |

Rationale: on a reference 360×640 phone (≈230k px @ DPR 1, ≈920k @ DPR 2)
nothing is capped in Auto/High/Balanced. The RPG world is only 360×640, so even
0.75MP is a large oversample and upscales smoothly. There is no separate DPR
floor — the budget itself is the resolution floor, and a fixed DPR floor would
otherwise push the backing *above* budget on 4K displays. A per-axis clamp of
4096 guards pathological aspect ratios. Tune the constants at the top of the
policy file.

### Expected backing dimensions

For the fullscreen 4K RPG area (~1215×2160 CSS, native DPR 2, native backing
2430×4320 = 10.5MP):

| Tier | ~Effective DPR | ~Backing | ~Pixels |
| --- | --- | --- | --- |
| High | 1.07 | 1300×2312 | 3.0 MP |
| Auto / Balanced | 0.76 | 920×1635 | 1.5 MP |
| Performance | 0.54 | 650×1156 | 0.75 MP |

These are the analytic results of the policy (verified by the unit tests), not
measured frame times.

## Diagnostics

The RPG dev viewport overlay now reports native DPR, effective DPR, cap state,
quality tier, and backing megapixels (dev mode only), sourced from
`getRenderResolutionInfo()`. Use it to confirm the cap is active — e.g. on a 4K
display in Auto you should see `capped: Yes`, `effDPR` < `nativeDPR`, and pixels
≈ 1.5 MP.

## Cache behavior

No new per-frame canvas allocation is introduced. The offscreen pixel-backbuffer
canvas is persistent and resized only when its dimensions change. The policy is
allocation-free. Overlay and world backing stores are resized only when their
computed dimensions actually change (guarded `if (canvas.width !== …)`).

## Known tradeoffs

- Balanced/Performance upscale a smaller backing to the display, so fine detail
  is softer on very large screens. This is the explicit intent of those tiers;
  Auto targets a middle ground and is the default.
- Auto and Balanced currently share the 1.5MP budget; they are kept distinct so
  the budgets can diverge later without a settings migration.
- Effect-level optimization (glow-sprite caches, static-terrain caches) was
  intentionally left out of this change to avoid a broad renderer rewrite; the
  resolution decoupling removes the dominant `DPR²` cost. Those are safe
  follow-ups keyed by `radius/color/intensity/graphicsQuality`.

## Manual test matrix

Not yet executed as measured runs. To verify, exercise: RPG at ~360×640; RPG
fullscreen at 1920×1080 and 3840×2160; DPR 1 / 1.25 / 1.5 / 2; Equation/Idle
pixelated and crisp; each Render-Resolution tier; a high-effect combat wave; a
boss wave; a terrain-heavy zone; fullscreen enter/exit; browser resize; browser
zoom; and moving the window between monitors. In each case confirm the world
size, visible bounds, and pointer accuracy are unchanged while the dev overlay
shows the expected capped backing. Report any timings gathered here as
**measured**; the tables above are **expected/analytic**.

## How to tune later

Edit the `*_MAX_BACKING_PIXELS` constants in `render-resolution-policy.ts`.
Lower for more FPS headroom, raise for sharpness. The RPG world being fixed at
360×640 means budgets far below the native 4K backing still oversample the world
comfortably.
