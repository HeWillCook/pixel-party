# Current status

## Handoff (2026-11-17)

**Goal:** Pixel Party, Will's DeepSpace build-exercise submission (due about 2026-11-21): a multiplayer 32×32 pixel canvas where Claude Haiku guesses the drawn word. Live at https://pixel-party.app.space; repo is github.com/HeWillCook/pixel-party.

**Where things are:** `build/pixel-party` merged into `main` through PR #1; production matches `main` at c0cc47b plus this handoff note. Future work goes in separate worktrees branched from `main`.

**Done (whole build so far):**
- Co-op game with an always-on public board (`/r/play`) and private rooms. Solo painting is instant: no cooldown, cells along a drag are filled in, and pixels are sent in batches, with a server cap of 60 cells per second. Each private room has a 4-character code with a badge, a waiting room with a host-only Start, and a no-flash access gate for signed-out visitors.
- Haiku is the judge: it runs every 15 s or on Ask, with an app-wide budget of 3000 calls per day. There is zero AI spend in the waiting room, when only signed-out viewers are connected, when the room is paused or empty, or when the canvas hasn't changed; tests cover each case.
- The running log, decisions, integration notes, and tabled ideas live in `docs/progress.md`. The design and plan are in `docs/superpowers/`.

**Next steps:**
1. Will's hands-on checks on the live site:
   - sign in through the browser (never verified live)
   - paint solo
   - create a private room, then copy the code and press Start
   - open a private link signed out and confirm nothing flashes
2. Pixel-themed redesign with a bigger, centered canvas. Agree the look with Will first (font, palette, borders, sound), then hand Gemini a concrete brief.
3. Team mode (Task 9 in `docs/superpowers/plans/2026-11-16-pixel-party.md`). Room creation currently rejects team mode with `mode_unavailable`.
4. README and submission note (Task 11). This is required; lock it in by about 2026-11-20.
5. Tabled, in priority order: the daily Wordle-style puzzle, then earned currency and cosmetics (earned only, no payments). Designs are in the `docs/progress.md` "Future ideas" section.

**Decisions made (and why):**
- Waiting room: only the host can start, and any player count is allowed (including solo). People can join after the start. The public board always runs.
- Private codes are 4 characters and public codes 10. This trades secrecy for codes that are easy to read out loud. Codes of closed rooms are never reused.
- The limit on failed code guesses was skipped because there is no durable per-user counter to build it on.
- Integration choices must always be explained to Will so he can defend them in the interview.

**Open questions / blockers:** browser sign-in on the live site is still unverified; Will has to check it.

**Verification:** `npm run verify` passes (221 tests, lint, type-check, builds), CI on PR #1 passes, and the offline Playwright suite passes (5 tests). The live run of `node scripts/ws-smoke.mjs https://pixel-party.app.space --yes` passes through a real Haiku Ask. Its final pause check fails whenever a real signed-in tab is open on the public board, which is the expected behaviour. The live private-room lobby test passed in room `QX3J`.

**Gotchas:**
- Deploying means `npx deepspace deploy`. The source authority is GitHub and it ships the local working tree, so deploy only from a clean, merged checkout.
- WebSocket checks need HTTP/1.1, and the token goes in `?token=`. A plain GET to `/api/pixel/:code/ws` returns 404 by design.
- The free tier allows one active app. Never run `app init` or `dev start` outside this repo.
- The Antigravity Claude pool is exhausted weekly until about 2026-11-23, so send reviews to Gemini Argon or Codex Sol. Codex options use `reasoningEffort`, not `effort`.
