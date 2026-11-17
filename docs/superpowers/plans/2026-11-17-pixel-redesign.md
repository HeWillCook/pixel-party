# Pixel Party Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin Pixel Party into the agreed 80s synthwave pixel look (VT323, Navy glow, Sunset accents), make the canvas big and centered, and add a watcher count, a running guess log and chiptune sound effects with a mute button.

**Architecture:** Logic first, in small pure, tested units (watcher count on the server and protocol, guess log in the client reducer, sound-event detection and a Web Audio module). Then the theme is rewritten once as tokens and shared CSS building blocks, and the room page and every other screen are swept onto them. Two lanes: Lane L (Tasks 1–3, logic) and Lane V (Task 4, theme) run in parallel, because they touch no common files. Tasks 5–6 (visual sweep) start after both lanes are merged, because they render the new state fields.

**Tech Stack:** React 19, Tailwind v4 with the shadcn CSS variables, Vitest, Playwright, Cloudflare Durable Objects (DeepSpace `BaseRoom`), Web Audio API, `@fontsource/vt323`.

**Spec:** `docs/superpowers/specs/2026-11-17-pixel-redesign-design.md` (the visual reference is `docs/superpowers/specs/2026-11-17-pixel-redesign-reference.html`; open it in a browser).

## Global Constraints

- `PALETTE` in `src/game/config.ts` is unchanged.
- No change to the judge, scoring, AI budget or room `playerCount`. The only server change is the watcher count (Task 1).
- Every existing `data-testid` keeps working. Exactly one element per rendered branch carries `round-players`, with the text "N painter(s)".
- Font: VT323 for all text, bundled via `@fontsource/vt323`, fallback `'VT323', ui-monospace, monospace`. No `font-bold`/`font-extrabold`/`font-semibold` on VT323 text.
- Body text about 20px, set on `body` in `src/styles.css`. Never change the `html` root font size.
- Square corners: `--radius: 0`, and no `rounded-*` on themed surfaces.
- Background `radial-gradient(ellipse at 50% 0%, #1e1b4b 0%, #0a0814 60%)` over `#0a0814`. No texture, scanlines or imagery anywhere.
- Sunset tokens are exactly the spec's token table (`#fde68a`, `#fb923c`, `#ec4899`, `#8b5cf6`, `#be185d`, `#fbcfe8`, `#fef3c7`, panel `#14061fd9`, button `#fb923c → #db2777`).
- Sound: only `guess`, `tick`, `win`, `timeout`. Never on pixel placement, initial load or reconnect. No music.
- `npm run verify` and the offline Playwright suite (`npx playwright test -c tests/offline.playwright.config.ts`) pass after every task.

## Review Focus

1. Reconnect mid-round (same round id): the guess log keeps its entries, and the next judgement repeating the same guesses adds no entry and plays no sound.
2. Joining a room already in intermission or showing a result: no win or time's-up sound, because there was no live transition.
3. Several tabs of the same signed-in user plus a signed-out tab: painters 1, watching 1.
4. A narrow (375px) or short (1280×720) viewport: the canvas shrinks to a whole cell size, never overflows horizontally, and never renders at a fractional cell size (blurry pixels).
5. `localStorage` throwing (private mode): the mute button still works for the session, and sound defaults to on.

Each line has a pinning test in Tasks 1, 2, 3 and 5.

---

## File structure

| File | Task | Responsibility |
| --- | --- | --- |
| `src/game/protocol.ts` | 1 | add optional `watching` to the `snapshot` and `players` messages |
| `src/server/pixel-room.ts` | 1 | compute `watcherCount()`, include it wherever `players`/`snapshot` are sent |
| `src/game/client-state.ts` | 1, 2 | store `watching`; store `guessLog` |
| `src/game/sound-events.ts` (new) | 3 | pure: which sound events a state transition implies; the countdown tick |
| `src/lib/sfx.ts` (new) | 3 | Web Audio tone synth, mute persistence, unlock on first interaction |
| `src/components/game/useGameSounds.ts` (new) | 3 | hook: watches `ClientState`, calls `sfx` |
| `src/components/game/MuteButton.tsx` (new) | 3 | the mute toggle |
| `src/game/board-size.ts` (new) | 5 | pure canvas cell-size rule |
| `src/themes.css`, `src/styles.css`, `src/themes.ts`, `index.html`, `src/main.tsx`, `package.json` | 4 | tokens, building blocks, font, dead themes removed |
| room page and `src/components/game/*` | 5 | new layout, Players panel, log feed, mute button, restyle |
| landing, home, error, settings, api-status, `src/components/ui/*`, `Navigation.tsx` | 6 | restyle onto tokens |

---

### Task 1: Watcher count (Lane L, Codex)

**Files:**
- Modify: `src/game/protocol.ts` (`ServerMsg` union: `snapshot` and `players` members)
- Modify: `src/server/pixel-room.ts` (next to `playerCount()`/`playerRoster()`, about lines 205–217; every `t: 'players'` send at about lines 120 and 153; `snapshot()` at about line 230)
- Modify: `src/game/client-state.ts`
- Test: `src/server/pixel-room.test.ts`, `src/game/client-state.test.ts`

**Interfaces:**
- Produces: `ServerMsg` `snapshot` and `players` gain `watching?: number`. `ClientState.watching: number` (initially `0`). The `players` and `snapshot` reducer cases set `watching: m.watching ?? 0`.
- Produces: `PixelRoom` private `watcherCount(exclude?: WebSocket): number` = the number of `liveSockets(exclude)` whose attachment has no signed-in id (`signedInId(...) === null`).

- [ ] **Step 1: Write failing server tests** in `pixel-room.test.ts`, using the existing harness pattern from "broadcasts instant solo placements, rejects spectators…" (about line 284):
  - `it('counts signed-out sockets as watchers in snapshot and players messages')`: connect the signed-in user A twice and one signed-out socket. Expect the latest `players` message `toMatchObject({ count: 1, watching: 1 })`, and the signed-out socket's `snapshot` `toMatchObject({ players: 1, watching: 1 })`.
  - `it('re-broadcasts players when a watcher leaves')`: close the signed-out socket. Expect the remaining sockets' last message `toEqual({ t: 'players', count: 1, roster: [...], watching: 0 })`.
  - Update the existing exact `toEqual({ t: 'players', count: 0, roster: [] })` assertions (about lines 430 and 521) to include the correct `watching` value. Don't loosen them.
- [ ] **Step 2: Write a failing client test** in `client-state.test.ts`: `it('stores watching from players and snapshot, defaulting to 0')`.
- [ ] **Step 3: Run** `npx vitest run src/server/pixel-room.test.ts src/game/client-state.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 4: Implement** `watcherCount`, add `watching: this.watcherCount(exclude)` to every `players` broadcast and to `snapshot`, add the optional field to the protocol, and handle it in the reducer. Do not pass the watcher count into `advance`, `applyPlacements`, `withRoomStatus` or any AI or budget path.
- [ ] **Step 5: Run** `npm run verify`. Expected: PASS.
- [ ] **Step 6: Commit** with the message `feat: watcher count for signed-out viewers`.

### Task 2: Running guess log (Lane L, Codex)

**Files:**
- Modify: `src/game/client-state.ts` (`judgement`, `round` and `snapshot` cases)
- Test: `src/game/client-state.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GuessLogEntry { id: number; atMs: number; guesses: string[]; matched: boolean }
  // ClientState gains: guessLog: GuessLogEntry[]  (newest first), guessLogRoundId: string | null
  ```
  `atMs` = `now - round.startedAt`, clamped at ≥ 0. The reducer is `applyServerMsg(s: ClientState, m: ServerMsg)` (`client-state.ts:104`) and has no clock. Add a third parameter, `now: number = Date.now()`, so existing call sites stay valid and tests pass a fixed value. `id` increases monotonically, for React keys.

Rules:
- On `judgement`: append an entry (at the front) only if `m.guesses` contains at least one string (case-insensitive, trimmed) not present in any entry already in `guessLog`, or if `m.matched` is true and no entry is matched yet. Keep at most 50 entries.
- On `round` with a new round id: clear `guessLog` and set `guessLogRoundId`.
- On `snapshot`: keep `guessLog` if `m.round.id === guessLogRoundId`, otherwise clear it (Review Focus 1).
- The existing `guesses` field and its behavior stay, because other components and tests use it.

- [ ] **Step 1: Write failing tests:**
  - `it('appends a judgement with new guesses newest-first, stamped with round-relative ms')`: round `startedAt` 1000, judgement at now 16000 → `guessLog[0]` `toMatchObject({ atMs: 15000, guesses: ['tower','rocket'] })`.
  - `it('ignores a judgement that repeats already-logged guesses')`: same guesses in a different case and order → length unchanged.
  - `it('clears the log on a new round id and keeps it on a same-round snapshot (reconnect)')`.
  - `it('caps the log at 50 entries')`.
- [ ] **Step 2: Run** `npx vitest run src/game/client-state.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the rules above.
- [ ] **Step 4: Run** `npm run verify`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: per-round guess log in client state`.

### Task 3: Sound effects and mute (Lane L, Codex)

**Files:**
- Create: `src/game/sound-events.ts`, `src/game/sound-events.test.ts`
- Create: `src/lib/sfx.ts`, `src/lib/sfx.test.ts`
- Create: `src/components/game/useGameSounds.ts`, `src/components/game/MuteButton.tsx`

**Interfaces:**
- Consumes: `ClientState.guessLog` (Task 2), `ClientState.round`, `ClientState.snapshotLoaded`.
- Produces:
  ```ts
  // src/game/sound-events.ts
  export type SoundName = 'guess' | 'tick' | 'win' | 'timeout'
  export function soundEventsFor(prev: ClientState, next: ClientState): SoundName[]
  export function countdownTickSecond(round: RoundView | null, now: number): number | null // 1..5 while playing with endsAt set, else null
  // src/lib/sfx.ts
  export const MUTE_KEY = 'pixel-party:muted'
  export interface Sfx { play(name: SoundName): void; unlock(): void; isMuted(): boolean; setMuted(m: boolean): void }
  export function createSfx(opts?: { audioContext?: () => AudioContext; storage?: Pick<Storage,'getItem'|'setItem'> }): Sfx
  // src/components/game/useGameSounds.ts
  export function useGameSounds(state: ClientState): { muted: boolean; toggleMute: () => void }
  // src/components/game/MuteButton.tsx
  export function MuteButton(props: { muted: boolean; onToggle: () => void }): JSX.Element // data-testid="mute-button", aria-pressed={muted}, aria-label "Mute sounds" / "Unmute sounds", lucide Volume2 / VolumeX
  ```

Rules for `soundEventsFor`:
- It returns `[]` unless `prev.snapshotLoaded && next.snapshotLoaded && prev.round?.id === next.round?.id`. That rules out the initial load and new rounds.
- `guess` when `next.guessLog.length > prev.guessLog.length` and the new front entry is not `matched`.
- `win` when the round leaves `'playing'` and `next.round.result?.outcome` is `'won'` or `'teamWin'`. When this fires, `guess` is not returned.
- `timeout` when the round leaves `'playing'` with outcome `'timeout'`.

Other behavior:
- `useGameSounds` keeps the previous state in a ref and calls `soundEventsFor` on every state change. It runs a 250ms interval that calls `countdownTickSecond` and plays `tick` once per distinct second value. It registers a one-time `pointerdown`/`keydown` listener that calls `sfx.unlock()`, which creates or resumes the `AudioContext`. Nothing plays before unlock.
- `createSfx`: muted state is read from `storage` (`'1'` = muted). Every storage call is wrapped in try/catch. When storage is unavailable, it defaults to unmuted and still toggles in memory (Review Focus 5). Tones are square or triangle oscillators with short gain envelopes, master gain ≤ 0.15. Each tone: `guess` is a two-note up blip, `tick` a single short high blip, `win` a 4–5 note rising arpeggio of about 0.8s, and `timeout` a two-note falling tone. Exact pitches are the implementer's choice.

- [ ] **Step 1: Write failing tests in `sound-events.test.ts`:**
  - `it('returns nothing on the first snapshot or a new round id')`.
  - `it('returns guess when a non-matched log entry is added')`.
  - `it('returns only win, not guess, when a matched judgement ends the round')`.
  - `it('returns timeout when playing ends with outcome timeout')`.
  - `it('returns nothing when joining a room already in intermission')`: prev is not `snapshotLoaded` (Review Focus 2).
  - `it('countdownTickSecond gives 5..1 in the last five seconds and null otherwise')`.
- [ ] **Step 2: Write failing tests in `sfx.test.ts`** with a fake `AudioContext` (record `createOscillator` calls) and fake storage:
  - `it('plays nothing before unlock')`.
  - `it('plays after unlock and not while muted')`.
  - `it('persists mute to storage under pixel-party:muted')`.
  - `it('defaults to unmuted and still toggles when storage throws')`.
- [ ] **Step 3: Run** `npx vitest run src/game/sound-events.test.ts src/lib/sfx.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the four files. `MuteButton` uses the existing `Button` component. Don't mount it or the hook in the room page yet; Task 5 does that.
- [ ] **Step 5: Run** `npm run verify`. Expected: PASS.
- [ ] **Step 6: Commit** with the message `feat: chiptune sound events and mute control`.

### Task 4: Theme, font and building blocks (Lane V, Gemini; parallel with Tasks 1–3)

**Files:**
- Modify: `package.json` (add `@fontsource/vt323`), `src/main.tsx` or `src/styles.css` (import `@fontsource/vt323/400.css`)
- Modify: `src/themes.css`, `src/styles.css`, `src/themes.ts`, `index.html`

**Interfaces:**
- Produces CSS custom properties on `[data-theme="arcade"]`: `--sunset-1` to `--sunset-4`, `--word-shadow`, `--soft-text`, `--panel-bg`, `--sunset-gradient` (`linear-gradient(180deg,#fde68a,#fb923c 55%,#ec4899)`), `--frame-gradient` (`linear-gradient(135deg,#fde68a,#fb923c,#ec4899,#8b5cf6)`), `--button-gradient` (`linear-gradient(180deg,#fb923c,#db2777)`). The existing shadcn variables are remapped to these values, with `--radius: 0`.
- Produces utility classes for Tasks 5–6 (replace the old `.arcade-card`/`.arcade-btn`/`.font-pixel`; keep the old names as aliases only if that's simpler, mapped to the new styles):
  - `.pp-logo`: gradient-filled uppercase text with a 2px 2px hard shadow
  - `.pp-panel`: panel background, 3px `#ec4899` border, `0 5px 0 #0009`
  - `.pp-frame`: 10px gradient frame, `0 10px 0 #0009`
  - `.pp-chip`: dark fill, 2px `#f472b6` border, `#fde68a` text
  - `.pp-btn`: button gradient, 2px `#fff4` border, `0 4px 0 #000a`, press-down behavior from the old `.arcade-btn`
  - `.pp-word`: `#fde68a` with a 3px 3px `#be185d` shadow

Steps:
- [ ] **Step 1:** Install `@fontsource/vt323`. Set `body { font-family: 'VT323', ui-monospace, monospace; font-size: 20px; }`. Set the background to the Navy glow on `body`, with `#0a0814` on `html`. Make sure the font is fetched before first paint, using `font-display: block` via the fontsource import or a `<link rel="preload">` for the woff2 emitted by Vite.
- [ ] **Step 2:** Rewrite `[data-theme="arcade"]` and add the classes above. Delete the `slate` and `paper` blocks from `src/themes.css`, their entries from `src/themes.ts` (keep the `arcade` entry and the exported helpers), and their lines from the `index.html` inline style. Change the inline `html` background to `#0a0814`.
- [ ] **Step 3: Run** `npm run verify`. Expected: PASS. Then run `npm run build` and grep the built CSS for `VT323`. Expected: found, with a bundled `.woff2` asset and no `fonts.googleapis.com` reference anywhere in `dist`.
- [ ] **Step 4: Commit** with the message `feat: synthwave arcade theme tokens and VT323 font`.

### Task 5: Room page layout and component restyle (Gemini; after Tasks 1–4 are merged)

**Files:**
- Create: `src/game/board-size.ts`, `src/game/board-size.test.ts`
- Modify: `src/pages/(app)/r/[code].tsx`, `src/components/game/{PixelCanvas,Palette,RoundBar,GuessFeed,AskAiButton,PlayerCursors}.tsx`
- Create: `src/components/game/PlayersPanel.tsx`
- Test: `tests/pixel.spec.ts` (keep passing), screenshots

**Interfaces:**
- Consumes: `ClientState.watching` (Task 1), `ClientState.guessLog` (Task 2), `useGameSounds` and `MuteButton` (Task 3), and the `.pp-*` classes (Task 4).
- Produces:
  ```ts
  // src/game/board-size.ts
  export function boardCellSize(o: { availWidth: number; availHeight: number; cols: number; rows: number; maxSide?: number /* default 768 */; minCell?: number /* default 4 */ }): number
  // = max(minCell, floor(min(availWidth / cols, availHeight / rows, maxSide / max(cols, rows))))
  ```
  `PlayersPanel({ players, roster, watching })` renders the panel heading. Its count line carries `data-testid="round-players"` (text "N painter"/"N painters"), followed by roster names and a `data-testid="round-watching"` line, "N watching". This replaces the `round-players` element currently in `RoundBar` on the playing branch. The lobby branch keeps its own single `round-players`.

Steps:
- [ ] **Step 1: Write failing tests** in `board-size.test.ts`:
  - `it('fits 32x32 into 1440x900 chrome-adjusted space at 18px')`: `boardCellSize({availWidth: 700, availHeight: 600, cols: 32, rows: 32})` → `18`.
  - `it('caps the side at 768px')`: a huge space → `24`.
  - `it('uses the board aspect ratio for 64x32')`: `{availWidth: 700, availHeight: 600, cols: 64, rows: 32}` → `10`.
  - `it('never goes below minCell on tiny screens')`: `{availWidth: 100, ...}` → `4` (Review Focus 4).
- [ ] **Step 2: Run** `npx vitest run src/game/board-size.test.ts`. Expected: FAIL. Implement it, then expect PASS.
- [ ] **Step 3: Room layout.**
  - At ≥1024px, use a three-column grid: `PlayersPanel` | canvas column (round bar centered above, canvas in `.pp-frame`, palette row below) | `GuessFeed` with `AskAiButton`.
  - Below 1024px, stack: round bar, canvas, palette, feed with Ask, players.
  - `PixelCanvas` measures its available box (a `ResizeObserver` on the center column, height = `window.innerHeight` minus the measured header, round bar and palette heights) and sets the canvas CSS size to `cellSize * cols` × `cellSize * rows` with `image-rendering: pixelated`. Remove the `max-w-[min(100%,440px)]` cap.
  - Add `MuteButton` to the room header and call `useGameSounds(state)` once in the room page.
- [ ] **Step 4: GuessFeed.** Render `guessLog` newest first, each line as `M:SS` (from `atMs`, in `--sunset-3`) followed by the guesses joined with ", ". The panel scrolls internally. Keep `guess-feed`, `guess-list`, `guess-confidence` and `ai-resting-banner`. A matched entry is highlighted. When the log is empty, keep today's empty-state copy.
- [ ] **Step 5: Restyle** all game components and every room branch (loading, error and gate screens, lobby, spectator banner, reject notice, session-expired notice, round overlay) onto the `.pp-*` classes and tokens. Remove `amber-*`, `rose-*`, `emerald-*` and hardcoded hex colors in these files. Swatches come from `PALETTE`, with the selected swatch getting a 3px `#fde68a` outline. Keep every `data-testid` and the overlay's focus and keyboard handling.
- [ ] **Step 6: Run** `npm run verify` and `npx playwright test -c tests/offline.playwright.config.ts`. Expected: PASS. Fix any spec that queried `round-players` inside `round-bar` so it finds it in the Players panel, without changing the asserted text.
- [ ] **Step 7: Screenshots.** Capture the playing room at 1440×900, 1280×720 and 375×812, plus the lobby and the round overlay at 1440×900. Save them under `docs/superpowers/screenshots/2026-11-17-redesign/`. Check:
  - At 1440×900 and 1280×720, the canvas, palette and Ask button are visible without scrolling.
  - At 1440×900, the canvas side is ≥ 576px.
  - At 375px, there's no horizontal scroll.
- [ ] **Step 8: Commit** with the message `feat: big centered canvas and synthwave room page`.

### Task 6: Restyle the remaining screens (Gemini; after Task 5)

**Files:**
- Modify: `src/pages/index.tsx`, `src/pages/(app)/home.tsx`, `src/pages/[...all].tsx`, `src/pages/(app)/(protected)/{settings,api-status,_layout}.tsx`, `src/components/{Navigation,ErrorScreen}.tsx`, and `src/components/ui/*` where they hardcode colors or `rounded-*`

Steps:
- [ ] **Step 1:** Restyle onto the tokens and `.pp-*` classes, following the room's design language. The landing hero uses a large `.pp-logo`. Add no other decoration and no new content.
- [ ] **Step 2: Run** `rg -n "amber-|rose-|emerald-|rounded-(sm|md|lg|xl|full)|font-(bold|extrabold|semibold)" src --glob '*.tsx'`. Expected: no hits, except the ones listed in the commit message with a reason (for example, avatars that must stay round).
- [ ] **Step 3: Run** `npm run verify` and the offline Playwright suite. Expected: PASS. Add landing and home screenshots at 1440×900 and 375×812 to the screenshot folder.
- [ ] **Step 4: Commit** with the message `feat: synthwave restyle for landing, lobby and utility pages`.

### Task 7: Review and live check (Opus + Codex Sol)

- [ ] Codex `gpt-6.1-sol` (high) reviews the whole branch diff against the spec and this plan. The reviewer is from a different family than Gemini, the visual author.
- [ ] Opus compares the screenshots with the reference HTML, runs `npm run verify` and the offline suite, and does a hard reload on a prerendered `/` and on `/r/play` to confirm there's no flash.
- [ ] After merge to `main`, deploy from a clean checkout (`npx deepspace deploy`), then run `node scripts/ws-smoke.mjs https://pixel-party.app.space --yes`. Will listens for the four sounds and the mute button on the live site.
- [ ] Update `docs/progress.md` (decision row, agent log, verification log).
