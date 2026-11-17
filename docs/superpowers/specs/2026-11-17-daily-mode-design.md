# Daily mode: design

Status: draft for Will's approval · 2026-11-17 · Branch: `t3/daily-pixel-art-game`
Builds on: `docs/superpowers/specs/2026-11-16-pixel-party-design.md` (the shipped multiplayer game).

## 1. Intent

The app's main feature changes from the shared live board to a solo daily pixel-art challenge. Everyone gets the
same harder prompt each UTC day and one 10-minute attempt to draw it on a 32×32 pixel canvas. Claude Haiku grades the drawing
during the attempt, and the best grade is what counts. Each day has its own leaderboard. Every player's daily drawing
goes on a public profile gallery.

**Why (Will):** it is more fun, and reviewers can test it alone. One person opens the app and plays a full,
judged game in 10 minutes, with no second player and no waiting room. The deadline is the build-exercise submission,
due about 2026-11-21, and the README and submission note still have to be written. So the scope has to land in about 2 days.

## 2. Goals, non-goals, anti-goals

**Goals**
- The home page is today's daily challenge. A signed-in player can start, draw, be graded, and finish on the live URL.
- Harder prompts: short scenes or subject plus detail ("a lighthouse in a storm", "a cat stuck in a tree").
- Grading is a two-step judge, a blind guess followed by a prompt-aware score. The highest-scoring snapshot of the
  attempt is kept.
- Daily leaderboard of best scores. Each player has a public profile gallery of all their daily drawings, and
  the day's top 3 get medals.
- The server enforces every rule that affects the leaderboard: the time window, grade spacing, grade caps,
  and scores.
- Building and testing spend nothing on AI unless real judging is switched on on purpose.

**Non-goals**
- Live sync, presence or WebSockets for daily mode. It is solo, and the server only referees.
- Multiple attempts per day, retries, or explicit "submit" actions.
- AI-generated prompts.
- Editing or deleting gallery entries, and comments or likes on them.
- Changes to the existing party mode (shared board and rooms) beyond moving its entry point.

**Anti-goals (failure even if it technically works)**
- Burning Will's AI credits during development, or letting a bug drain the live budget.
- A leaderboard that can be faked by calling the API directly.
- Breaking the working party mode four days before submission.
- Scores that feel arbitrary. Every grade shows Haiku's blind guess and a one-line reason.

## 3. Constraints

- DeepSpace SDK on Cloudflare Workers. Follow `.agents/skills/deepspace/SKILL.md` and docs.deep.space.
- Haiku is called only server-side, through the existing DeepSpace integration path
  (`createServerTools(env).integration('anthropic/chat-completion', ...)`), and every call reserves from the
  existing `BudgetRoom` app-wide daily cap.
- Never run `deepspace deploy` or `push` unless a task says so explicitly. The source authority is GitHub.
- `npm run verify` must stay green, and all existing tests keep passing.
- `users` records are readable only by their owner. Anything shown publicly (names, avatars) must be copied onto
  records the public can read when they are written.

## 4. Approaches considered

- **A. A live server room per player per day** (Durable Object plus WebSocket, like the party board). The server sees
  every pixel and runs the timer and grades itself, which makes it the hardest to cheat. But it is the most new code,
  it keeps a live connection open for a game with no other people, and it is harder to test.
- **B. The browser draws and the server referees (chosen).** The canvas lives in the browser. The server records the
  start time, reveals the prompt, and enforces the rules. Each grade is one HTTP call carrying the grid. It needs much
  less code and reuses the judge path, budget and PNG rendering, and it is easy to test. The trade-off: a closed tab
  gets no further automatic grades, but its best score is kept. The cheating gap is small, because the only thing a
  player can do is send a grid made elsewhere, and only inside their own 10-minute window after seeing the prompt.
- **C. Reuse the party `PixelRoom` in a solo setting.** Rejected. Its lobby, room-code, contributor and co-op round
  machinery would tangle both modes close to the deadline.

Will picked B: "no need to host everything the same way, we only need the server to judge."

## 5. Decided design

### 5.1 The round (all of this was decided with Will)
- **One attempt per player per UTC day, 10 minutes long.** Pressing **Start** records the server-side
  `startedAt` and reveals the prompt. Once started, the attempt runs until it ends; there is no restart.
- **Grades** happen:
  - automatically at about **2, 4, 6 and 8 minutes**, skipped if the grid hasn't changed since the last grade;
  - on **Ask now**, **3 per attempt**;
  - once more at the end: at **10:00**, or when the player presses **Done**, which ends the attempt early. Also
    skipped if nothing has changed.
- **No submitting.** The attempt's result is the **highest-scoring graded snapshot**. If a later grade is lower, the
  best snapshot stays. The UI shows the latest grade (guess, score, reason) and "Best: N".
- **Worst-case cost** is about 9 grades × 2 calls, roughly 18 Haiku calls per player per day. The server enforces it.

### 5.2 Judging
Two Haiku calls per grade:
1. **Blind guess.** Haiku sees only the drawing, rendered to PNG as today, and is never told the prompt. It returns
   its best guess as a short phrase. The player sees this as a reveal: "Haiku thinks: a candle on a rock."
2. **Score.** Haiku sees the drawing, the prompt, and the blind guess. It returns `{score: 0–100, reason: one short
   line}`. The score weighs two things:
   - whether the main subject is recognisable without being told, using the blind guess as evidence;
   - how well the full prompt (subject plus detail) is shown.

Both outputs are strict JSON, parsed defensively like `parseJudgeText`. If either call fails, that grade does not
count and does not use up an Ask-now.

### 5.3 Prompts
A hand-written list of harder prompts kept **server-side only**, not in the client bundle. Today's prompt is picked
deterministically from the UTC date, so everyone gets the same one, at no cost, and it can be reproduced in tests.
The client sees the prompt only after Start, or after its attempt has ended. The list needs at least 60 entries so it
doesn't repeat during the review window and beyond.

### 5.4 Profiles and leaderboard
- **Every** player's daily result goes on their profile: the best snapshot, the prompt, the score, Haiku's guess, and
  the date. The gallery is public, and a profile is reached by clicking a name on the leaderboard.
- **Daily leaderboard**: best score descending. Ties go to whoever reached that score earlier, measured as time since
  start. Medals go to ranks 1–3. Today's board plus a way to see previous days (at least yesterday).
- **Spoiler rule:** today's prompt and drawings are hidden from anyone who hasn't finished today's attempt, or who
  isn't signed in. Ranks, names and scores are visible to everyone.

### 5.5 Party mode
The shared board and private rooms stay as they are, behind a secondary "Party mode" link. The home page becomes the
daily game.

### 5.6 AI spend while building
- **Fake judge, on by default** in local dev, unit tests and Playwright. It returns canned guesses and scores
  (seeded off the grid, so tests are predictable), costs nothing, and switches with one config/env flag. The existing
  fixture `src/game/__fixtures__/anthropic-response.json` shows the real response shape.
- **Local real-judge helper (opt-in):** a small Node script on Will's Mac that receives the PNG and prompt and runs the
  Claude Code CLI (`claude -p` with the image), billing Will's own subscription. The local dev worker calls it over
  HTTP when that mode is on. It is local-only and never used in production. Caveat: it runs the subscription's model,
  not exactly Haiku.
- **Production** uses DeepSpace's Haiku. Lower `BUDGET.dailyCalls` from 3000 to **1000** (see 5.8).

### 5.7 DeepSpace integrations (Will: keep using them where they make sense)
The mission is unchanged: use DeepSpace platform features where they genuinely fit, and say plainly why one is not
used. Each choice below has to be explainable in the interview, so record it in `docs/progress.md` as it lands.

| Need | DeepSpace feature | Why |
|---|---|---|
| Sign-in, identity, display name and avatar | DeepSpace auth (JWT verified in the worker) | The player is known without building accounts. The name and avatar are copied onto public records when written, because `users` stays readable only by its owner. |
| Haiku judging (both steps) | `anthropic/chat-completion` through the integration proxy, server-side via `createServerTools` | Already proven in Task 1. It is the only DeepSpace integration that accepts images. Running it server-side keeps the budget enforceable, and client integrations stay default-deny. |
| Atomic referee state (start, grade caps, best score) | A Durable Object (`BaseRoom` plus SQLite), modelled on `BudgetRoom` | Transactions give one-attempt-per-day and the caps without race conditions. No WebSocket is used, because solo play doesn't need one. |
| Gallery and leaderboard data | DeepSpace collections with RBAC: written only by the server, readable by the public | Profiles and boards read through the normal records API, and the permission model blocks client writes. |
| Closing the day: freeze the leaderboard and award top-3 medals | DeepSpace cron (`src/cron.ts`, `AppCronRoom`), a daily task just after 00:00 UTC | The platform's own scheduler fits "once a day" exactly, and medals become stored facts instead of being recomputed on every read. |
| Daily AI cap | The existing `BudgetRoom` | Reused unchanged, with the cap lowered to 1000. |

**Deliberately not used:** realtime sync and presence (solo mode), and messaging, payments and file storage (no need;
snapshots are 32×32 grids small enough to store in a record). The local `claude -p` helper is a dev-only tool, not a
replacement for the integration. Production always goes through DeepSpace. The fake judge should hook into the
existing `test_integration_disabled` test path so that tests prove no paid call is made.

### 5.8 Settled after the builder check (Claude's calls, for Will to check)
- **Sign-in is required to play.** Signed-out visitors see the leaderboard (ranks, names, scores) and a sign-in
  button. Identity is needed for profiles and the leaderboard, and the existing rule already gates all paid AI
  calls to signed-in users.
- **Budget:** `BUDGET.dailyCalls` becomes **1000** (not 500). It is shared with party mode. A realistic attempt uses
  about 10 calls and the worst case 18, so that covers 55 to 100 players a day. When the cap refuses a call, that
  grade fails with a visible "judge is resting, keep drawing" message. It doesn't count, doesn't use up an Ask-now,
  and the next scheduled grade tries again.
- **Midnight:** an attempt belongs to the UTC day it **started** on. Its prompt and leaderboard are fixed at start.
  Finishing after midnight doesn't use up the next day's attempt. The daily cron that awards medals runs after the
  latest possible end, so 00:15 UTC.
- **No successful grade** (every grade failed, or the player left before minute 2): the attempt still ends and still
  lifts the spoiler for that player. A gallery entry is written with the last grid the server received (if any)
  marked "unscored". It is not ranked.
- **Tie-break:** the elapsed milliseconds from `startedAt` to the grade that set the best score. Lower wins. An equal
  later score never replaces the best snapshot. The server, the board and the tests all use this one definition.
- **Prompts:** a child agent drafts about 80 prompts (format `{ prompt, subject }`, where `subject` is the main noun
  the blind-guess check looks for), screened so each one can actually be drawn at 32×32. Will skims the list before
  launch.

## 6. Left to the builder
- The exact storage shape: which data lives in a Durable Object versus collections, and the record schemas. Requirements:
  - starting an attempt, and reserving a grade (spacing, caps, best-score update), must be atomic per player-day, so a
    double-click or parallel requests can't get around the caps;
  - profile and leaderboard data must be publicly readable records, written only by the server, with the display
    name copied on.

  A `BudgetRoom`-style SQLite Durable Object keyed by day is the suggested starting point.
- The exact grade-spacing tolerance (the client asks; the server rejects a grade that comes too soon after the last), and the grace period at
  10:00 for network delay.
- The judge prompt wording, and the fake judge's canned outputs.
- The page and component layout, reusing `PixelCanvas`, `Palette` and the UI kit. Keep the look of the existing
  app, because a pixel-themed redesign is a separate, later pass.
- Whether a closed and reopened tab during an attempt restores the drawing (nice to have: keep it in local storage).
