# PR 3 + PR 4: The porch world, Scores and Gallery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synthwave look with one detailed pixel-art world: a porch at sunset by the ocean, where every existing feature is an object you can click. Playing zooms the camera into a hovering easel, and a clear, labelled UI frames the canvas. PR 4 (Tasks 7–8) adds the Scores chalkboard page and the gallery-wall profile.

**Architecture:**
- A small scene engine (`src/scene/`) draws a 320×180 logical-pixel canvas from code-defined sprites and procedural sky, sea and sun, scaled with `image-rendering: pixelated` and throttled to about 12 fps.
- Clickable objects are real `<a>`/`<button>` hotspots laid over the canvas in percentage coordinates.
- A camera wrapper zooms with a CSS transform.
- The existing `pp-*` utility classes are restyled in place into wood and paper pixel panels, so most pages restyle without markup churn.
- Every existing `data-testid` is kept.

**Tech Stack:** React 19, generouted routes, Tailwind v4 (CSS config in `src/styles.css`, `src/themes.css`), Canvas 2D, Vitest, Playwright (offline suite, plus the screenshot suite with `SCREENSHOTS=1`).

**Spec:** `docs/superpowers/specs/2026-11-17-porch-redesign-design.md` (sections "The world: every feature has an object", "The play screen", "Scoring legibility" Party part, "Constraints"). The approved mockups are `docs/superpowers/specs/porch-mockups/porch-scene.html` (wide porch) and `play-zoomed-v5.html` (play screen). Open them in a browser; they are the visual reference, and the real art must be richer and more detailed than them.


> **Owner revision (2026-11-18):** no steps to the beach. The Scores chalkboard hovers on boosters (like the easel) on the right of the porch. Party lives in the house's basement: a cellar hatch in the porch floor, with a clean pan-down transition into a cosy basement studio whose high windows overlook the beach and sea. Tasks 5b and 5c below read "basement studio" wherever they say "beach": the lobby is a basement studio with easels and the sunset beach seen through the windows; "Back to the beach" becomes "Back upstairs" (`room-exit` → `/party` from a room, and the studio has an "Upstairs" exit to `/home` with a pan up). The mailbox is mounted on the house wall.

## Global Constraints

- Follow `AGENTS.md`: no deploy, push, undeploy, transfer or collaborator commands; no secrets; no real AI calls.
- **Base:** branch `t3/pr3-porch-world` from `origin/t3/pr2-drawing-tools` (PRs #9 and #10 aren't merged yet). PR 4 is branch `t3/pr4-scores-gallery`, stacked on PR 3.
- **Art comes from code only:** sprites are pixel maps in TypeScript, and the sky, sea, sun, flames and water are procedural. No image files or AI-generated art.
- **Every clickable object** is an `<a>` or `<button>` with an accessible name and a visible label. On fine pointers the label shows on hover or focus; on coarse pointers or narrow screens (`(pointer: coarse), (max-width: 640px)`) it is always visible. A focus ring is required.
- **The sign beam** (the main navigation: Daily `/home`, Party `/party`, Scores `/scores`, Gallery `/u/:me` or sign-in) is on every `(app)` screen. Navigation must never depend on finding an object.
- **Motion:**
  - The drawable easel never moves; only the booster flames flicker.
  - The bob plays only on the porch view and during the zoom.
  - `prefers-reduced-motion` freezes ambient animation and makes the zoom instant.
  - The animation loop pauses when the tab is hidden and never re-renders the drawing canvas (`PixelCanvas`).
- **No keyboard-shortcut text** anywhere in the UI.
- **Prerender:** `/` must render with no browser APIs at render time (no `window`, `Date.now`, `Math.random`). Canvas drawing happens in effects, and scene RNG is seeded.
- **Keep every existing `data-testid`** (inventory: `docs/superpowers/plans/2026-11-18-pr3-testids.md`) on the element with the same role.
- **Existing layout tests must keep passing:**
  - 1280×720: the canvas, palette and Grade now/Ask bottoms stay at or under 720 px.
  - 1440×900: canvas width is at least 576.
  - 375×812: no horizontal scroll.
  - Room intermission controls stay contained in the canvas frame.
  - Canvas width doesn't change with vertical page height.
  Adjust a test only where an element legitimately moved, and say so in the report.
- **Contrast:** WCAG AA for panel text.
- **Screenshots:** each UI task ends with `SCREENSHOTS=1` captures at 1440×900, 1280×720 and 375×812 into `docs/superpowers/screenshots/2026-11-18-porch/`, and the implementer looks at every image before reporting.
- **No new runtime dependencies** except an optional self-hosted `@fontsource/*` pixel font for display text, if VT323 reads poorly in panels. That's the builder's call; record the choice.
- Don't change game logic, scoring formulas, the judge or the server.
- **Pixel-size rule:** the scene renders at an integer scale. Expose it as the CSS variable `--px` (an integer number of CSS pixels per scene pixel, minimum 2). Panel borders, shadows, icon pixels and in-scene text sizes are whole multiples of `--px`, so every pixel on screen is the same size. Nothing that stands in for a scene object (signs, the beam, the easel) may be a plain CSS box; draw those as sprites.
- **Two compositions:** `landscape` (320×180 scene px, used when the viewport aspect is at least 1) and `portrait` (180×320 scene px, used below 1). Each has its own object layout in `src/scene/porch/layout.ts` (and later `beach/layout.ts`). The portrait porch stacks the beam, then the easel in the centre, with the objects arranged around and below it. Every object stays at least 44 CSS px and labelled.
- **Loading:** whenever the Daily state (or a room's) isn't known yet, show one neutral loading view: the sunset sky and sea only, with no porch objects and no easel, plus "Setting up your easel…" (`daily-loading`). It then resolves to either the porch or the zoomed play screen, never porch first then zoomed. This is the only loading view.
- **Presentational scenes:** `PorchScene` and `BeachLobby` take plain props (easel state, top three, targets, signed-in flag, callbacks) and never call auth, query or daily hooks. `home.tsx` and `party.tsx` wire the data. `/` renders `PorchScene` with static signed-out props and no DeepSpace providers.
- **Art source of truth:** `src/scene/palette.ts` (the master palette and colour ramps) and `docs/superpowers/specs/porch-art-rules.md` (the pixel-art rules). Read both before drawing anything, and use only palette colours in sprites.

## Review Focus

1. **Keyboard-only use.** Tabbing through the porch reaches every object in a sensible order, with visible labels and focus rings, and Enter activates it. Covered by Task 3's `porch keyboard tour`.
2. **Reduced motion.** With `prefers-reduced-motion: reduce`, nothing animates and Start shows the play screen immediately. Covered by Task 1 unit tests and Task 3's offline `reduced motion start`.
3. **Mid-play reload or deep link.** Opening `/home` mid-attempt (or `/r/:code` mid-round) starts already zoomed, with no zoom animation and no porch flash. Covered by Task 4's `reload mid-attempt starts zoomed`.
4. **Narrow phones (375×812).** The porch crops around the easel, every object stays labelled and tappable (44 px minimum target), and there's no horizontal scroll. Covered by the Task 3 and Task 5 screenshot assertions.
5. **Signed out.** The porch works fully, the easel offers "Sign in to paint", and the mailbox offers sign-in. Covered by Task 3's `signed-out porch`.

---

### Task 1: Scene engine

**Files:**
- Create: `src/scene/sprite.ts`, `src/scene/procedural.ts`, `src/scene/PixelScene.tsx`, `src/scene/Hotspot.tsx`, `src/scene/camera.ts`, `src/scene/useSceneClock.ts`
- Test: `src/scene/sprite.test.ts`, `src/scene/camera.test.ts`, `src/scene/hotspot.test.ts`

**Interfaces (produced):**
```ts
// sprite.ts
export interface Sprite { w: number; h: number; rows: readonly string[]; palette: Readonly<Record<string, string>> } // '.' = transparent
export function defineSprite(rows: readonly string[], palette: Record<string, string>): Sprite // validates equal row widths, unknown chars throw
export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, opts?: { flipX?: boolean }): void
// procedural.ts — all take a seeded rng; frame drives animation
export function mulberry32(seed: number): () => number
export function drawSunsetSky(ctx, w: number, horizonY: number, frame: number): void
export function drawSea(ctx, w: number, top: number, h: number, sunX: number, frame: number, rng): void
export function drawSun(ctx, cx: number, cy: number, r: number, horizonY: number): void
// camera.ts
export interface Rect { x: number; y: number; w: number; h: number } // scene px (320×180)
export interface Camera { x: number; y: number; zoom: number }
export type Composition = 'landscape' | 'portrait'
export function compositionFor(viewportW: number, viewportH: number): Composition
export function sceneSize(c: Composition): { w: number; h: number } // 320×180 | 180×320
export function integerScale(viewportW: number, viewportH: number, c: Composition): number // max(2, ceil(cover scale)); the crop absorbs the overflow
export function cameraFor(focus: Rect | null, target: { x: number; y: number; w: number; h: number } | null, viewport: { w: number; h: number }, c: Composition): Camera // null focus = wide view; target = the measured on-screen box (CSS px) the focus rect must land on
export function cameraTransform(c: Camera): string                                // CSS transform for the wrapper
export function rectToPercent(r: Rect, c: Composition): { left: string; top: string; width: string; height: string }
// useSceneClock.ts
export function useSceneClock(fps?: number /* default 12 */): number // frame counter; frozen at 0 under reduced motion; paused when document.hidden
// PixelScene.tsx
export function PixelScene(props: { draw: (ctx: CanvasRenderingContext2D, frame: number, c: Composition) => void; camera?: Camera; zoomMs?: number /* default 600 */; children?: React.ReactNode /* hotspots + overlays */; className?: string; 'data-testid'?: string }): JSX.Element
// Hotspot.tsx
export function Hotspot(props: { rect: Rect; label: string; href?: string; onClick?: () => void; testId?: string; children?: React.ReactNode }): JSX.Element
```
`PixelScene` picks the composition from its measured box, renders a canvas at `sceneSize` scaled by `integerScale` (cover-cropped and centred), sets `--px` on its root, and passes the composition to `draw`, so `draw(ctx, frame, composition)` is the signature. Drawing runs only in effects.

- [ ] **Step 1: Write the failing tests:**
  - `defineSprite rejects ragged rows`
  - `defineSprite rejects unknown palette char`
  - `cameraFor(null) is identity` (`{x:0,y:0,zoom:1}`)
  - `cameraFor maps focus onto target`: rect `{x:104,y:26,w:96,h:96}` (landscape) with target `{x:500,y:120,w:576,h:576}` at viewport 1440×900 → the transformed rect's on-screen box equals the target within 1 px
  - `compositionFor`: 1440×900 → landscape; 375×812 → portrait
  - `integerScale`: equals `Math.ceil(Math.max(vw / w, vh / h))` (cover, integer, the crop absorbs the overflow), never below 2; 1440×900 landscape → 5; 375×812 portrait → 3
  - `rectToPercent` (`{x:32,y:18,w:64,h:36}`, landscape → `left:'10%', top:'10%', width:'20%', height:'20%'`)
  - `mulberry32 is deterministic` (same seed → same first 5 values)
- [ ] **Step 2: Run** `npm run test:unit -- src/scene`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scene): pixel scene engine, sprites, camera and hotspots`.

### Task 2: Porch theme and sign-beam navigation

**Files:**
- Create: `src/scene/palette.ts` (master palette: named colour ramps for sky, sea, sun, wood, paper, foliage, skin, metal, flame and UI, following `docs/superpowers/specs/porch-art-rules.md`; `themes.css` tokens must use these same hex values)
- Modify: `src/themes.css` (replace the `arcade` tokens with a `porch` theme: warm sunset sky, wood browns, cream paper, coral accent, teal sea; restyle `.pp-panel`, `.pp-frame`, `.pp-chip`, `.pp-btn`, `.pp-logo`, `.pp-word`, `.pp-danger*`, `.pp-results*` and the focus-ring group as wood and paper pixel panels with hard 1-step pixel shadows), `src/themes.ts` (id `porch`, name "Porch at Sunset"), `index.html` (`data-theme="porch"` and the pre-JS background colour), `src/styles.css` (`@layer base` body background → sunset gradient; `color-scheme: light`; `@theme` colour tokens to porch values)
- Modify: `src/components/Navigation.tsx` → the sign beam: a wooden beam strip with hanging signs (Daily, Party, Scores, Gallery), the active sign lit by a lantern, plus a mailbox button for the account menu (Sign in / My gallery / Settings / Sign out). Keep testids `app-navigation`, `nav-user-name`, `nav-user-email`, `nav-sign-in-button` and the mobile drawer.
- Modify: `src/nav.ts` (Daily `/home`, Party `/party`, Scores `/scores`, Gallery; the Public Board entry moves to the lighthouse object)
- Create: `src/pages/(app)/scores.tsx` as a temporary stub rendering the existing `Leaderboard` in a `.pp-panel` (Task 7 builds the real page), so the beam has no dead link.
- Test: `tests/offline/pixel.spec.ts` (nav assertions), plus a new `tests/offline/porch.spec.ts`

- [ ] **Step 1: Write the failing offline tests:**
  - `sign beam has four signs`: links named Daily, Party, Scores, Gallery are visible at 1280×720; at 375×812 they're reachable through the drawer.
  - `active sign marked`: on `/party` the Party sign has `aria-current="page"`.
  - `mailbox menu`: signed in, it shows My gallery, Settings and Sign out.
- [ ] **Step 2: Run** `npm run build && npx playwright test tests/offline/porch.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use the mockup palette as a starting point; panels read as painted wood and paper.
- [ ] **Step 4: Run** the same command, then `npm run verify` and the full `npx playwright test tests/offline`. Expected: PASS. Take screenshots of `/party` and `/settings`, look at them, and list them in the report.
- [ ] **Step 5: Commit** `feat(theme): porch theme and sign-beam navigation`.

### Task 3: The porch scene (home and landing)

**Files:**
- Create: `src/scene/porch/sprites.ts` (easel with three boosters and flames, chalkboard on an A-frame, mailbox with flag, front door with window, radio, pinned note, lantern, porch beam, posts, railing, floor planks, steps down to the beach, lighthouse, distant island, a sleeping cat, a potted plant), `src/scene/porch/drawPorch.ts` (`drawPorch(ctx, frame, opts: { easelState: 'draped' | 'cover' | 'finished' | 'signin'; bob: boolean }): void`), `src/scene/porch/layout.ts` (exported `Rect`s for every object, in one place), `src/components/porch/PorchScene.tsx`, `src/components/porch/RulesNote.tsx` (popover with the scoring recipe from PR 1's not-started copy), `src/hooks/useMute.ts`
- Modify: `src/pages/(app)/home.tsx` (the loading state renders the neutral sky view from Global Constraints; non-playing known states render `PorchScene`; the existing not-started, ended, signed-out and loading content moves into easel-anchored panels; keep testids `daily-page`, `daily-loading`, `daily-signed-out`, `daily-sign-in-button`, `daily-not-started`, `daily-start-button`, `daily-ended`), `src/pages/index.tsx` (static porch: the same scene with signed-out objects, SEO copy as readable notes or panels in the scene, CTAs `landing-play-now` → `/home` and `landing-browse-lobby` → `/party` kept as hotspots; `static-landing` kept), `src/components/daily/useDailySounds.ts` and `src/components/game/useGameSounds.ts` (read and write mute through `useMute`)
- Test: `tests/offline/porch.spec.ts`, `tests/offline/daily.spec.ts`, `src/hooks/useMute.test.ts`

**Interfaces:**
- `useMute(): { muted: boolean; toggle(): void }`: one app-wide mute backed by the existing sfx localStorage key, synced across hooks and tabs (a `storage` event plus an in-tab event). The radio, the play-screen radio icon and `MuteButton` all use it.

The porch objects (hotspot, then target):

| Object | Goes to |
|---|---|
| Easel | today's state: Start (`daily-start-button`), Resume (zoom in), View result (zoom in, read-only), or Sign in |
| Chalkboard | today's top 3 (live) → `/scores` |
| Steps | `/party` |
| Lighthouse | `/r/play` |
| Mailbox | account menu, or sign in |
| Door | `/u/:me`, or sign in |
| Radio | `useMute().toggle` (aria-pressed) |
| Note | `RulesNote` |

- [ ] **Step 1: Write the failing tests:**
  - `useMute syncs two hook instances`
  - offline `porch objects present`: every hotspot is visible by accessible name on `/home` at 1280×720
  - `porch keyboard tour`: Tab visits the objects in order, each with a focus ring and label, and Enter on Steps navigates to `/party`
  - `signed-out porch`: the easel shows "Sign in to paint" and the mailbox offers sign-in
  - `neutral loading view`: while `/api/daily/me` is delayed, `daily-loading` is shown with no porch hotspots and no `daily-start-button`
  - `landing is the porch`: `/` prerendered HTML contains `static-landing` and the landing CTAs
  - `375 no horizontal scroll` on `/` and `/home`
- [ ] **Step 2: Run** `npm run test:unit -- src/hooks/useMute.test.ts` and `npm run build && npx playwright test tests/offline/porch.spec.ts tests/offline/daily.spec.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Art quality bar: detailed, intentional pixel art in the porch-scene mockup's composition (sky bands with dithering, a sun on the horizon with its reflection, shimmering water, wood grain, warm light). The easel bobs only here.
- [ ] **Step 4: Run** the same commands plus `npm run verify`. Expected: PASS. Take screenshots of `/`, and of `/home` signed out, not-started and ended, at all three sizes; look at them and list them.
- [ ] **Step 5: Commit** `feat(porch): porch scene home and landing`.

### Task 4: The Daily play screen (zoom into the easel)

**Files:**
- Create: `src/components/play/PlayLayout.tsx` (slots: `top`, `left`, `canvas`, `right`, `bottom`, with the scene behind; the layout follows `play-zoomed-v5.html`), `src/components/play/HoverEasel.tsx` (a sprite easel with boosters; flames animate, the body stays still; the canvas slot sits on the board), `src/components/play/ScoreCard.tsx` ("How you're scored": PR 1's three bars, total and judge reason, restyled)
- Modify: `src/pages/(app)/home.tsx` (playing state = camera focused on the easel's `Rect` and `PlayLayout`; Start triggers the zoom; Exit zooms out to the porch, replacing PR 1's `/party` target; keep the Exit confirm copy, `daily-exit`, `daily-playing`, `daily-prompt`, `daily-timer`, `daily-ask-button`, `daily-done-button`, `toolbar`, `palette`, `pixel-canvas`, `daily-score-breakdown`, `grade-total`, `daily-best-score`), `src/components/daily/AutoGradeTimeline.tsx`, `GradePanel.tsx` and `src/components/game/ToolBar.tsx` / `Palette.tsx` (restyle only: labelled pixel icons, palette bar with black and white first, the selected swatch raised and outlined)
- Test: `tests/offline/daily.spec.ts`, `tests/offline/screenshots.spec.ts`

**Zoom and easel rules (decided):**
- On the porch, the easel is the scene sprite.
- On Start, the camera zooms (600 ms) so the scene easel's board lands on the measured `pixel-canvas` target box from `PlayLayout`. Measure it with the play UI mounted but transparent.
- At the end of the zoom, the scene stops drawing its easel, and `HoverEasel` (HTML/canvas around the real canvas) takes over, crossfaded over about 150 ms. A pixel-exact match isn't required.
- Exit reverses this.
- **Fit:** the canvas bounds tests win. `HoverEasel` is compact: a thin board frame, a top clamp, a tray and short legs. At 1440×900 the whole easel including the boosters must be in the viewport (assert it). At 1280×720 and below, the legs and boosters may tuck behind the palette bar, but the board frame and tray must stay visible (assert the frame box contains the canvas box). The portrait play screen stacks the top bar, canvas on easel, tools row, palette row and a score drawer.

- [ ] **Step 1: Write the failing offline tests:**
  - `easel fits`: at 1440×900 the easel element (`data-testid="hover-easel"`) box is within the viewport; at 1280×720 its frame contains `pixel-canvas`
  - `start zooms into easel`: after Start, `daily-playing` is visible and the scene camera is focused (assert a `data-camera="easel"` attribute)
  - `exit returns to porch`: confirm Exit → porch hotspots visible, URL `/home`
  - `reload mid-attempt starts zoomed`: only the neutral loading view, then the play screen; no porch hotspots are rendered at any point (poll during load)
  - `reduced motion start`: with `page.emulateMedia({ reducedMotion: 'reduce' })`, the play screen is visible within 100 ms of Start
  - `easel still while playing`: the easel element's bounding box is identical across 1 s
- [ ] **Step 2: Run** `npm run build && npx playwright test tests/offline/daily.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run verify`, the full offline suite and `SCREENSHOTS=1 npx playwright test tests/offline/screenshots.spec.ts` (the existing bounds assertions must pass). Expected: PASS. Look at the screenshots of every daily state at all three sizes.
- [ ] **Step 5: Commit** `feat(play): zoomed daily play screen on the hovering easel`.

### Task 5a: Party scoring parts

(The noop-ack fix parked from PR 2 lands separately on PR #10's branch; it isn't part of this plan.)

**Files:** Modify `src/game/scoring.ts` (add `coopScoreParts(p): { pixels: number; time: number; total: number }`, the two 500-point halves of `coopScore`; `total` must equal `coopScore(p)`, with rounding applied so `pixels + time === total`). Test: `src/game/scoring.test.ts`.

- [ ] **Step 1:** Failing test `coopScoreParts sums to coopScore` (3 fixtures, including clamped extremes). **Step 2:** Run `npm run test:unit -- src/game/scoring.test.ts` → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat(scoring): co-op score parts`.

### Task 5b: The beach lobby

**Files:**
- Create: `src/scene/beach/sprites.ts`, `src/scene/beach/layout.ts` (landscape and portrait), `src/scene/beach/drawBeach.ts` (beach at sunset, bonfire, easels with pennants, lighthouse, signpost), `src/components/beach/BeachLobby.tsx` (presentational)
- Modify: `src/pages/(app)/party.tsx`:
  - Room cards become easels around the bonfire (`room-card-*`, `public-rooms-list`).
  - The featured public board is the lighthouse (`room-card-play`, `lobby-play-now`).
  - The create form is a wooden sign, "Set up an easel" (`create-room-form`, `create-room-name`, `visibility-*`, `create-room-submit`, `create-room-signin`).
  - Join-by-code is a signpost (`join-room-form`, `join-code-input`, `join-code-submit`).
  - `DeleteRoomButton` is relabelled "Pack up easel".
  - More rooms than the easels shown → overflow into a scrollable "More easels" list.
- Test: `tests/offline/pixel.spec.ts` (lobby cases)

- [ ] **Step 1:** Failing offline tests: `lobby easels link to rooms`, `lighthouse opens public board`, `signpost joins by code`, `create sign creates room`, `375 lobby no horizontal scroll`. **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `npm run verify`, the offline suite and screenshots → PASS; look at every lobby screenshot. **Step 5:** Commit `feat(beach): party lobby on the beach`.

### Task 5c: Rooms on the beach

**Files:**
- Create: `src/components/play/CriticBubble.tsx` (wraps `GuessFeed` as the critic's speech bubble; the critic is a sprite, for example a gull in a beret), `src/components/play/PartyScoreNote.tsx`
- Modify: `src/pages/(app)/r/[code].tsx`:
  - The lobby is beach chairs (one per painter) facing the easel, with "Start painting" for the host (`room-lobby`, `round-players`, `round-watching`, `host-start-button`).
  - Play uses `PlayLayout` and `HoverEasel`. The top bar holds the word, timer and px, the invite ticket ("Copy link"), `host-next-button`, `mute-button` and a new "Back to the beach" link (`data-testid="room-exit"` → `/party`). Left: ToolBar (Paint, Erase, Pick colour) and PlayersPanel. Right: CriticBubble, Ask the AI and PartyScoreNote. Banners keep their testids.
  - Results become a framed painting card on a stand, with "Pixels saved: N/500" and "Time saved: N/500" from `coopScoreParts`, plus the plaque buttons `overlay-dismiss` and `overlay-next` (intermission controls stay inside the canvas frame, as the tests require).
  - The error states (`room-error-*`) become small scenes with "Back to the beach".
- Test: `tests/offline/pixel.spec.ts`

**PartyScoreNote copy (exact):** "Fewer pixels and a faster guess score higher. The round ends when the critic guesses the word."

- [ ] **Step 1:** Failing offline tests: `room exit returns to beach`, `lobby shows chairs per painter`, `results show pixels and time saved`, with all existing pixel.spec layout tests unchanged. **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `npm run verify`, the offline suite and screenshots → PASS; look at the room lobby, play, results and error screenshots at all three sizes. **Step 5:** Commit `feat(beach): rooms on the beach`.

### Task 6: Remaining screens and PR 3 wrap-up

**Files:**
- Modify: `src/pages/(app)/(protected)/settings.tsx` (a letter from the mailbox: name, email, Sign out), `src/pages/[...all].tsx` (a "You wandered off the boardwalk" scene with "Go home"), `src/pages/(app)/(protected)/_layout.tsx` (signed-out panel restyle), `src/components/ErrorScreen.tsx` and `src/pages/(app)/(protected)/api-status.tsx` (plain porch-wood panels; content unchanged)
- Modify: `docs/progress.md`

- [ ] **Step 1:** Restyle the screens.
- [ ] **Step 2: Run** `npm run verify`, `npm run build && npx playwright test tests/offline` and the screenshot suite. Expected: PASS. Look at every screenshot.
- [ ] **Step 3:** Append the progress entry. Commit `feat(porch): remaining screens restyled`.

### Task 7 (PR 4): Scores page

Branch `t3/pr4-scores-gallery` from the PR 3 head.

**Files:**
- Modify: `src/pages/(app)/scores.tsx` (the full page: a close-up chalkboard scene, `Leaderboard` restyled as chalk on slate, day paging arrows as chalk arrows, rows linking to `/u/:userId`), `src/components/daily/Leaderboard.tsx` (filter out rows with `score === 0` and no guess), `src/pages/(app)/home.tsx` (remove any leftover leaderboard; the chalkboard object links to `/scores`)
- Test: `tests/offline/porch.spec.ts`

- [ ] **Step 1: Write the failing offline tests:** `scores page lists today`, `day paging works`, `never-graded attempts hidden`.
- [ ] **Step 2: Run** and confirm they FAIL. **Step 3: Implement.** **Step 4: Run** `npm run verify`, the offline suite and screenshots. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scores): chalkboard scores page`.

### Task 8 (PR 4): Gallery wall

**Files:**
- Modify: `src/pages/(app)/u/[userId].tsx` (inside the house: a wall with framed drawings showing date, prompt, score, medal and the judge's guess; hide never-graded attempts; the owner sees "Your gallery"; the empty state is a blank wall with "Paint today's prompt" → `/home`)
- Test: `tests/offline/porch.spec.ts`

- [ ] **Step 1: Write the failing offline tests:** `gallery shows framed dailies newest first`, `never-graded hidden`, `door opens own gallery`.
- [ ] **Step 2–4:** Run (FAIL), implement, run `npm run verify`, the offline suite and screenshots (PASS), and look at the screenshots.
- [ ] **Step 5:** Append the progress entry. Commit `feat(gallery): gallery wall profiles`.
