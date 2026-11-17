# Pixel Party redesign: design

Status: draft for Will's approval (2026-11-17). Builder check done (OpenCode DeepSeek Flash); its questions are settled below. Visual reference: [`2026-11-17-pixel-redesign-reference.html`](2026-11-17-pixel-redesign-reference.html) (open it in a browser; it is the agreed look).

## Intent

Make Pixel Party look and sound like a classic game. Will's words: people should be reminded of classic games like Mario and Tetris, because pixel art makes people nostalgic, with an "80s, gradient-centric, cyberpunky feel". While drawing, the canvas should be bigger and centered. This is the last visual pass before the README and submission lock (about 2026-11-20), so it also has to make a strong first impression on the judges.

## Goals

- One consistent retro look across every screen: the landing page, the lobby/home page, the room (waiting room, playing, intermission), the error and gate screens, and settings.
- A bigger, centered canvas that is the visual focus of the room page.
- Chiptune sound effects for game moments, with a mute button.
- The theme is defined once (tokens and shared building blocks) so later screens (team mode, the daily puzzle) get the look for free.

## Non-goals

- No change to the drawing colors: `PALETTE` in `src/game/config.ts` stays exactly as is. Haiku's recognition was validated on those colors.
- No change to the worker, the judge, the scoring or the AI budget. **One narrow server exception (Will's call):** a watcher count for the Players panel (see Room layout). Nothing else in `src/server/` changes.
- No background music.
- No new screens. The only behavior additions are the running guess log, the watcher count and sound.

## Anti-goals (failure even if it "works")

- Anything that hurts readability of the canvas or the guess feed: no textures, scanlines or busy imagery behind or over the canvas (Will rejected B's scanlines).
- A flash of the old font or old background on first load.
- A sound on every pixel placement.
- Breaking existing tests, `data-testid`s or the accessibility fixes from Task 6 (connect-error screens, labels, focus handling on the round overlay).

## Constraints

- The stack stays React 19, Tailwind v4 and the shadcn-style CSS variables in `src/styles.css` and `src/themes.css`. `<html data-theme="arcade">` is fixed in `index.html`, and there is no theme switcher in the UI (`src/themes.ts` is unused by components).
- Only the landing page `/` is prerendered (`PAGES = ['/']` in `src/prerender-entry.tsx`); home and room render client-side. No-flash therefore rests on the inline background in `index.html` plus the bundled font being loaded before first paint (preload or `font-display: block`), on every route.
- `npm run verify` (tests, lint, type-check, builds) and the offline Playwright suite must pass.
- Deadline: done, reviewed and deployed before the README lock (about 2026-11-20).

## Approaches considered

- **A. Theme first, then sweep (chosen by Will).** Rewrite the `arcade` theme tokens, add shared building blocks (gradient, frame, panel, button, square corners), then sweep components to use them instead of hardcoded colors. The biggest diff, but consistent, and future screens inherit the look.
- **B. Restyle each component in place.** Swap hardcoded colors for new hardcoded colors per screen. Slightly faster at first, but colors drift and every new screen has to copy the styling by hand.

## The look (decided by Will)

### Font: VT323

- VT323 is used everywhere: headings, body text, buttons, the canvas word and the guess feed.
- **Hosting (my call):** bundled through the `@fontsource/vt323` npm package and imported in the app's CSS, not loaded from Google Fonts. Why: no third-party request at runtime (privacy, no dependency on Google's CDN), the font ships with the build so the prerendered page has it, and `font-display: block` or a preload avoids a flash of the fallback font.
- VT323 has one weight. Remove `font-bold` and `font-extrabold` where they would fake-bold VT323; get emphasis from size and color.
- VT323 reads small. Raise the **body** text size (`body { font-size }` in `src/styles.css`, currently 14px) to about 20px and scale the type up from there (the reference uses 20px body, 24px round bar, 32–34px word and logo). Do **not** change the `html` root size: Tailwind spacing, max-widths and breakpoints resolve against it, and changing it would throw off the layout and the canvas sizing. (My call, from the builder check.)
- Fallback stack: `'VT323', ui-monospace, monospace`. VT323 is Latin-only; player names with other scripts fall back to the monospace font, which is acceptable.
- The current `.font-pixel` class (really the system monospace) is replaced by VT323.

### Background: Navy glow

- `radial-gradient(ellipse at 50% 0%, #1e1b4b 0%, #0a0814 60%)` over `#0a0814`.
- No texture, scanlines, sun or grid floor.
- The inline no-flash background in `index.html` changes from `#0d0b14` to `#0a0814`. The `slate` and `paper` themes are dead code and are removed from `index.html`, `src/themes.css` and `src/themes.ts` (my call: nothing uses them, and keeping them means building every component twice).

### Accent palette: Sunset

| Token (suggested name) | Value | Used for |
| --- | --- | --- |
| `--sunset-1` | `#fde68a` | gradient start, highlight text (the word, chips), selected color outline |
| `--sunset-2` | `#fb923c` | gradient middle, panel headings |
| `--sunset-3` | `#ec4899` | gradient end, panel borders, timestamps in the feed |
| `--sunset-4` | `#8b5cf6` | last stop of the canvas frame gradient |
| `--word-shadow` | `#be185d` | 3px 3px hard shadow under the word |
| `--soft-text` | `#fbcfe8` | round bar labels |
| `--text` | `#fef3c7` | body text |
| `--panel-bg` | `#14061fd9` (also fine: `#0a0814d9`) | panel fill |
| button gradient | `#fb923c` → `#db2777`, white text | primary/gradient buttons (Ask the AI, Start, Create room) |

Map these onto the existing shadcn variables (`--color-primary`, `--color-border`, `--color-accent`, and so on) so the `ui/` components pick them up.

### Design language (from mockup A)

- **Logo:** "PIXEL PARTY", uppercase VT323, filled with a vertical gradient `#fde68a → #fb923c (55%) → #ec4899`, with a 2px 2px hard shadow.
- **Canvas frame:** a 10px gradient border, `linear-gradient(135deg, #fde68a, #fb923c, #ec4899, #8b5cf6)`, with a `0 10px 0 #0009` hard drop shadow.
- **Panels** (players, guess feed, cards, dialogs): the panel fill, a 3px `#ec4899` border and a `0 5px 0 #0009` hard shadow.
- **Chips/badges** (room code, player count): a dark fill, a 2px `#f472b6` border and `#fde68a` text.
- **Buttons:** the gradient, a 2px `#fff4` border and a `0 4px 0 #000a` hard shadow that shrinks on press (keep the existing `.arcade-btn` press behavior).
- **Corners are square everywhere:** set `--radius: 0` and remove `rounded-*` from themed surfaces. Pixel art has no rounded corners.
- **The word:** large, `#fde68a`, with the `#be185d` hard shadow.
- **Palette swatches:** square, 2px dark border, and the selected color gets a 3px `#fde68a` outline. Colors come from `PALETTE` unchanged.
- Lucide icons stay; recolor them to the palette.

### Room layout

- Desktop (≥1024px): three columns. Players panel on the left, the canvas centered, the guess feed with the Ask button on the right. The round bar (word, timer, pixel count) is centered above the canvas, and the palette sits in a row under the canvas. The header (back link, room name, code badge, Start for the host) stays at the top.
- **Canvas size rule:** the canvas is a square whose side is the largest multiple of 32px that fits both the center column width and the viewport height minus the header, round bar and palette, capped at 768px. For a non-square board (team mode is 64×32 in `src/game/config.ts`, currently blocked at room creation), apply the same rule to the board's own aspect ratio: the largest whole-pixel cell size that fits. At 1440×900 that should come out at about 576–640px (today it is capped at 440px). The canvas, palette and Ask button are all visible without scrolling at 1440×900 and 1280×720.
- Mobile and tablet (<1024px): stacked in this order: round bar, canvas (full width minus the 16px gutters), palette, guess feed with Ask, players. No horizontal scroll at 375px.
- The waiting room, intermission overlay, spectator banner, reject notice, session-expired notice and access gate keep their current behavior and get the new styling.
- **Players panel:** the left column shows the painter count, the roster names (both already in the `players` message: `count` + `roster`) and **a "N watching" line (Will wants this)**. Watching = open sockets with no signed-in user (signed-out viewers). This needs a small server addition: `PixelRoom` (`src/server/pixel-room.ts`, next to `playerCount()`/`playerRoster()`) computes it from `liveSockets()`, and an optional `watching?: number` field goes on the `players` and `snapshot` messages in `src/game/protocol.ts`, with the client storing it in `src/game/client-state.ts`. It is display-only: it must not feed into the AI-spend checks (which already treat signed-out-only rooms as zero spend) or the room's `playerCount`. The `players` message must be re-broadcast whenever the watcher count changes too (a signed-out viewer joining or leaving), not only when painters change, or the line goes stale. Add a server test for the count and for that broadcast. The existing `data-testid="round-players"` (text "N painters", asserted in `tests/pixel.spec.ts`) moves to this panel's count line; exactly one element keeps that id.

### Guess feed: a running log (Will's call)

- Today the client keeps only the latest judgement (`guesses[zone]` is replaced on each `judgement` in `src/game/client-state.ts`), and guesses carry no timestamp.
- New: the client appends each judgement that contains new guesses to a per-round log, stamped with the round clock (time elapsed since the round started, from the round's start/`endsAt` data on the client). It shows newest first, with the timestamp in `--sunset-3`, and scrolls inside the panel. It is cleared when a new round starts.
- Client-only: no protocol or server change, no extra AI calls. Someone who joins or reconnects mid-round starts with whatever the current snapshot shows (the latest guesses, stamped at join time) and builds from there. This is accepted.
- Keep existing feed test hooks working.

### Other screens

- **Landing (`src/pages/index.tsx`) and lobby/home (`src/pages/(app)/home.tsx`):** same tokens and building blocks. The landing hero may use a larger gradient logo; no other decoration (my call: these were not mocked, so they follow the room's language rather than adding new ideas).
- Error, gate, settings and API status pages: restyle through the tokens only.

## Sound (decided by Will)

- **Events (exactly these four):**
  1. a new Haiku guess appears in the feed (the guess log below)
  2. the timer's last 5 seconds: one tick per second
  3. a short win jingle when the word is guessed
  4. a "time's up" tone when the round ends without a win
- **No sound on pixel placement.** No background music.
- **Mute button:** always visible on the room page (in the header), with a speaker icon and an accessible label ("Mute sounds" / "Unmute sounds"). It is remembered per browser in `localStorage` (wrapped in try/catch; it defaults to on if storage is unavailable).
- **On by default (my call):** browsers keep the page silent until the first user interaction anyway. The audio context is created or resumed on the first pointer or key interaction, so nothing plays on page load.
- The guess sound plays when a `judgement` arrives containing at least one guess not already heard this round (not on every 15-second tick that repeats the same guesses). If that judgement is a match, only the win jingle plays, not the guess blip as well. (My call.)
- Sounds fire only on live transitions seen while connected. Never on initial state load, reconnect or replaying existing guesses. Spectators hear them too, unless muted.
- **Implementation (my call):** one module, `src/lib/sfx.ts`, generates the tones with the Web Audio API (square and triangle oscillators with short envelopes, the chiptune sound). Why: no audio files to source or license, nothing to download, a tiny bundle, and the module is easy to unit-test with a mocked `AudioContext`. A small hook (for example `useGameSounds(state)`) watches room state and calls it.
- Volume: quiet. Effects should sit under conversation.

## Order and ownership

1. **Visuals first:** theme tokens, font, building blocks, layout and the component sweep. Gemini, through `delegate_task` (as planned in the handoff), with screenshots at 1440×900, 1280×720 and 375px.
2. **Sound and watcher count:** `src/lib/sfx.ts` plus tests, and the server/protocol/client-state side of the watcher count plus tests. Codex, in parallel with Gemini, because these files don't overlap with the visual sweep. The guess log (client-state logic) also goes to Codex. Gemini renders the Players panel and feed from whatever state fields Codex adds; the wiring is done after both land.
3. **Review:** Codex Sol reviews Gemini's diff (the Antigravity Claude pool is out until about 2026-11-23). Opus checks the screenshots against the reference and runs `npm run verify`.
4. If the README lock gets tight, sound is cut first.

## Acceptance

- The room page at 1440×900 matches the reference mockup in font, colors, frame, panels and button style, and the canvas is at least 576px.
- No `font-bold`/`font-extrabold` on VT323 text, no `rounded-*` on themed surfaces, and no leftover `amber-*`/old hex colors in the swept files (except `PALETTE`).
- No flash of the old background or fallback font on a hard reload of a prerendered page.
- The Players panel shows painters, names and a live "N watching" count that updates when a signed-out viewer opens or closes the room.
- The guess feed is a newest-first log for the round with round-clock timestamps, cleared on a new round.
- Sounds play for exactly the four events, never on load or reconnect, and mute persists across reloads.
- `npm run verify` and the offline Playwright suite pass; all existing `data-testid`s still exist.

## Left to the builder

- Exact token names and how they map onto the shadcn variables.
- Exact tone pitches and durations, within "short, quiet, chiptune".
- Spacing, the exact heading scale and icon sizes, as long as they match the reference.

## Calls I made for Will to check

1. "B" on the background screen was read as **Navy glow**.
2. A **Players panel** on the left of the canvas (Will added the watcher count).
3. Landing and lobby follow the room's language with no extra decoration (they were never mocked).
4. Sound is **on by default**, with the mute button in the room header.
5. VT323 is **bundled** (`@fontsource/vt323`), not loaded from Google Fonts.
6. The unused `slate` and `paper` themes are removed.
7. Canvas size rule: the largest multiple of 32px that fits, capped at 768px.
