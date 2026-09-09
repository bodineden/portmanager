# PortManager — Mascot resting idle (click-free motion)

Date: 2026-09-09. Branch: `feat/mascot-resting-idle`, one commit `9300512` (Sol gpt-6-astra ultra, deleg_dc6fc668), ff-merged to main and pushed; Vercel Production deployment success 06:38:58Z (GitHub deployment 6344063051).

## Trigger

Bodin: "The mascot on the port manager site is supposed to be moving but it is static?" Parent diagnosis (2026-09-09):

- Repo state verified: main == origin/main with the Run 2 3D viewer merged (`2644ab9`, 03:24 UTC) — code and asset were live in the deployed commit.
- Shipped GLB is genuinely animated: `gltf.animations` = `idle`(7.04s) / `happy_clap`(7.04s) / `excited_bounce`(7.04s), each with 169-keyframe body tracks — not a static model.
- Running that exact commit locally proved the viewer plays: WebGL2 → `data-mascot-3d=on`, clip active, 2D sprite hidden, ~5% of card pixels changed between frames 700ms apart; console clean.
- Why it can still LOOK static by design: (1) Run 2 animated only inside the click-to-expand panel — the resting chip was a static 2D sprite; (2) even expanded, OS reduced-motion or missing WebGL2 forces the static fallback; (3) a pre-03:24 cached tab shows nothing.
- Live origin (portmanager-psi.vercel.app) is Google-OAuth-gated: every route and `/mascot/*.glb` returns 307 → /login without a session — live visual certification stops at the login wall for the agent.
- Bodin's clarifications: he HAD clicked/expanded and it stayed still; wanted a change so it animates **without a click**; chose "skip triage — write the brief with environmental fallbacks baked in."

## Change (worker `9300512`, 4 files +253/−41)

`app/mascot-companion.tsx`:
- Viewer mount is now ENVIRONMENT-gated (`viewerMounted && !reducedMotion`) instead of expansion-gated; `viewerMounted` initial true.
- Collapsed chip clip = `"idle"`; expanded clip = `mascotMotionForMood(state.mood)` — clip prop switch through the existing runtimeRef.switchClip path, no remount.
- `collapse()`/`expand()` no longer unmount/reset the viewer.
- `data-mascot-3d` is now always present: `reducedMotion ? "off" : viewerState` (was: only while expanded).
- `serverReducedMotion()` returns true so SSR/hydration renders static until the browser preference is known (no hydration mismatch, no 3D flash).
- Reduced-motion change listener now active regardless of expansion state.

`app/mascot-3d-viewer.jsx`:
- Canvas is created off-DOM and appended to a `span.mascot-3d-host` (display:contents, aria-hidden) ONLY after the model parses and the clip starts; removed in cleanup. The 2D sprite remains the only visible surface during load, and stays the fallback on off/error.
- Host element replaces the previous direct `<canvas>` return.

`app/mascot-companion.css`:
- `.mascot-3d-host { display: contents; border-radius: inherit }` and canvas `border-radius: inherit` (rounded canvas corners on the chip).
- `@media (prefers-reduced-motion: reduce)` now forces `animation: none !important; transition: none !important` across the companion — genuinely static reduced-motion fallback (fixes an inherited tiny-duration transition hang).

`scripts/ui-contract-check.mjs` (+249): resting-state contracts inverted/extended for the new click-free idle contract (details below); all prior 305 checks preserved or coherently updated.

### Collapsed `data-mascot-3d` contract (chosen)

Always present. `off` during SSR/hydration/loading and for reduced-motion / no-WebGL2 fallback; `on` only when the attached canvas is ready and playing `idle`; `error` on GLB load/parse failure. Only `on` hides the retained accessible sprite (opacity 0); loading/off/error keep sprite opacity 1 and no DOM canvas.

## Parent independent QA (re-run by parent, not worker-reported)

- `npm test`: 13 files, **183/183**.
- `npm run lint`: 0 errors (1 pre-existing `proxy.ts` unused `b64urlEncode` warning).
- `npm run build`: clean compile.
- `node scripts/ui-contract-check.mjs` (local production @8125 with offline provider preload + fixture server): **323/323** — Mascot contract 122/122 · Mascot 3D/fallback 32/32 (states error/off/on) · Screenshot-free DOM assertions 48/48 · Resting/occlusion 10/10 at 1440×1000 and 390×844.
- New harness checks (desktop + mobile variants): WebGL resting chip plays idle without a click; WebGL resting idle changes rendered frames continuously; expand/collapse preserves canvas and switches idle↔excited_bounce (click + Escape); collapsed mood updates retain idle and the mounted canvas; reduced-motion toggle removes and restores idle; resting idle and transition console stays clean; loading keeps visible sprite and no canvas; initial reduced motion never mounts 3D at rest (zero WebGL probes / GLB requests); WebGL-disabled off + 2D fallback; malformed-GLB error at rest and after expansion.
- Pixel-motion probe (playwright chromium + SwiftShader, fixture scenario portfolio-mascot-excited, NO interaction): `data-mascot-3d=on`, canvas 62×93 over 64px chip, `data-mascot-motion=idle`, sprite opacity 0; 5 frames 2s apart → **4.5–7.7% of chip pixels changed per interval** = continuous visible motion. Click → `excited_bounce`, card 128×262 / canvas 126×189 (Run 2 box preserved); collapse → `idle`. Total GLB requests = **1**. Zero page/console/Three/WebGL errors.

## Deployment & revert

- Merged ff-only `9300512` → main → pushed (origin/main `9300512`). Vercel Production deployment success (GitHub deployment 6344063051, created 06:38:57Z, status success 06:38:58Z).
- Revert: git tag `pre-mascot-resting-idle-2026-09-09` @ e2f453a; physical snapshot `backups/portmanager-pre-mascot-resting-idle-2026-09-09/` (diff-clean before the run).

## Known limits / risk flags

- Always-on ~64×96 WebGL canvas adds modest GPU/battery use and fetches the 4.3MB GLB earlier in the page lifetime (previously on first expand).
- Automated rendering used Chromium/SwiftShader — hardware GPU and iOS Safari (context pressure, tab suspension/resume, low-power mode) remain device-dependent manual QA.
- Reduced-motion / no-WebGL2 / GLB-error environments still see the static chip by design (accessibility + fallback contracts preserved).
- Live post-merge visual confirmation requires a logged-in session (auth-walled for the agent): Bodin hard-refresh (Cmd/Ctrl+Shift+R) and eyeball.
- Worker's own extra concurrent-browser stress run hit one state-wait timeout that did not recur in its isolated 63/63 repeat — not hardware soak-test approval.
