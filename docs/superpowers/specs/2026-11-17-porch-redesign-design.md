# Porch redesign, drawing tools and daily fixes: design

Date: 2026-11-17. Status: draft for approval (builder check done).
Mockups (reference only; the real art is richer): `.superpowers/brainstorm/66063-1794946081/content/porch-scene.html`
(wide porch) and `play-zoomed-v5.html` (zoomed play screen).

## Why

Drawing is harder than it should be: there's no eraser or fill, and white can't be painted. Daily mode has bugs that
make it feel broken: auto-grades go missing, a flash of the wrong screen, and no way out. Scores are opaque, and the
current synthwave look isn't the friendly vibe the owner wants. The new identity is **a painter on a porch at sunset by
the ocean, painting straight onto a canvas**. The whole site becomes detailed pixel art, and every feature is an object
in that world.

## Goals

1. Daily auto-grades fire at fixed times (2, 4, 6 and 8 minutes), every time.
2. The pre-start screen never flashes for someone who already finished today.
3. Leaving daily mode is obvious.
4. Drawing tools: eraser, colour picker and a real white everywhere; fill and undo/redo in Daily.
5. Scoring is legible before, during and after play, in both modes.
6. Scores (the daily leaderboard) get their own tab and page.
7. Each account's page shows all of its daily drawings.
8. A full visual redesign: one pixel-art porch world, intentionally designed, where every existing feature has an
   object that links to it.

## Non-goals

- New game modes. Party stays co-op only; the dormant team mode stays hidden.
- Party boards on profiles. Profiles show dailies only.
- Changing the AI judge, prompts, the daily scoring formula, the co-op formula or the AI budget.
- A theme switcher. There is one theme: the porch.

## Anti-goals (failure even if it "works")

- An immersive scene that hides what things do. Every object must say what it is (a visible label on touch and
  narrow screens, a label on hover or focus on desktop), and every action stays reachable from a conventional control.
- Anything moving under the cursor while drawing.
- Keyboard-shortcut badges in the UI. Shortcuts may exist but are not displayed.
- Pixel art that looks generic or templated: flat CSS boxes standing in for objects (the rejected box easel).

## Approaches considered (art pipeline)

1. **Drawn in code (chosen).** Objects are small pixel maps in code; the sky, sea, sun, flames and water are drawn
   procedurally and animate. UI panels are HTML/CSS styled as pixel art. No asset pipeline, everything versioned and
   tweakable; the quality ceiling depends on art-pass effort.
2. Image sprite sheets. Highest ceiling, but there's no artist, and AI-generated pixel art rarely has a consistent
   grid.
3. Hybrid (code now, images later). Keeps the door open, but adds two ways of doing the same thing.

The owner picked 1.

## Decided behaviour

### Daily grading

- **Auto-grades** happen at fixed offsets from the attempt's server start: 2:00, 4:00, 6:00 and 8:00. Manual grades
  never move them. An auto-grade never submits.
- If the canvas is unchanged since the previous grade, the window is **skipped** and the UI says so on the timeline
  ("4:00 skipped: no changes since your last grade"). A skipped window does not come back.
- A window must never be silently lost. Auto-grades run only while the site is open in some tab (owner's decision);
  being on the porch or any other page counts, a closed tab doesn't. If a window can't fire on time (throttled
  background tab, network error), it grades as soon as possible and is labelled late. Windows that pass while no tab
  is open are recorded as "missed: tab was closed" when the player returns. The scheduler must therefore live above
  the play screen (app-wide), not inside it. Client and server rules must agree; today's 100-second minimum gap after
  any grade is what lets manual grades push autos back, and it must go.
- **Blank canvas:** a window that arrives while nothing has been drawn is skipped ("nothing drawn yet"), not sent to
  the judge (my call).
- **Timeline history is durable** (my call): each window's outcome (score, skipped and why, late, missed) is stored
  with the attempt on the server, so it survives reloads, Exit and a second device.
- **Grade now:** 3 manual grades per attempt, kept separate from autos. The 20-second gap applies between manual
  grades only, not after an auto-grade (my call).
  The player keeps drawing afterwards.
- **Submit & finish** is a separate button (today's "Done"). It ends the attempt and locks the best score; submitting
  earlier earns more speed points.

### Daily flow fixes

- **Loading:** until today's state has loaded, show a neutral state (the easel draped, no Start). Never render
  not-started as a placeholder.
- **Exit:** "Exit to porch" is always visible while playing. It confirms that the 10 minutes keep running and that the
  player can return to the easel at any time before they end. The camera zooms back out.

### Scoring legibility

- **Daily, before start:** the easel's cover sheet explains the recipe: matches the prompt (up to 500), easy to
  recognise (up to 400), speed (up to 100), best grade counts, auto-grades at 2/4/6/8, 3 manual grades, Submit ends it.
- **Daily, during play and after:** "How you're scored" shows three labelled bars with points out of each maximum, the
  total out of 1,000, and the judge's one-line reason. A timeline lists each auto window (score, skipped and why, or
  countdown) and the manual grades used.
- **Party:** a compact "How you score" note during a round (fewer pixels and a faster AI guess mean a higher score;
  the round ends when the AI guesses the word). Results break the score into pixels saved (out of 500) and time saved
  (out of 500), plus the AI's guess.

### Drawing tools

| Tool | Daily | Party |
|---|---|---|
| Paint (drag supported, as today) | yes | yes |
| Erase (sets a cell back to empty) | yes | yes |
| Fill (4-connected flood of the same colour, empty included) | yes | **no, not shown** (Party paints are limited by the brush cooldown) |
| Pick colour from the canvas | yes | yes |
| Undo / Redo (local history for this attempt) | yes | no (my call: a shared canvas with cooldowns makes undo ambiguous) |

- **Palette:** black stays, and a real **white paint** is added as index 16. The empty canvas renders as bare cream
  canvas with a faint weave in the UI, so painted white is visible. The judge PNG keeps rendering empty as white, so
  judging is unchanged. Cells are stored as base64 bytes (`grid.ts`), so no encoding migration is needed; only the
  `<= 15` / `< PALETTE.length` bounds need updating (`daily-service.ts:75`, `rules.ts:46`, `usePixelRoom.ts:233`,
  `pixel-room.ts:60`).
- **Party erase:** goes through the same brush cooldown and rate limits as placing, and can clear anyone's pixel.
  Erasing an already-empty cell is a no-op that doesn't consume cooldown. Today the server rejects colour 0 in rooms
  (`rules.ts:46`), so this is a protocol and rules change. Scoring (owner's decision): pixels used is the live count of non-empty cells at round end, as the code does today, so
  erasing lowers it and cleaning up raises the team's score. An erased cell loses its contributor credit.
- **Undo/redo (Daily):** in-memory history for the current attempt (my call); a reload starts a fresh history from
  the saved canvas.

### Profiles

`/u/:userId` already lists daily drawings (`dailyDrawings`). It becomes the gallery wall inside the house: framed
drawings with date, prompt, score and medal, plus the judge's guess. Dailies only. Attempts that were never graded
(blank, score 0, no guess) are hidden from the gallery wall and from `/scores` (my call).

## The world: every feature has an object

One continuous pixel world. Each route is a camera position in it. Objects are real `<a>`/`<button>` elements laid
over the scene, with accessible names, visible focus and a label. A wooden **sign beam** across the top of every
screen holds the main tabs (Daily, Party, Scores, Gallery) as hanging signs, so navigation never depends on finding
an object.

| Existing feature (today) | Object in the world | Where |
|---|---|---|
| Daily: start, resume, view result (`/home`) | The hovering easel (three small boosters with flickering flames; it bobs gently only when it's not drawable) | Porch, centre |
| Daily tab, Party tab, Scores, Gallery (nav) | Hanging wooden signs on the porch beam; the active one is lit by a lantern | Top of every screen |
| Daily leaderboard (moves to a new `/scores` page) | Chalkboard on an A-frame showing today's top three in chalk; opens the full board | Porch, left |
| Party lobby (`/party`) | Steps down to the beach, where a bonfire is surrounded by easels | Porch, right |
| Public Board (`/r/play`) | The lighthouse on the far point, always lit | Horizon |
| Account: sign in/out, name/email, settings (`/settings`) | Mailbox by the steps (flag up when signed out: "Sign in") | Porch |
| My gallery (`/u/:me`) | Front door / window into the house | Porch |
| Sound on/off (daily and rooms) | Little radio on the railing (music notes when on) | Porch railing; a radio icon in play UIs |
| How to play / rules | Note pinned to a post | Porch |
| Landing page CTAs (`/`) | `/` renders the same porch (prerenderable, signed-out state) with its SEO copy as readable notes in the scene | Porch |
| Party: room list | One easel per room around the bonfire, with a pennant showing name, code and painter count | Beach |
| Party: featured public board | The lighthouse again, with a "Featured" banner | Beach horizon |
| Party: create room (name, public/private) | An empty easel: "Set up an easel" opens a wooden-sign form | Beach |
| Party: join by code | A signpost where you carve the code, with a Join button | Beach path |
| Party: delete own room | "Pack up easel" on your easel's pennant, with the existing confirm dialog | Beach |
| Room: invite code + copy link, Share | A paper ticket with the code and "Copy link" | Room top bar |
| Room: lobby roster, Start | Beach chairs facing the easel, one per painter; the host gets "Start painting" | Room lobby |
| Room: play (canvas, palette, tools, guess feed, Ask the AI, players, timer, cooldowns, spectator and reject banners) | The zoomed play screen (below), with the AI as a critic character next to the easel (my call: e.g. a gull or crab in a beret) whose speech bubble is the guess feed | Room |
| Room: Skip round, New game, View canvas, results | Results as a framed painting card on a stand; buttons on its plaque | Room |
| Room: leave (missing today) | "Back to the beach" exit, same pattern as Daily's exit | Room top bar |
| Private, not-found and closed room states | Small scenes: a roped-off easel, an empty spot in the sand, a packed-up easel; each with "Back to the beach" | Room |
| 404 | "You wandered off the boardwalk": an empty boardwalk scene with "Go home" | Any |
| Error screen, `/api-status` | Kept functional; restyled as plain porch-wood panels (dev-facing) | Any |

### The play screen (Daily and Party rooms)

The camera zooms from the wide scene into the easel (roughly 600 ms, eased), and the UI slides in around the canvas.
Opening a URL that is already mid-play starts zoomed, with no animation. Layout as in `play-zoomed-v5.html`:

- **Top bar:** mode chip, prompt (Daily) or word (Party), time left, Exit.
- **Left:** labelled tools with pixel icons; selected state obvious; no shortcut badges.
- **Centre:** the canvas on the hovering easel. The easel is perfectly still while playable; only the flames flicker.
- **Right:** "How you're scored", the auto-grade timeline, then **Grade now (N left)** and a visually distinct
  **Submit & finish** (Daily), or the guess feed, Ask the AI and players (Party).
- **Bottom:** palette bar with large swatches, white and black first; the selected one is raised and outlined.
- The sunset scene stays visible behind the panels.

## Constraints

- DeepSpace SDK app on Cloudflare Workers + React (generouted file routes). Follow `AGENTS.md`: no deploy, push or
  undeploy, and no secrets in files.
- Keep existing routes working (`/`, `/home`, `/party`, `/r/:code`, `/u/:userId`, `/settings`). Add `/scores`.
- `npm run verify` keeps passing and new behaviour gets tests. Offline Playwright specs may be updated where they
  assert the old layout; keep existing `data-testid`s where the element still exists (my call).
- Accessibility: every object is keyboard reachable with a name; `prefers-reduced-motion` freezes ambient animation;
  colour contrast on panels meets WCAG AA for text.
- Performance: scene animation is throttled (about 10–12 fps is enough for pixel art), pauses when the tab is hidden,
  and never re-renders the drawing canvas.
- Mobile (375×812): the wide scene crops around the easel with objects still labelled and tappable; the play screen
  stacks the canvas, tools row, palette row, and a score drawer.

## Delivery order (four PRs, each usable alone)

1. **Daily fixes:** fixed auto windows with skip, late and missed reporting; manual grades separate from Submit; the
   loading-flash fix; Exit; score-breakdown data.
2. **Drawing tools:** the colour encoding change and white paint; eraser, picker and undo/redo; fill in Daily only;
   Party erase rules.
3. **The porch world:** the scene renderer, the porch home (and `/`), the zoom, the play screen for Daily and rooms,
   the beach lobby, the scoring UI, and the room and error scenes.
4. **Scores and Gallery:** the `/scores` chalkboard page (with day paging) and the gallery-wall profile.

## Left to the builder

- Exact pixel art, palette of the scene, font (a readable pixel font, self-hosted), and animation details.
- Component structure of the scene renderer and hotspots.
- The critic character's exact design.
