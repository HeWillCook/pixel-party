# Project progress log

Running record of design decisions, findings, and status for the DeepSpace build exercise.
Newest entries at the bottom of each section. This doubles as source material for the final submission note.

## Brief (from the exercise)

Build and deploy a small, finished full-stack app on DeepSpace within five days. Judged on scope judgment,
a working important path, technical depth, sensible use (or deliberate non-use) of integrations, readable code,
protected secrets, use of platform primitives, and an honest writeup of tradeoffs, agent work, and what I verified.

## The idea: Pixel Party (working name)

A daily solo pixel-art challenge judged by an AI, with the live shared canvas retained as party mode.

- **Co-op mode (casual):** a round shows everyone a word (e.g. "lighthouse"). Players place pixels together.
  On a schedule, a background job snapshots the canvas and asks a vision model "what is this a drawing of?".
  The crowd wins when the AI guesses the word; faster = better score. Contributors to the winning image get credit.
- **Team mode (competitive):** canvas split into one zone per team, same prompt for all. Anyone can place
  anywhere, so sabotaging rival zones is part of the game. At round end the AI judges each zone; best match wins.
- **Rooms:** players can create a room and share it with friends, or quick-play into a random public room.
  Co-op also has one always-on public board.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-11-16 | Shared pixel canvas, gamified with an AI judge | My idea; realtime fan-out and server-enforced rules are what DeepSpace is built for; nothing like it among the 37 official examples |
| 2026-11-16 | Two modes (co-op + team) on one engine | Modes differ mostly in config (who can place where, what the judge is asked) |
| 2026-11-16 | Co-op is the must-ship path; team mode cut to "next steps" if co-op isn't solid by ~day 3 | One finished mode beats two half-finished ones |
| 2026-11-16 | Storage: custom `BaseRoom` Durable Object per match (approach A) | Atomic validate+write, tiny broadcasts, same pattern as official games; records/CanvasRoom ruled out by spike 2 |
| 2026-11-16 | Co-op: 32x32 grid, cooldown scales with players, score rewards few pixels + fast win | Spike 1 showed 32x32 is readable; keeps solo play short; turns 'AI reads it too easily' into the goal |
| 2026-11-16 | Name "Pixel Party"; public GitHub repo HeWillCook/pixel-party is the source authority | Submission needs a repo; GitHub must be the remote before first deploy |
| 2026-11-16 | Judge runs in the room's own DO alarm, not SDK cron | Cron is minute-granular; judge needs ~15s ticks only while a room is active |
| 2026-11-16 | Solo play: ~0.2s cooldown + click-drag when alone, plus an "Ask the AI" button (≤1 judgement/room/10s) | Solo should just be fun; reviewers test alone; button gives control while keeping spend bounded |
| 2026-11-16 | Builder-check calls: rooms pause when empty and close after 30 min; private rooms via link + member list; live guesses over WebSocket, not records | Nothing runs or costs money in an empty room; avoids ~240 records/hr/room |
| 2026-11-16 | Cut quick play / matchmaking | Only useful with real traffic; with few players it lands people in empty rooms; default board covers "just play" |
| 2026-11-16 | App-wide daily AI budget (default 3,000 judge calls/day ≈ $0.25), then "AI is resting" | Measured cost is tiny, but scripted accounts could otherwise run ~$3/day each; bounds worst case |
| 2026-11-16 | Verification pipeline: implementer self-check → cross-family review → orchestrator re-runs checks → logged; CI runs `npm run verify` on every push | Nothing is done on an agent's say-so; gives the writeup a concrete "what I verified" record |
| 2026-11-17 | Checkpoint PR after final whole-branch review + fix wave | A stable, reviewed base on main to iterate from |
| 2026-11-17 | First (smoke) deploy after Task 5 from a clean, CI-green commit | Catch production-only issues early; GitHub latched as source |
| 2026-11-16 | Rooms (friends via link/code, or random quick-play) plus an always-on public co-op board | Reviewers likely visit alone; co-op works solo, team mode needs a room of friends or two tabs |
| 2026-11-17 | Pivot the main feature to daily mode: one shared prompt, one 5-minute attempt, best grade kept, every attempt ranked; sign-in required to play | A focused solo game is more fun and reviewers can test it alone. Score is 0–1000: fit×5 + recognition×4 + speed. |
| 2026-11-21 | Party cooldown 250 ms × painters, capped at 1.5 s (2 painters 0.5 s, 4 painters 1 s, 6 or more 1.5 s; alone stays instant) | 1 s × painters made drawing with a friend feel broken: two painters got 2 s per pixel, so a five-minute round gave each of them at most 150 pixels and nothing recognisable. The palette now says why ("Sharing the brush: one pixel every 0.5s each") and the active swatch drains while the brush recharges |

## DeepSpace features: planned use

| Feature | Role in the game |
|---|---|
| Server actions | Every pixel placement validated server-side: cooldown, zone rules, room membership (anti-cheat) |
| Collections + realtime sync | Rooms, canvas, rounds, scores update live for everyone |
| Presence | Live cursors, player count per room |
| Jobs / cron | The AI judge tick: render canvas, call vision model, write verdict |
| AI integration | Vision judging (Claude Haiku via `anthropic/chat-completion`), server-side through the platform proxy; signed-in only; ≤6 calls/min/room; app-wide daily cap |
| Auth + permissions | Room host, private rooms member-only, public rooms in quick-play pool, team membership |
| File storage | Per-tick snapshots, giving a round replay/timelapse |
| Maybe: leaderboard, room chat | If time allows |

**Deliberately left out:** payments (nothing to sell), email (nobody wants game email), voice/video (people use Discord),
AI image generation (the point is humans draw), ElevenLabs announcer (gimmick).

## Integrations used by daily mode

| Need | DeepSpace feature actually used | Implementation |
|---|---|---|
| Sign-in, identity, display name and avatar | DeepSpace auth; worker verifies JWT identity | `src/server/daily-routes.ts` requires authenticated identity; display name/avatar are copied to server-written score and drawing records. |
| Vision judging | `anthropic/chat-completion` integration proxy via `createServerTools` | `src/server/daily-judge.ts`; production mode calls the integration server-side. Fake judging is the default in dev/tests. |
| Atomic one-attempt-per-day and grade caps | `DailyRoom`, a `BaseRoom` Durable Object using SQLite | `src/server/daily-room.ts` serializes state operations by UTC day; it uses HTTP operations, not a WebSocket. |
| Gallery and leaderboard | `dailyDrawings` and `dailyScores` collections with server-write/public-read permissions | Profiles and boards read records through the normal collection API; drawings are private until the daily close. |
| Close day and award top-three medals | DeepSpace cron through `AppCronRoom` | `src/cron.ts` runs at 00:15 UTC and `src/server/daily-close.ts` reveals eligible drawings and records medals. |
| Shared daily AI cap | Existing `BudgetRoom` | Shared with party mode; `BUDGET.dailyCalls` is 1000. |

Realtime sync/presence, messaging, payments, and file storage are not used for daily play. The local `claude -p` helper
(`npm run judge:local`, with `DAILY_JUDGE=local`) is opt-in and dev-only; it is never the production judging path.
The fake judge is selected by default in dev and tests so those runs make no paid model calls.

## Findings

- **2026-11-16: DeepSpace research.** Cloudflare Worker + React SPA + per-app SQLite Durable Objects. Collections are
  meant for "hundreds to tens of thousands of small rows", so a 1M-pixel canvas cannot be one record per pixel.
  Schema migrations are additive only. Developer-billed integrations accept anonymous callers, so paid calls must be gated.
- **2026-11-16: Only Claude can be the vision judge.** Checked with `deepspace integrations info`:
  `anthropic/chat-completion` accepts array message content (image blocks). `openai/chat-completion` accepts string
  content only (no images), and the `gemini` integration only offers `generate-image`. So the judge uses Claude through
  the platform proxy; Haiku is the cheap default to test first.
- **2026-11-16:** Logged the DeepSpace CLI in (`npx deepspace auth login`); vision test unblocked.

- **2026-11-16: Spike 2, pixel storage (verified in SDK source by me).**
  - `CanvasRoom`/`useCanvas` is a Yjs document of freeform shapes, re-encoded whole on each update, and only gates
    viewer vs member. Wrong tool for a validated pixel grid.
  - Record `put` broadcasts the **full record** to every reader (checked `packages/deepspace/src/server/handlers/records.ts`
    around `broadcastChange`), so a tile-per-record design resends the whole tile on every pixel. Server actions do get
    and update as separate calls, so cooldown checks can race.
  - Presence is client-authored, ephemeral, 16 KiB cap: fine for cursors, not for pixels.
  - The SDK exports `BaseRoom` (`packages/deepspace/src/server/rooms/base-room.ts`), an abstract Durable Object with SQL
    storage and WebSocket helpers. Official games extend it: Tangent's `worker.ts` defines `AppGameRoom` and
    `AppMatchmakerRoom` next to the stock rooms. That's the platform-sanctioned way to do server-authoritative realtime.
  - Side effect: the spike's `deepspace dev start` registered a scratch app (`app_01M7KGN4TAMQQJWD9BTM9T37C8`) in my account.

- **2026-11-16: Spike 1, AI judge (raw results recounted by me, drawings inspected).**
  - `claude-haiku-5-5` via `anthropic/chat-completion`: 100% top-1 on all "crude" finished drawings at 32, 64, 128 grids,
    with and without 15% random griefing noise; 95.8% across the full matrix. Sonnet matched Haiku at ~20x the cost.
  - Haiku: ~1.7s median latency, ~$0.00006-0.00008 per judge call (512px PNG ≈ 456 input tokens). Cost is a non-issue
    at one call per room every ~30s, but still gate it to active rooms.
  - Gotchas: render the grid upscaled with nearest-neighbour to 512px (native 32px dropped accuracy); set `max_tokens`
    ≥1024 because Haiku sometimes spends tokens thinking and returned `output_budget_exhausted` at 200; ask for raw JSON.
  - **Caveat I found looking at the contact sheet:** the "crude" set is actually tidy, centred, complete drawings. Real
    crowd art will be partial and messier, so the true accuracy is unknown. Re-test with real canvases once the app runs.
  - **Design implication:** the risk flipped from "AI can't read it" to "AI may read it too easily", and to drawing
    effort: a recognisable 64x64 drawing is hundreds of pixels, which one player on a multi-second cooldown can't finish.
  - Artifacts (local scratchpad, not in repo): `spike1/results.json`, `spike1/contact_sheet.png`.

- **2026-11-16: Installed the official DeepSpace agent skill** (github.com/deepdotspace/deepspace-skill @ dadfa91) into
  `.claude/skills/deepspace/` and `.agents/skills/deepspace/`, plus an `AGENTS.md` pointing every agent at it.
  Read it in full first: guidance only, no scripts.
- **2026-11-16: Source authority is permanent (from the skill).** An app's first deploy latches its Git authority
  forever: deploying from a checkout with a GitHub remote makes GitHub the source; deploying without one makes
  DeepSpace the source. This repo has no remote yet, so a GitHub remote must exist before the first deploy.
- Toolchain: Node v26.9.0, npm 11.19.1 (skill requires npm 11.6+; Node line still to check against the installation docs).

- **2026-11-16: Design doc approved:** `docs/superpowers/specs/2026-11-16-pixel-party-design.md` (builder check by OpenCode DeepSeek Flash; 6 of its 7 questions settled by me, solo-play decided by Will).

- **2026-11-16: Scaffold code lowers the day-1 risks (read by me in spike 2's scratch scaffold).** The scaffold's
  `src/server/realtime-routes.ts` WebSocket route already accepts connections with no token (identity null), so
  spectators work. Server-side record writes are a `RECORD_ROOMS` stub `POST /api/tools/execute` with
  `X-App-Action`, and integrations are `apiWorkerFetch(env, …)` with `APP_OWNER_JWT` (both in
  `src/server/action-routes.ts`). Both use only env bindings a custom Durable Object also receives. Still to prove at
  runtime in plan Task 1.
- **2026-11-16: Implementation plan written:** `docs/superpowers/plans/2026-11-16-pixel-party.md` (11 tasks; tasks 9-10 are should-ship).

- **2026-11-16: Task 1 BLOCKED before platform probes (Codex).** Scaffolded DeepSpace 0.44.2 into the repo,
  preserved existing project files, installed dependencies, and added the requested verify script and CI workflow.
  Owner login confirmed; Node v26.9.0 / npm 11.19.1. The current scaffold requires registration before committing
  its app id. `npx deepspace app init --json` exited 1 with the exact response below. No app was undeployed,
  no deployment/push was attempted, and no dev server was started. Stopped under the task's blocker rule.
  - (a) Identity: **NOT RUN / unproven** (registration blocked runtime startup).
  - (b) Integration from custom DO: **NOT RUN / unproven**; no response fixture exists.
  - (c) Record create/delete from custom DO: **NOT RUN / unproven**.
  - `npm run verify` with login and without login: **NOT RUN** after the blocking refusal; CI remains unverified.
  - Exact registration refusal: `{"ok":false,"code":"app_quota_exceeded","error":"Active app quota exceeded. Registered apps hold a slot even before their first deploy — `deepspace app list` shows them all; free a slot with `deepspace app undeploy <id> --yes` (works on never-deployed apps too) or upgrade your plan."}`
  - Controller/Will must resolve app quota (choose an app to retire or upgrade); then resume Task 1.

- **2026-11-16: Free plan = one active app.** Task 1 hit `app_quota_exceeded`: the scratch app spike 2 accidentally
  registered held the only slot (registered apps hold a slot even before deploying). Will approved
  `deepspace app undeploy` on it (never deployed, nothing lost); Pixel Party then registered as
  `app_01M7KJMT00JNWA2AWC31SC73N8`. New rule in every agent brief: never run `dev start`/`app init` outside this repo.

- **2026-11-16: Task 1 resumed after quota resolution.** Will retired the scratch app and registered Pixel Party
  in this repo as `app_01M7KJMT00JNWA2AWC31SC73N8` (production). No registration command was re-run by the implementer.
  Scaffold `npm run verify` passed (lint, TypeScript, 3 unit tests, Worker/client production build), both normally
  and under `sandbox-exec` denying reads of the CLI credential directory. `auth whoami --json` under that same
  sandbox exited 1 with `credential_unreadable` / EPERM, confirming CLI credentials were inaccessible.
  CI retains full `npm run verify` without login. Platform probes follow in Step 2.

- **2026-11-16: Task 1 platform assumptions PASS (Codex; DeepSpace 0.44.2, local Worker runtime).**
  - **(a) PASS:** `/api/pixel/:roomId/ws` admitted an anonymous WebSocket and the probe reported
    `{"type":"probe.identity","userId":null}`. Forged URL identity/role and `X-User-Id` / `X-User-Role`
    headers were ignored. Invalid JWT returned HTTP **401**. A real owner CLI-login JWT (not an invented token)
    produced the same user id as `auth whoami`; forged identity did not override it. No password or browser OAuth was needed.
    **SDK detail:** BaseRoom assigns anonymous attachments an ephemeral `anon-*` id; the throwaway probe used
    `isAnonymousUserId` to report the logical spectator identity as null. Future game authorization must use that
    helper rather than checking whether `user.userId` is truthy.
  - **(b) PASS:** one call from PixelRoom through `createServerTools(env).integration` and `apiWorkerFetch`,
    authenticated with `env.APP_OWNER_JWT` (developer billing), using the exact requested model/prompt/64-token budget.
    Response: `success:true`, `data.content:[{"type":"text","text":"ok"}]`, `stop_reason:"end_turn"`,
    `input_tokens:16`, `output_tokens:4`, `costUsd:0.0000036`. Full JSON response (no headers or credentials)
    committed at `src/game/__fixtures__/anthropic-response.json`; response text is directly under `data.content`.
  - **(c) PASS:** created record `1794880135952_r8kif0` in temporary `probes`, as the app owner via the internal
    RecordRoom tools endpoint. Delete returned `{"success":true,"data":{"deleted":true}}`;
    a follow-up query returned `records:[]`, `count:0`. No probe records remain.
  - Probe handler and `probes` schema removed. PixelRoom now ignores messages until the later game protocol task;
    anonymous connect and ping/pong still work. Stock users schema retained. No fallback Worker route needed.
  - Final `npm run verify` PASS with normal login and with CLI credential reads denied by macOS `sandbox-exec`,
    with **no `.dev.vars` file** in either run: lint, type-check, **6 tests / 3 files**, Worker + client build.
    Dev server stopped; task-generated `.dev.vars` removed; no `.dev.vars` remains in build output.
    No deploy, push, transfer, collaborator change, app init, or undeploy was run during this continuation.

- **2026-11-16: Task 1 review fix round 1 (M1/M2/M3/M6/M7/M8).** Client integrations now deny
  access with HTTP 403 unless explicitly configured with `client: true`; no integration opts in and the
  redundant Anthropic entry is removed. Website chat and local/browser HTTP/MCP agent registrations are
  unmounted, preventing a client bypass of PixelRoom's future AI budget. Empty action/cron registries,
  no-op jobs, metadata/auth/file/payment proxies and realtime routes contain no other integration/AI spend path.
  Server tools return ActionResult failures for fetch/JSON/null failures and reject missing owner credentials.
  CI has read-only contents permission and cancels superseded runs; merged scaffold guidance now states the
  GitHub source rule. Covering tests: **31 tests / 3 files**; full `npm run verify`: **34 tests / 5 files**,
  lint, type-check and Worker/client builds pass. No paid probe or deployment was repeated. M4/M5 remain deferred.

- **2026-11-16: Task 1 platform probes all passed** (custom DO): anonymous socket with forged identity → `userId: null`;
  invalid JWT → 401; real JWT → real account id; Haiku call from the DO via the proxy succeeded ($0.0000036);
  record create/delete from the DO succeeded. Anonymous sockets get an SDK `anon-*` id: game code must use
  `isAnonymousUserId`, not truthiness.
- **2026-11-16: Closed a scaffold spend hole (integration note).** The DeepSpace starter's browser proxy
  `/api/integrations/:name/:endpoint` let any signed-in user call any of the 38 integrations on the developer's bill,
  bypassing our AI budget. The reviewer filed it Minor; I confirmed it in `src/server/http-routes.ts` and raised it.
  Now default-deny (403 unless an integration is flagged `client: true`; none are), and the unused in-app AI
  agent/chat surfaces are unmounted. All AI spend goes through PixelRoom, where the budget applies.

- **2026-11-16: How the game room survives sleeping (Task 4b, interview-worthy).** DeepSpace's `BaseRoom` uses
  Cloudflare's hibernatable WebSockets: the room's memory can be dropped between messages while sockets stay open.
  So PixelRoom keeps nothing important in memory: the whole game state is one SQLite row reloaded on every wake,
  player counts come from the live socket list (each socket carries its verified user id as an attachment), and
  the room owns the Durable Object's single alarm for round timers and judge ticks.
- **2026-11-16: Judge safety rules (Task 4).** One AI call at a time per room; attempts are counted and saved before
  calling Claude (so crashes or failures can't bypass the 6/min cap); 20 s timeout on Claude, 5 s on the budget
  check; a late answer after the round ended is discarded; a garbage reply doesn't count as judged so the next tick
  retries; a budget refusal still throttles (no hot loop). Spectators and duplicate tabs don't count as players.
- **2026-11-16: Smoke deploy approved by Will** for right after Task 5 (spec said deploy early; catches production-only
  issues: custom DO migration, owner credential, alarms).

- **2026-11-17: Smoke deploy is live: https://pixel-party.app.space** (commit 65310b7 from `build/pixel-party`). The
  first deploy permanently claimed GitHub (`hewillcook/pixel-party`) as the source; `deepspace status` had predicted it.
  GitHub-source deploys ship the local working tree, so every deploy must come from a clean, pushed, CI-green commit.
  Live checks I ran: anonymous spectator gets the canvas; signed-in player recognized; bad token → 401; spectator
  can't place; pixels fan out live; cooldown enforced; Ask the AI → real Haiku guess ("mushroom, dome, hill" for a
  drawn circle); room pauses when the last signed-in player leaves. A first "404" was my own HTTP/2 curl test
  (WebSockets can't upgrade over HTTP/2), not the app; a real WebSocket client connected fine.
- **2026-11-17: Real AI cost from `deepspace app usage`:** each judge call places a ~$0.0011 hold that settles to
  ~$0.00009, matching spike 1. The 3,000-call daily cap is ≈ $0.27/day worst case. The account is on the free tier with
  449 of 500 credits left (100 credits = $1) and no renewal date shown, so the cap also protects the free allocation.
- **Note for later:** `scripts/ws-smoke.mjs` predates Task 5 (it uses random room ids, which now 404); refresh it in Task 7/8.

- **2026-11-17: Tests never spend money.** Automated tests run with a test-only build flag that makes the AI
  integration return `test_integration_disabled`; the test runner refuses to start without it and a readiness route
  proves it's active in the worker. The production bundle contains none of it (checked by the reviewer). Deploy
  checklist: make sure `PIXEL_PARTY_TEST` is not set when deploying.
- **2026-11-17: Honest evidence.** The UI agent's first win-screen screenshot used forced state it didn't disclose
  (185 pts for 4 px is impossible under the scoring formula). Now screenshots say exactly how they were made; the
  win/timeout frames are labelled as staged.

- **2026-11-17: Checkpoint.** Final whole-branch review (Gemini Argon) passed the spend boundary, identity, and
  shared constants end to end; its one must-fix was the trademarked "Pictionary" in the landing tagline (now
  "Multiplayer pixel drawing game vs. Claude Haiku"). The fix wave also removed unused scaffold WebSocket routes and
  AI chat files (-763 lines). Redeployed 86d37b4 (release rel_01M7KZCC29XE0QTB4ATAE8MM14); live smoke PASS.
  Opened a checkpoint PR build/pixel-party → main.
- **2026-11-17: Full round lifecycle proven live** (throwaway public room `52DVD9U7W8`, scripted owner client):
  judge tick fired without Ask after 17 s; drew "sun" → Haiku guessed crab, bug, then **sun** → round `won`,
  848 pts; next round timed out at exactly 5:00 → `timeout`; fresh round with an empty canvas 8 s later. Production
  logs: 0 warnings/errors/"hook failed" entries; the lobby lists the room (record writes working).
- **Proven live vs unit-tested only.** Live: spectator/signed-in sockets, validation, cooldown, fan-out, Ask, tick,
  win + score, timeout, intermission, pause, lobby listing, connect-error screens. Unit/integration-tested only:
  browser OAuth sign-in on the live site (Will to check), daily-budget exhaustion ("AI is resting"), 30-minute empty
  room close, waking from hibernation mid-round, private-room history permissions with two real accounts live.
- **Still to do (next iteration), in order:** (1) Will's hands-on checks, starting with signing in through the
  browser on the live site; (2) README + submission note (Task 11, required deliverable); (3) team mode (Task 9) or
  replay (Task 10), optional. Known small leftovers: landing copy hardcodes "15 seconds"; `npm audit` reports 1 low-severity issue.

## Spikes (throwaway tests)

| # | Question | Status | Result |
|---|---|---|---|
| 1 | Can Claude (via DeepSpace) recognise crowd pixel art, and at what canvas size? | done (Antigravity Gemini 4 Hydrogen; 130 Claude calls) | Yes. Haiku ~96-100% on finished drawings at 32/64/128 with 15% noise; caveat: test drawings were cleaner than real crowd art |
| 2 | Where should pixel data live: tiled records, `CanvasRoom`/`useCanvas`, or something else? How fast can writes go? | done (Codex GPT-6.1 Terra, source reading; latency not measured) | Custom `BaseRoom` DO per game room recommended; see findings |

## Future ideas

- Quick play / matchmaking once there is real traffic.
- In-game currency earned by playing, spent on extra "Ask the AI" requests.
- Generate more, harder daily prompts — the ~80 hand-written list repeats after ~80 days (Will, 2026-11-17).
- **Earned currency + cosmetics (tabled 2026-11-17).** Coins from wins, daily streaks and challenge results; spent on
  palettes, cursor trails, name colours, canvas frames. Earned only, never paid. Mostly new records and UI; stronger
  once daily play has enough repeat visitors to drive streaks.
- **Pixel-themed redesign (next, Will's request).** Pixel font/borders, larger centered canvas while drawing.

## Open questions

- Custom DO integration + record access: **resolved, Task 1 PASS** (see Findings).
- Cooldown length, round length, judge frequency
- Final name ("Pixel Party" for now)

## Verification log

| Task | Commit | Commands run | Result | Reviewer | Will to check by hand |
|---|---|---|---|---|---|
| 1 | `9859338` | `npm run verify` normal + credentials denied; signed-out/signed-in JWT WebSockets; one Haiku call; record create/delete/query | PASS: 6 unit tests; all three platform probes; probe removed | Implementer self-check only; controller review follows | Optional browser OAuth UI smoke; signed-in WebSocket identity already verified with real login JWT |
| 1 fix round 1 | `add7097` — `fix: close client integration proxy, harden server tools` | Covering tests; `npm run verify` normal + credentials denied | PASS: 31 covering tests; 34 full-suite tests; lint, type-check, Worker/client build | Implementer self-check; controller review follows | None added |
| 8 | `f19070a` | `npm run build && npx playwright test --config tests/offline.playwright.config.ts`; `npx playwright test --config tests/playwright.config.ts tests/api.spec.ts`; `npm run verify` | PASS: final offline Playwright 8/8 (4 existing + 4 daily); API Playwright 4/4 including daily `start`/`me` 401 JSON guards and `/api/__test/ready`; verify lint + type-check + 310 unit tests + build PASS. Verify tail: `Test Files 33 passed (33); Tests 310 passed (310); ✓ built in 818ms; [prerender] wrote 1 page(s) [/], _spa.html, robots.txt, sitemap.xml.` | Implementation self-check; controller review follows | Sign in and complete one daily attempt; optional real-judge check only with Will's go-ahead |

## Agent log

| Date | Agent | Task | Verified by me |
|---|---|---|---|
| 2026-11-16 | OpenCode DeepSeek Flash | Read docs.deep.space, summarise platform | Spot-checked llms.txt index |
| 2026-11-16 | Antigravity Gemini Flash | Read agent skill + example repos | Checked repo list with `gh repo list deepdotspace` |
| 2026-11-16 | Codex GPT-6.1 Terra | Spike 2: read SDK + Tangent/PartyPack source for pixel storage options | Confirmed BaseRoom, Tangent's custom rooms, full-record broadcast in source |
| 2026-11-16 | Antigravity Gemini 4 Hydrogen | Spike 1: generated test pixel art, ran 130 Claude vision calls | Recounted accuracy from results.json; inspected contact sheet and flagged test drawings as too clean |
| 2026-11-16 | Claude Opus (me) | Checked AI integration schemas, found Claude-only vision | Ran `deepspace integrations info` myself |
| 2026-11-16 | Codex GPT-6.1 Sol | Task 1 scaffold/CI, custom DO platform probes, fixture, cleanup; fix round closing the integrations proxy | Reviewed by Antigravity Sonnet (+ scoped re-review); I re-ran verify (34/34), read the proxy route myself and escalated M1, checked CI green |
| 2026-11-16 | Antigravity Gemini 4 Hydrogen | Task 2 game core (grid, rules, words, scoring) + 1 fix round | Reviewed by Codex Terra (2 Important found); I ruled on both (plural handling in matcher; pickWord fallback); re-review by OpenCode DeepSeek; I re-ran verify (65/65) |
| 2026-11-16 | Codex GPT-6.1 Terra | Task 3 PNG renderer + judge request/response | Reviewed by Antigravity Sonnet (approved); I rendered red/blue zone PNGs and inspected them |
| 2026-11-16 | Codex GPT-6.1 Terra | Task 4a pure room logic + judge flow (split from Task 4 on advisor input); asked 4 good questions instead of guessing | I answered the 4 design gaps; review by Antigravity Sonnet found an alarm hot-loop after budget refusal + unpersisted attempts; fixed + re-reviewed; I re-ran verify (107/107) |
| 2026-11-16 | Codex GPT-6.1 Sol | Task 4b PixelRoom + BudgetRoom Durable Objects; real-JWT local smoke (Haiku guessed "sun, star, asterisk") | Review found 4 Important (no timeouts, writes on every message, alarm re-arm, unvalidated room id); fixed; re-reviewed by Gemini Argon (Sonnet quota hit); I re-ran verify (145/145), checked the smoke script never prints or saves the JWT |
| 2026-11-16 | Codex GPT-6.1 Sol | Task 5 collections, permissions, room actions, route access, record-writing seams; two-user Playwright specs | Reviewed by Gemini Argon (checked SDK runtime: per-row member lists are the only way to get public+private reads); 1 Important fixed, re-reviewed by OpenCode DeepSeek; I re-ran verify (183/183), deployed, and ran live checks myself |
| 2026-11-17 | Antigravity Gemini 4 Argon | Task 6 UI: lobby, room page, canvas, guess feed, Ask button, presence cursors; 1 fix round | I viewed the screenshots and caught an impossible win score (staged state not disclosed) and wrong copy; Sonnet confirmed no state-injection hook ships; 6 Important fixed (connect-error screens, copy, a11y, signed-out join, contributor display); re-reviewed; I re-ran verify |
| 2026-11-17 | Codex GPT-6.1 Terra | Task 7 two-user Playwright spec (sync, spectator, cooldown, private room), refreshed smoke script, carried fixes; 1 fix round | Sonnet found a flaky cooldown step, a vacuous spectator assertion, a fail-open test guard, and possible cleartext JWT in the smoke script; fixed; spec stable 3 runs in a row; re-reviewed by OpenCode DeepSeek; I re-ran verify, CI green |

## 2026-11-17: Solo drawing and private-room fix batch

- Solo cooldown is zero; pointer segments use Bresenham interpolation. The client paints immediately and batches
  at most 64 cells per WebSocket frame once per animation frame. The server validates each cell, persists the
  batch once, and enforces a persisted per-user token bucket (60-cell burst, 60 cells/second refill). Multiplayer
  cooldown scaling stays unchanged; duplicate tabs share the same user's bucket. Rejections identify their cell
  so partial batch rejection rolls back only that optimistic cell. Legacy single-cell `place` remains accepted.
- New private rooms use four crypto-generated characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, with ten
  collision attempts and the collection's existing unique index protecting concurrent creators. Public rooms
  keep ten characters. Closed codes remain reserved to preserve old links and the existing unique constraint.
  Lookup canonicalizes uppercase (except `play`) and pages legacy records on a canonical miss for mixed-case codes.
- New private rooms start in `lobby`, with no visible word/timer/canvas or paid judge calls. The host's existing
  `next` command starts the first round with one or more players. The WebSocket carries a deduplicated signed-in
  roster; empty lobbies retain the 30-minute close alarm. Existing persisted playing rooms and the default board
  retain their lifecycle. The rooms schema and home list already support `lobby`; no schema migration was needed.
- Room rendering waits for an authorized snapshot. Route/auth/session changes mask old state immediately,
  before effect cleanup; terminal 401/404/410 screens retain priority. Private headers show a code badge and
  copy the full invite URL. Verified anonymous JWTs cannot enter private rooms.
- Unit coverage locks zero integration calls (and zero reservations/renders) for both tick and Ask in lobby,
  anonymous-only, paused, empty, and unchanged-canvas states. Additional tests cover batch caps/refill/restart,
  targeted rollback, legacy state restoration, code collisions/casing, lobby alarms, host authorization and starts.
- Verification: `npm run verify` PASS (221 tests, lint, TypeScript, Worker/client builds, prerender).
  `npx playwright test --config tests/offline.playwright.config.ts` PASS (5 tests). This suite serves the built
  client through Playwright HTTP/WebSocket interception, with unsigned local fixtures and no server or credentials:
  delayed private access never mounts game UI; solid optimistic drag/batching/rollback; lobby/copy/solo Start;
  public spectator sign-in; same-component public-to-private navigation. The live-runtime private-room spec was
  updated but not run: its harness requires DeepSpace test accounts and a running auth service.
- Optional failed-join rate limiting was skipped: there is no simple atomic per-user storage seam in the current
  action; an isolate-local counter would not be durable. No dependencies, permission changes, deployments or pushes.
- Provider: implementation and verification by Codex; no nested agents (implementation sub-agent assignment).
- Opus review follow-up: Gemini Argon review verdict Ship (0 Critical / 0 Important / 2 Minor). Applied Minor 2:
  a new lobby arms its 30-minute close timer at creation (`emptySince = now`), so a lobby nobody ever connects to
  still closes. Minor 1 (legacy mixed-case codes) is moot: old codes were generated uppercase.
- **2026-11-17 live verification (Opus), release after cbeabc4:** deployed; `scripts/ws-smoke.mjs` updated for the
  new rules (solo second placement now accepted instantly; rejections carry cell coords; Ask retried once after
  an automatic judge tick consumes the 10 s Ask gap; spectator compares the matching judgement) and passes every
  check through a real Haiku Ask ("sun, star, asterisk" for the drawn sun). Its final pause check could not pass
  because a real signed-in browser tab (Will) was on the public board, which correctly keeps it running.
  Private-room live run (room `QX3J`): 4-char code; signed-out request 401; lowercase code connects (101);
  unknown code 404; lobby snapshot has no word and no timer; painting in lobby rejected `round_inactive`; no judge
  in lobby; host Start begins a 5:00 round; a 20-cell batch was fully acked in 91 ms with no rate limiting;
  leaving and rejoining keeps the same round.

## 2026-11-17: Daily mode final-review fixes

- Fixed I1–I5 plus FIX-BEFORE-MERGE minors M3/M13; other review minors remain deferred.
  Full per-finding changes, covering tests, and TDD evidence are in
  `.superpowers/sdd/2026-11-17-daily-mode/final-fix-report.md`.
- The referee persists the complete winning grade/image and display profile. The
  DO serializes current-best collection publication per player/day; start, grade,
  end, and state reads can repair a failed projection. No background queue was added;
  publication preserves existing visibility and medals.
- Grade/end carry the server-issued attempt day. `/me` resumes a live yesterday
  attempt through grace even when today's row exists. The client refreshes idle/
  ended pages across midnight and resets new-day drawing/results/scheduling.
- Party and daily share the build-time fake/real policy, with no paid party call
  in fake/local mode. Stale completions explicitly reject; client best is the
  referee best. A five-minute lease covers bounded retries, and later phases check
  ownership. Ending an ended attempt cannot change its cells; the first accepted
  zero-point grade now saves its actual snapshot.
- Final validation: focused Vitest **149/149**, `npm run verify` PASS (**333 unit
  tests**, lint, type-check, build/prerender), offline Playwright **8/8**, real
  test-worker API Playwright **4/4**, `git diff --check` PASS. Known runner warnings
  remain unchanged. No real AI calls, `DAILY_JUDGE` override, deployment, or push.
- Provider: Codex implementation, self-review, and verification; no nested agents.
- **2026-11-17: Pixel redesign direction agreed with Will** (visual companion mockups). VT323 everywhere, Navy glow background, Sunset accents in mockup A's design language, bigger centered canvas, chiptune SFX for four events (no per-pixel sound, no music) with a mute button, running guess log, and a watcher count (Will's call; the one server addition). Design: `docs/superpowers/specs/2026-11-17-pixel-redesign-design.md`; builder check by OpenCode DeepSeek Flash, 5 points settled by me, 2 by Will.
- **2026-11-17: Pixel redesign built** (branch `t3/pixel-redesign-direction`, plan `docs/superpowers/plans/2026-11-17-pixel-redesign.md`, subagent-driven). Watcher count, per-round guess log, chiptune SFX + mute (Codex GPT-6.1 Terra); theme tokens + VT323, room page with big centered canvas (672px at 1440×900), other pages (Antigravity Gemini 4 Argon). Per-task reviews by Gemini 4 Hydrogen / Codex Sol, scoped re-reviews by OpenCode DeepSeek Flash; final whole-branch review Codex Sol xhigh → one fix wave (Codex Terra). Verify 247/247, offline Playwright 11 passed. Open: mobile results overlay hides its buttons below a scroll (375px).

## 2026-11-17: Room codes, host shutdown, explicit starts, and initial HTML

- All newly created public and private rooms use four characters from the existing crypto alphabet, retaining
  ten collision attempts and unique-index race retries. Closed codes remain reserved. The join field uppercases
  input and advertises four characters; its 64-character ceiling and the permissive server pattern preserve
  legacy ten-character links/codes and `play`.
- Hosts can confirm Delete room in the room header and on their public-room cards in the home list. The new
  authenticated action checks host ownership, refuses the default board, closes the record without deleting it,
  and sends an internal shutdown request to its PixelRoom. Shutdown persists a tombstone (including rooms never
  opened), broadcasts a terminal host-closed message, closes sockets, and deletes the alarm. Status writes are
  serialized so a pending playing/paused update cannot overwrite closed. Further judge calls stop; results of
  an already issued integration call are discarded. The client displays “This room was closed by the host” and
  does not reconnect. The existing non-closed-room quota filter frees the host slot; action tests verify this.
- Round results now wait indefinitely for explicit New game, with no intermission alarm or countdown. Legacy
  intermission deadlines are discarded on restore. A long pause resumes the same frozen round rather than
  generating another word. Empty custom rooms still expire after 30 minutes, including rooms waiting on results.
  The `next` command requires a connected signed-in caller: host while connected; any such player when the host
  is absent; any such player on `play`. Unknown legacy hosts remain denied conservatively. Fresh public/private
  rooms and a fresh default board wait in lobby; corrupt-state recovery also waits for Start. Valid persisted
  playing rounds retain their state. Explicit Skip Round remains available under the same authorization rules.
- **Superseded bug #4 diagnosis (corrected below):** the first offline flash test deliberately served the
  prerendered landing HTML for `/r/*`. That synthetic case did not reproduce production, which already serves
  the empty SPA shell. Commit `4ff80c8` added worker-first room routing and a 503 fallback on that unsupported
  diagnosis; the follow-up removes those changes. The initial test's failure was not evidence of the user's flash.
- Verification: `npm run verify` PASS (lint, TypeScript, 239 unit tests across 21 files, Worker/client builds,
  prerender). `npx playwright test --config tests/offline.playwright.config.ts` PASS (8 tests, 3.2s). New coverage
  also checks confirm/cancel deletion, no reconnect after closure, and explicit starts on custom/default results
  when the host is absent. The smoke script explicitly starts a waiting board and accepts retained results after
  disconnect; live smoke/account suites were updated where needed but not run. No dependencies or schema migrations.
  No deploy, DeepSpace push, or Git push commands were run.
- Provider: implementation, self-review, and verification by Codex; no nested agents (implementation sub-agent assignment).


## 2026-11-17: Production flash investigation and routing rollback

- Read-only production Chromium traces used fresh signed-out contexts for direct `/r/QX3J`, `/home` → Join
  `QX3J`, and full reload. The throwaway script, JSON insertion/network timelines, compositor screenshots and
  videos remain outside the repo at `/tmp/pixel-production-trace.mjs` and `/tmp/pixel-production-trace-final/`.
  Initial room HTML is 838 bytes with an empty root, no prerender marker and no board markup.
- QX3J currently returns HTTP **410**, so these traces reach **This Room Has Closed**, not the private-room
  sign-in card. Terminal-card insertions occurred at 1238.7 ms for direct navigation, 1223.9 ms from the home
  document's navigation start for home → Join, and 962.3 ms for reload. A document-start MutationObserver
  recorded zero canvas, board-test-id, role-grid, landing-grid or large cell-grid insertions in all three flows.
  Videos and screenshots show the blank AuthBoot/Connecting state followed by the closed card. No redirect to
  `/`, `play` connection, home board preview or transient canvas was observed. AuthBoot is at
  `src/pages/(app)/_layout.tsx:64`; the room's existing loading guard is at `src/pages/(app)/r/[code].tsx:264`;
  its terminal branch begins at line 269. These guards already existed in the production base `fb3e1a6`.
- Reverted `4ff80c8`'s `run_worker_first` additions, special room static handler, 503 behavior and four unit
  cases for that handler. Kept the accepted lifecycle coverage and replaced the synthetic navigation-fallback
  fixture with direct/home-join/reload coverage using the normal empty shell and a delayed 401. The new tests
  observe insertions from document start, check initial and reloaded HTML, and confirm lowercase home input
  navigates to the uppercase room. Both existing code and the reverted routing pass these checks. This is
  additional negative coverage, **not a red/green reproduction or a proven fix for the reported bug**.
- Bug #4 remains unresolved. A currently active private room that returns 401 is needed to trace the actual
  reported path; production was not changed or revived. No speculative client fix was added.
- Verification: `npm run verify` PASS (lint, TypeScript, 235 unit tests across 21 files, Worker/client builds,
  prerender); `npx playwright test --config tests/offline.playwright.config.ts` PASS (9 tests, 3.1s).
  The four fewer unit tests are the removed routing-workaround cases. No deploy or push commands were run.
- Provider: investigation, focused rollback, coverage and verification by Codex (implementation sub-agent).

## 2026-11-17: Redesign merged with main and review findings closed

- Merged `origin/main` (`fb45ffd`) into the redesign branch with merge commit `3fb7ba5`.
  Resolved six textual conflicts by preserving main's room-code, lifecycle, permission,
  routing and explicit-start behavior alongside the redesign's layout and state additions.
- Results now keep View Canvas/New game in a fixed, non-scrolling card footer with compact
  narrow-board content. Countdown audio waits for a fresh reconnect snapshot; disconnected
  and terminal states stay silent. Preserved main's four-character invite copy and removed
  the dead RoundBar room-name prop; canvas measurement now accounts for document/main scroll.
- Delete-room controls/dialog, mobile host-room cards and nav/logo/toggle focus are consistent
  with VT323, square panels and Sunset tokens. Protected palette, judge, scoring and budget
  files are unchanged from main. The dependency lockfile was unchanged, so no reinstall.
- Verification: `npm run verify` PASS (lint, TypeScript, 263 unit tests across 24 files,
  Worker/client builds and prerender); offline Playwright PASS (19 tests, 1 intentionally
  gated screenshot capture); explicit screenshot run PASS with all 13 captures inspected.
  Both 375×812 and 1280×720 results-control bounds tests run in the ordinary offline suite.
- Full conflict audit, per-finding tests, logs and screenshot list:
  `.superpowers/sdd/2026-11-17-pixel-redesign/merge-and-fix-report.md`.
- No push, deployment, PR or nested agents. Implementation and verification by Codex.


## 2026-11-17: Daily branch merged with pixel redesign

- Merged origin/main d8ad9ec into daily mode (6bbc9e9); main's redesigned lobby now lives at /party, daily remains
  /home, and room back links and daily-first landing copy preserve both branches' intent.
- Applied shared synthwave tokens, VT323, square panels/buttons and measured board-size canvas to all daily states,
  the leaderboard, verdict/timer/thumbnails and public profiles (67b72df). Added persisted mute and live-only daily
  grade/countdown/end sounds; no pixel-placement sound or AI/scoring changes.
- Fixed invalid-day stale-tab recovery and captured-day /end targeting; reduced the grade lease to 90 seconds
  with exact-boundary and 80-second production retry tests (27881be). Eight offline browser regressions cover
  invalid grade/end recovery to unstarted, live or ended today, plus failed refreshes.
- Verification: npm run verify PASS (383 tests / 39 files), build + offline Playwright with SCREENSHOTS=1 PASS
  (38/38, none skipped), real local test-worker API Playwright PASS (4/4), git diff --check PASS.
- Fifteen daily/profile screenshots at 1440×900, 1280×720 and 375×812 are in docs/superpowers/screenshots/2026-11-17-redesign/.
  Conflict resolutions, test output tails, visual inspection and unchanged dev-local timeout/dependency caveats:
  .superpowers/sdd/2026-11-17-daily-mode/merge-redesign-report.md. No push, deploy, DAILY_JUDGE override or real AI call.
- Provider: Codex implementation, screenshots, self-review and verification; no nested agents.

### 2026-11-17 — Daily fixes PR 1

- Added durable fixed auto-grade windows, server-side blank/unchanged skips and missed/late outcomes, an app-wide scheduler, and a loading state that avoids a not-started flash.
- Added the timeline, clearer scoring and manual-grade controls, and Exit without submission. Final review hardened concurrent submissions, lease expiry, window identity, local timeout snapshots, and clock alignment.
- Verification: `npm run verify` PASS (40 files, 411 unit tests; lint, type-check and build); `npm run build && npx playwright test tests/offline` PASS (44 passed, 6 screenshot tests skipped); `git diff --check` PASS.
- Provider: Codex implemented; reviews by Codex Sol and Gemini Hydrogen; planned by Claude Opus.

### 2026-11-17 — Drawing tools (PR 2)

- Added white paint (`PALETTE[16] = '#ffffff'`, `MAX_COLOR = 16`) and alternating cream empty canvas tiles (`EMPTY_CANVAS = ['#f3ead8', '#efe3cc']`) while keeping `PALETTE[0] = '#ffffff'` for judge PNG rendering and preserving backward compatibility with legacy 0–15 snapshots.
- Implemented pure tool and history modules (`src/game/tools.ts`, `src/game/history.ts`, `src/game/canvas-intent.ts`), the labelled `ToolBar` component, `useToolShortcuts` (`B`/`E`/`F`/`I`, `⌘/Ctrl+Z`, `Shift+⌘/Ctrl+Z`, no displayed shortcut text), and tool-aware `PixelCanvas` (including stroke boundaries and erase hover preview).
- Wired Party rooms (`/r/:code`) with `Paint`, `Erase`, and `Pick colour` (never rendering Fill/Undo/Redo), server/client `0..MAX_COLOR` validation, cooldown-enforced non-empty erases, free silent no-op for erasing already-empty cells, and updated `pixelsUsed` at round end.
- Stacked onto `t3/pr1-daily-fixes` and wired Daily (`/home`) with `DAILY_TOOLS` + Undo/Redo (`100`-step in-memory history), single-step drag strokes and iterative flood fills, `useToolShortcuts`, and `useDailyAttempt.replaceCells` gated like `paint` and persisted to `localStorage` for PR 1's auto-grade scheduler.
- Verification: `npm run verify` PASS (44 files, 441 unit tests; lint, type-check, Worker/client build); offline Playwright `tests/offline` PASS (50 passed, 6 gated screenshot tests skipped); `git diff --check` PASS.

### 2026-11-17 — Porch theme and navigation (PR 3 Task 2)

- Reused the scene palette for the porch theme and built the sign beam, signs, lantern and account mailbox with pixel sprites. Added Daily, Party, Scores and Gallery navigation and the temporary Scores page.
- Verified `npm run verify` (456 unit tests), the offline Playwright suite (57 passed, 12 screenshot tests skipped), and six inspected Party and Settings captures at desktop and phone sizes under `docs/superpowers/screenshots/2026-11-18-porch/`.
- Updated existing offline assertions for the renamed Party link, porch colours and focus offsets, and excluded decorative nav canvases from the private-board insertion guard while retaining its drawing-canvas coverage.
- Art pass: rebuilt the beam, suspended plank signs, lantern, logo sign and mailbox sprites; replaced the smooth backdrop with static palette bands and dithered seams; added corner nails and increased panel type sizes. Verified 456 unit tests, 61 offline tests, and seven inspected captures including `/home` at 1280×720.
- Review fixes: corrected button/logo contrast, made scene measurement safe for server rendering, cleared sprite canvases before redraw, and fixed pixel sizing, logo target size and signed-out Gallery drawer behavior. Verified 458 unit tests and 63 offline tests.

### 2026-11-18 — Studio review fixes and remaining screens restyled (PR 3 Tasks 5c & 6)

- Fixed studio navigation mailbox tag clipping at 1440×900 (`Offline host`), matched order-form/ticket submit `pp-btn` sizing with high-contrast disabled states, calmed the room top bar into an invite ticket (`Copy link`), pixel radio `MuteButton`, and a `Host ▾` dropdown menu (`Skip round`/`New game` + `Delete room` confirmation dialog), and widened the lobby container so the top bar stays on one row at 1280×720.
- Added shared `.pp-wood-panel` timber bezel frames and restyled remaining utility/fallback routes: opened porch-mailbox letter settings (`src/pages/(app)/(protected)/settings.tsx`), an empty dusk-beach 404 scene (`You wandered off the porch` + `Go home` sign in `src/pages/[...all].tsx`), and plain porch-wood frames on the protected sign-in gate, `ErrorScreen` (zero UI-library dependencies), and `api-status`.
- Verification: `npm run verify` PASS (51 test files, 465 unit tests; lint, type-check, Worker/client build), `npm run build && npx playwright test tests/offline` PASS (115 passed, 34 screenshot tests skipped), `SCREENSHOTS=1 npx playwright test tests/offline/porch.spec.ts tests/offline/screenshots.spec.ts` PASS (62 passed), `git diff --check` PASS, and visual inspection of updated studio, room, settings, 404, signed-out, and api-status screenshots under `docs/superpowers/screenshots/2026-11-18-porch/` and `docs/superpowers/screenshots/2026-11-17-redesign/`.

### 2026-11-18 — Phase C review fixes (PR 3)

- Rendered `<NeutralPorchLoading testId="room-loading" />` during room connection loading instead of plain `"Connecting…"`, moved studio portrait layout rules onto `[data-composition="portrait"]` (supporting `1024×1366` tablets and capping portrait/sub-1440px landscape nav pixel scale so mailbox tags fit), anchored `More easels` above bottom scene crop at `1366×768` while lifting easels cleanly above it, excluded unconfirmed optimistic `state.pending` cells from room score breakdowns (`pixels + time === shownTotal`), separated intermission `New game` from the `Host ▾` dropdown (restoring `Escape` focus on close), tightened the studio arrival-settle camera assertion, replaced the ticking nav roof `<PixelScene>` with static `<PorchNavRoof />` redraws over transparent canvas backing (removing the flat `#614052` slab on `/settings`, signed-out, and `/api-status`), and removed dead `shelfRef`/`defaultBoardStatus`/`hasDefaultBoard` plumbing.
- Verification: `npm run verify` PASS (51 test files, 465 unit tests; lint, type-check, Worker/client build, prerender), `npx playwright test tests/offline` PASS (119 passed, 34 screenshot tests skipped), `SCREENSHOTS=1 npx playwright test tests/offline/porch.spec.ts tests/offline/screenshots.spec.ts` PASS (63 passed), `git diff --check` PASS, and visual inspection of regenerated screenshots (`1366×768`, `1024×1366`, `1280×720`, `1440×900`, `375×812`).

### 2026-11-18 — Scores chalkboard & gallery wall (PR 4)

- **Task 7 (`/scores` chalkboard):** Restyled `Leaderboard` (`src/components/daily/Leaderboard.tsx`, `src/components/scores/scores.css`) and `src/pages/(app)/scores.tsx` as a stationary close-up of the porch's floating wood-framed `#293b4a` slate chalkboard against the porch sunset (`PlayScenery showRoof={false}`), complete with chalk rows (rank, square avatar, name link to `/u/:userId`, medal, score, and chalk-framed `PixelThumb` once today ends or on past days), chalk day-paging arrows (`Previous day` / `Next day`), `Haiku` sitting on the wooden chalk ledge (`"Haiku's favourite today: …"`), and three `BoosterSprite`s below. Filtered out never-graded attempts (`score === 0` with no guess) before ranking, removed the leftover `<Leaderboard />` widget from `src/pages/(app)/home.tsx` (updating `tests/offline/daily.spec.ts` signed-out home expectation to check the porch chalkboard), and verified responsive layout at `375×812`.
- **Task 8 (`/u/:userId` gallery wall):** Added `GalleryBackdrop` (`src/components/gallery/GalleryBackdrop.tsx`) depicting an indoor warm wood-panelled wall lit by a diagonal dithered sunset window, and redesigned `src/pages/(app)/u/[userId].tsx` + `src/components/gallery/gallery.css` to hang graded daily drawings newest-first in gilt frames (medalists) or walnut wood frames with brass plaques (prompt, date, score, medal, `"Haiku guessed: …"`). Hidden never-graded entries, switched heading between `"Your gallery"` (owner) and `"<Name>'s gallery"` (visitors), added the empty-wall single frame state (`"No drawings to show yet."` + `"Paint today's prompt"` → `/home`), and verified porch leaning-canvas and mailbox `"My gallery"` links plus single-column `375×812` layout.
- **Verification:** `npm run verify` PASS (54 test files, 475 unit tests; lint, type-check, Worker/client build, prerender), `npx playwright test tests/offline` PASS (131 passed, 36 gated screenshot tests skipped), `SCREENSHOTS=1 npx playwright test tests/offline/porch.spec.ts tests/offline/screenshots.spec.ts` PASS (72 passed), `git diff --check` PASS, visual inspection of `scores-*` and `gallery-*` captures across `1440×900`, `1280×720`, and `375×812` in `docs/superpowers/screenshots/2026-11-18-porch/`.

### 2026-11-19 — Porch ↔ basement floor-pan polish (second pass)

- **Overlay travel:** `VerticalSceneTransition` no longer mounts a canvas-only preview for the incoming room. The route swaps while the outgoing snapshot covers the screen, then the live `<main>` element itself moves into the off-screen half of the moving stack, so the studio ticket board, code box, set-up form, Magic Easel, Upstairs sign, porch easel card, chalkboard text and basement sign all travel in lockstep and never remount. The live page is hidden (`visibility`) in the shell until it enters the stack; the app nav is left out of the stack (z-index 14 under the nav) so it stays put. `location.state.verticalScene` tells `PorchScene`/`StudioLobby` to skip the return flourish and arrival camera settle, and `.porch-world--vertical-arrival` / `.studio-world--vertical-arrival` disable the entrance animations that would otherwise fade overlays in mid-move. Pan is 1100 ms on cubic-bezier(0.3, 0.05, 0.5, 1): motion starts on the first frame (the requested 0.55/0/0.25/1 leaves the first ~200 ms nearly still and peaks near 2.9× average speed, which the audit reads as a hard cut) with a long soft landing.
- **Floor band:** redrew the cutaway as deck boards with end joints and nails, a darker cavity, short end-grain joist squares (about half the cavity deep, growth-ring dots) hanging off the deck, one horizontal beam below them, a pipe, a wire and a 6×3 mouse with a tail on the beam, then the basement's tongue-and-groove ceiling with a hanging bulb. The studio's own ceiling joist band is gone (`drawStudio` starts at brick), so the pan reads ceiling boards → brick wall instead of two stacked ceilings.
- **Stairwell + sign:** the studio's ceiling/wall opening is now a framed dark stairwell (stringer, five lit treads, handrail, warm spill), positioned at scene y ≥ 36 so it clears the nav logo and links at 1024×768, 1196×827, 1280×720, 1366×768, 1440×900, 1512×982 and 1920×1080. The "Upstairs" tablet uses one pixel up-arrow (7-px triangular head on a 2-px shaft) plus a legible DOM label (`--px × 4.6`); portrait keeps only the dock's Upstairs button.
- **Audit:** `tests/offline/audit.spec.ts` now samples the studio ticket board, code box and porch easel card (rect + computed opacity), reports their present window/coverage/monotonic y to a local metrics file (not kept in the repo), and the vertical transition specs wait for the overlay to unmount before settling. Results: all overlays present 99–100% of the move and monotonic; `tx-porch-to-party`, `tx-party-to-porch`, `tx-party-to-scores`, `tx-party-to-gallery` and `tx-nav-home-to-party` show nav size stable, no hard cuts, no flat frames.
- **Verification:** `npm run verify` PASS (56 test files, 502 tests), offline Playwright PASS (156 passed, 70 gated), audit PASS (34 captures). No push or deploy.

### 2026-11-19 — Nav + zoom transition smoothness (WS2)

- **One zoom curve everywhere:** new `src/scene/zoom.ts` holds the shared 800 ms `cubic-bezier(0.45, 0, 0.2, 1)` curve for the Daily easel, Scores chalkboard and gallery wall (in and out). `scene.css` uses it as the `--scene-zoom-easing` default; `PlayBackdrop`, `PorchScene` (`ZOOM_MS`, `SCORES_ZOOM_MS`) and `ScoresPage` all read the same constant. First-frame step drops from ~1.3× to 1.001×, max frame step 1.02–1.07×.
- **Nav full ↔ compact animates:** `themes.css` registers `--nav-px`/`--nav-c`, animates them 360 ms, and derives the bar height from both, so the bar goes 108 ↔ 52 px monotonically. Both logo sprites stay mounted and cross-fade/scale into the compact spot, the signs retract upward and fade behind the beam clip, and the compact roof cross-fades. Daily play now keeps the nav as an absolute overlay (with a 52 px `main` inset) so its animation can never resize or move the board. A direct load into a play page paints the compact bar at once (`data-nav-animate` only while a play transition runs). Leaving Daily expands the nav while the camera pulls back.
- **Hand-off zooms:** a route swap mid-zoom stores its live progress (`returnFlag` + `useContinuingZoom`); the destination continues the exact same curve from that camera instead of restarting, so `/scores` arrives while still zooming (swap at 55 % of the curve) and the porch continues a scores zoom-out. `PorchScene`/`ScoresPage` share that path in both directions.
- **UI entrance overlaps the zoom:** Daily's left panel, right panel and painter tray are held hidden from the first frame (`data-play-phase`) and enter at 70 % of the zoom, staggered −16 px / +16 px / +16 px with ≤200 ms total stagger; the exit fades them in 160 ms. The Scores board animates in over 200 ms from the hand-off. The porch easel card and chalkboard text fade out over 120 ms before the Daily view swaps in (and back in as `--returning`/`overlayFade`), never removed in frame 1.
- **Gallery dissolve:** the warm veil now rises over 120 ms at the end of the zoom and clears over 120 ms on the next page (was 300 ms + 300 ms across a 460 ms plateau); the reverse gallery exit fades the same veil in 120 ms and the porch clears it in 120 ms.
- **Scores list affordance:** the slate list keeps 120 px painting rows, so it now shows a drawn pixel scrollbar (track/thumb tracked from `scrollHeight`) plus a bottom fade, only when the list actually overflows.
- **Audit harness:** `tests/offline/audit.spec.ts` samples effective opacity and rects for the daily left/right/tray, scores board content, easel card and chalkboard text, and reports per transition: nav travel (span/monotonic/max step), zoom first/max step, camera settle, per-element time to 0.95 (+ offset from settle, rising-before-settle), overlay max opacity step and flat-frame span, plus a generated acceptance-check section.
- **Verification:** `npm run verify` PASS (57 files, 511 tests; lint, type-check, build, prerender), offline Playwright PASS (156 passed, 70 gated), `AUDIT=1` audit PASS (34 captures, 21 transition rows). All acceptance checks pass; the only remaining hard cut is the pre-existing, deferred porch→settings cut. No push or deploy.

### 2026-11-19 — Mailbox zoom into `/settings` (WS2 follow-up)

- **Zoom target:** new `src/scene/porch/mailboxCamera.ts` frames the porch mailbox at 2.6× with the same clamping as the other object cameras, shared by `PorchScene` and the settings backdrop (plus `mailboxCamera.test.ts`). A modest zoom keeps the mailbox, window, post and railing readable instead of flattening into a brown field.
- **Porch side:** `PorchScene` gains a `settings` transition kind and `goSettings(path)`: it zooms onto the mailbox with the shared 800 ms `cubic-bezier(0.45, 0, 0.2, 1)` curve, then hands the in-flight zoom to `/settings` at 55 % (`setSettingsArrival` + a `mailbox`-origin hand-off). The scene-nav `settings` event is now handled (previously ignored), which also fixes `/party → Settings`: the studio's vertical floor pan lands on the porch and the follow-up event now starts the mailbox zoom. Room/gallery/scores paths chain through the porch as before, and the account modal on `/home` dispatches the same scene nav instead of navigating directly.
- **Settings page:** `src/pages/(app)/(protected)/settings.tsx` now keeps a porch backdrop at the mailbox camera behind the letter and continues the hand-off curve, so there is no cut and no dead plateau. The letter (title chip + envelope) rises 24 px and fades in over 220 ms starting at the swap (~70 % of the zoom); leaving fades it out in 150 ms, then pulls the camera back out of the mailbox and hands that zoom back to the porch at 55 %. Styling lives in `src/components/settings/settings.css` (backdrop scrim, stage entrance/exit, reduced-motion off switches). Reduced motion still navigates instantly in both directions.
- **Audit:** tracked `[data-testid="settings-letter"]` (effective opacity), added `settings-to-porch` and `party-to-settings` transitions (both viewports for the former), grouped `porch-to-settings` / `settings-to-porch` / `party-to-settings` with the zoom acceptance checks, and added `cameraIdle` settling to the settings rows. `handoffProgress` now never steps behind the frame that was already on screen when the route changed, removing the small back-step at the swap.
- **Verification:** `npm run verify` PASS (58 files, 516 tests; lint, type-check, build, prerender), offline Playwright PASS (156 passed, 74 gated), `AUDIT=1` audit PASS (38 captures, 25 transition rows). All settings rows: first step 1.000–1.001, max step 1.051–1.062, zero hard cuts, panel ≥0.95 at 250–267 ms *before* the camera settles. No push or deploy.

### 2026-11-19 — Scores takeover registration, settings composition, settings nav (third pass)

- **Scores takeover:** `scoresCamera.ts` gains `projectChalkboardRect()` and `/scores` wraps the board in a `scores-board-register` layer whose transform (translate + uniform scale, origin 0 0) maps it onto the projected canvas chalkboard every frame. A new `useRenderedCamera` hook reads the camera the scene is actually painting with (live CSS transform) so the registration also holds while a CSS-driven zoom-out runs; `data-chalk-rect` exposes the projection for the audit. The board's entrance animation is now opacity-only (its 10 px rise fought the registration). Verified ≤0.6 px max edge error on every frame where the panel is above 0.05 opacity (porch-to-scores, nav-home-to-scores, scores-to-porch, plus the daily-ended/party rows).
- **Scores content:** the slate reproduces the canvas chalkboard's five rules at the exact same fractions (14.29 %, 31.43 %, 48.57 %, 65.71 %, 82.86 %) so the rules cross-fade in place, and the list spreads short rows down the board (`justify-content: space-between`) instead of leaving an empty lower half. Chalk and rows already share `rankScores` order; the top five entries match.
- **Settings composition:** `mailboxCamera.ts` now returns a `mailboxFraming()` (mode + camera + rect): mailbox flush-left beside the letter when there is room (`side`), otherwise centred and pinned low (`below`). Zoom dropped to 2.4 (scene px 12 / 9.6 / 7.2 vs the Daily easel's 18 / 14 / 11 at 1440 / 1280 / 375). The page lays the letter out in a column after a mailbox gutter (`side`) or above the pinned mailbox (`below`), with a compact letter on phones; zero overlap and ≥137 px clear of the nav at all three reference viewports.
- **Settings nav:** the fixed porch backdrop paints above the in-flow nav's signs, so `/settings` now gets `z-index: 15` on the nav (as `/scores` does). The audit hit-tests every visible sign and the account button on the settled page (4/4 signs + account at 1440 and 1280).
- **Audit:** per-frame projected-chalkboard sampling (alignment section), a settings-framing/hit-test section, and the mailbox/letter/scene-px measurements above.
- **Verification:** `npm run verify` PASS (58 files, 517 tests), offline Playwright PASS (156 passed, 77 gated), `AUDIT=1` audit PASS (41 captures, 25 transitions + 3 framing rows). No push or deploy.

### 2026-11-19 — Seamless navigation, iris removal, room moves, frame-pacing audit (owner-reported pass)

- **Daily first-load root cause:** `home.tsx` measured the painter board in an effect keyed on `state.status`, but the board mounts one commit later (the porch fade still owns the first `playing` commit), so `boardRef.current` was null and the effect never re-ran. `boardBox` stayed at its 320×600 placeholder, the board rendered at 224 px, and `PlayBackdrop` aimed the entry camera at that tiny target — the porch (and its boosters) read tiny. Fixed with a callback ref + `boardNode` dependency, and `PixelScene` now measures with `clientWidth/clientHeight` (ancestor CSS transforms no longer feed back into `integerScale`) with a window-sized first guess instead of a 0×0 fallback to 2.
- **Iris removed:** `IrisWipe.tsx` and its `@property`/CSS blocks are gone. Every `/party` route now uses the vertical floor cutaway: porch, nav from Scores/Daily/Gallery/Settings, the account menu, a room (direct `source: 'room'` pan), and the scores/gallery/settings chains return to the porch first, then pan. `room → party` is a floor pan too (audit asserts monotonic Y travel).
- **Basement → room:** `StudioLobby` asks the shared transition for an `easel` cross-zoom: the studio snapshot's camera pushes toward the magic easel while it dissolves over the live room, which is already mounted at its final layout (no reflow inside the move). Leaving a room back to the studio is the floor pan.
- **Choppiness sources fixed:** (1) the first AudioContext was built on the first pointerdown and could block ~100 ms — it is now created by the first *sound*; (2) the nav's full↔compact retract is transform/height-animated but only after `data-nav-ready`, so cold loads never animate, and scene-nav/zoom/pan requests enable it up front; (3) route chunks prefetch on idle and on nav hover/focus; (4) porch/studio art layers are warmed off the critical path; (5) the vertical/ easel transitions pause every `PixelScene` clock (`data-scene-moving`); (6) the floor/easel overlays are portalled to `document.body` so cloned scenes no longer match `.porch-shell:has(...)` and change the chrome; (7) the transition lands the target at its natural `main` offset before restoring it; (8) settings/scores framing no longer retargets when the page scrollbar appears.
- **Harness:** the audit now has a screenshot-free frame-pacing pass per transition (rAF gaps: max, >25/>50/>100 ms, `longtask` observer, 8 px/trend layout jumps, pan monotonic travel), a 4× CPU-throttle pass for porch↔daily, party↔room, porch→party and porch→scores, a Daily first-load scale test at 1440×900 / 1196×827 / 1280×720, and the missing party routes (nav from scores/daily/gallery/settings, room↔party). A one-off `DEV_COLD=1` dev-server harness reported the dev-server cold numbers (harness archived outside the repo, report not kept).
- **Verification:** `npm run verify` PASS (60 files, 529 tests), offline Playwright PASS (156 passed, 120 gated), `AUDIT=1` audit PASS (82 tests, 31 transition rows, 0 FAIL). Production pacing: max gap ≤33.5 ms, zero frames over 50 ms, zero long tasks, zero layout jumps; 4×: max 33.4 ms this run (worst observed 50.0 ms at the limit), no frame over 100 ms. Dev cold: 16.8 ms max on both Daily and the basement, nothing over 50 ms. No push or deploy.

### 2026-11-20 — One continuous scene: registered close-ups, daily lock, porch gallery rack (continuity pass)

- **Rule:** every close-up is the same scene with a camera on one object; the HTML for it (board, panels) is glued to that object while the camera moves (`src/scene/registration.ts`: `useSceneRegistration`, imperative, per frame, panels slide out from behind the board) and replaces the canvas art at pixel-identical geometry. Nothing dissolves; the only opacity changes left are hover chrome (labels, glints, the mobile dock) stepping aside.
- **Daily:** one easel close-up for the whole attempt (`PlayBackdrop` + registered `PlayLayout`), playing and graded result in the same rect, so submit never moves the board. While an attempt runs it is locked (`useDailyLock`): the nav's exits are removed, browser back is a no-op (`useBlocker`), other routes redirect to `/home`, a reload resumes zoomed in. The mid-play exit (`ExitDailyButton`, `showPorch`, "Resume painting") and its tests are gone. A graded result zooms out via its Porch button or a click on the scene around it.
- **Scores / Gallery / Settings:** shared `usePorchCloseup` (scores, gallery) and `porchPose` (rest, scores, gallery, mailbox) mean any close-up flies straight to any other (`ZoomHandoff` now carries `from` and `to`). Scores frames the whole chalkboard, thrusters included, over the real porch (the dark `scores-deck` band is deleted). The gallery is the porch's painting rack (`paintGallery`, `porchGalleryShelves`, `galleryCamera.ts`): the player's paintings are HTML frames on the shelves, `/u/:id` is the same rack with their paintings, and the separate gallery room (`GalleryBackdrop`, `galleryArt`, veils) is deleted. Settings' letter slides out of the mailbox; background click zooms out on all three.
- **Rooms:** `/party` and `/r/:code` are one studio scene (`(studio)/_layout.tsx` owns it and its camera): opening a room pushes the camera into the magic easel and the room's board is registered on its board; leaving pulls back out. The room is a foreground (`StudioWorld` context), `StudioBackdrop` and the `easel` axis of `VerticalSceneTransition` are deleted, and loading, lobby and error states are all faces on the same easel.
- **Porch local close-ups:** the rules note zooms onto the note (no modal), the mailbox opens an account card out of the mailbox (sign-in, gallery, settings), More on mobile slides a sheet out of its ticket.
- **Camera feel:** one cubic-bezier(0.6, 0, 0.2, 1) (`scene/zoom.ts`, JS twin kept exact); a soft whoosh through the sfx system (`scene/whoosh.ts`, respects mute and reduced motion). Cold paint draws the real porch (`NeutralPorchLoading`). Chained moves release the follow-up zoom mid-pan.
- **Not done / exceptions:** (the 404 is now a porch pose, see the last entry below); the parallax and arrival-flare touches were not built; chained moves from the basement are ~1.5 s, direct close-up to close-up moves ~1.0 s.

### 2026-11-20 — Continuity follow-up (mobile framing, gallery rack, chained moves, arrival flare)

- **375 Daily / room:** the mobile Daily prompt is no longer drawn twice (text-shadow offset replaced the stacked copy), and the close-up is laid out so the easel shelf and legs sit below the panels instead of zoomed porch blocks; the room header clears the easel HUD (`room-play.css`, `play.css`).
- **Gallery:** the camera is sized to the rack like scores fits the chalkboard, the rack is drawn as a rack (rails, back boards, empty frame outlines, the card on a shelf) and `/u/:id` registers its HTML shelves onto it, in both compositions, empty and populated.
- **Chained moves:** close-up → party overlaps the zoom-out with the floor pan as one camera path (`SCENE_ZOOM_CHAIN_MS`, running-zoom registry so the pan's snapshot keeps zooming), every chain is ≤1.6 s. Party → close-up holds the route swap until the pan has landed (`afterSceneMove`): a page mounting inside the pan's transformed track measured the whole tall track and flashed the portrait composition for ~5 frames.
- **Touches:** arrival thruster flare on the easel/chalkboard (`useArrivalFlare`, reduced motion skips it). Sky/sea parallax was not built: the sky is painted into the same canvas once per scene, so a parallax means a second layer repainted during moves.
- **Known:** party → room still shows 8 isolated rect jumps at the first commit (down from 12) and room → party one 16 px shift of the left card when leaving starts (registration baseline vs CSS layout of the room board). 4× CPU max gap is 50 ms, never over.

### 2026-11-20 — Last continuity fixes (room jumps, wide rack, 404 pose, in-scene sign-in)

- **Room enter/exit jumps (root causes):** (1) the room measured its free space through the registration's scale transform, so the board shrank 576 → 544 px mid-move and re-scaled the whole glued assembly in one frame (`untransformedRect` now); (2) the board rect was only reported on resizes, so the connecting layout turning into the lobby face (board 16 px lower, same size) left the studio camera on a stale rect and the exit started 16 px off (it is reported on every commit now). Both rows: 0 jumps.
- **Gallery rack:** on the landscape porch it is a wide, low cabinet on the deck (radio on its rail), the close-up shows one whole row of four paintings and further rows scroll in a row at a time; portrait is unchanged.
- **404:** a camera pose on the porch (`(app)/[...all].tsx`, `beachCamera.ts`): the notice on two posts in the beach sand is drawn porch art, its text is registered HTML, the plank under it is the way back. In-app arrivals fly in from the rest pose (`usePorchCloseup({ flyIn })`); a cold load is already there.
- **Sign-in:** no full-screen modal anywhere. `SignInCard` wraps the SDK's own `AuthOverlay` (OAuth redirects and the email form stay the SDK's) and `sign-in.css` strips its backdrop, blur and fades. Porch: the mailbox letter (Settings is the mailbox page and shows the form signed out); studio: a slip behind the room-tickets corkboard; room: a slip out of the easel's name plaque. A `signin` scene request is what the nav's button sends.


### 2026-11-20 — Round 3: broken states, jump cuts, gallery wall, Haiku's 404, stairs

- **Root cause of the striped brown "Scores over nothing" and the dev jump cut:** `scene.css` set `.pixel-scene { position: relative }` at the same specificity as every page's `.x__scene { position: absolute; inset: 0 }`. Dev injects CSS per module, so with `_layout` importing `./scores` eagerly, `scores.css` landed *before* `scene.css`, the scene collapsed to height 0 over the page's stripe backdrop, and a porch → scores move cut to stripes at the 55 % hand-off. The prod build orders its CSS differently, so every earlier capture passed. `:where(.pixel-scene)` makes the base rule zero-specificity, so order no longer matters (the gallery and the 404 had the same latent bug).
- **Stale route chunks:** `guardLazyRoutes` wraps every lazy route (dev has no `vite:preloadError`, so the import just rejected into the error boundary): one reload per page load (sessionStorage guard, latched in `Catch`), then a scene-native card on the real porch. Camera moves now wait for the destination chunk (`routeReady`, token-guarded) and every scene chunk (incl. the 404) is prefetched at idle and on hover.
- **Stairs:** the studio fitted its camera (zoom < 1) whenever the stage was narrower than 288 scene columns, e.g. 1980×1240 (zoom 0.949), so the basement stair sat ~33 px left of the hatch and cutaway. It is the identity camera from 282 columns up; the porch hatch now paints the same `paintStairRun` as the cutaway and the basement. Narrower stages still zoom to fit (the porch hatch is cropped there anyway). A screen-space test samples every frame of both pans at 1980×1240, 1440×900 and 375×812.
- **Daily:** the three mini thrusters under the HTML easel (`HoverEasel`'s `EaselBase`) and the three under the grade chalkboard (`BoosterSprite`) are gone; the canvas easel's own thrusters stay.
- **Gallery wall (replaces the rack):** the house wall continues left of the porch (`wallLayout.ts`, `wallArt.ts`: one siding tile repeated, a wall lantern in every gap). `/u/:id` is a pure camera pan along the porch at the rest zoom (`wallTargetCamera`, unclamped); paintings and caption cards are HTML in scene units, children of the scene, so they pan with the siding. Grid by date (newest nearest the porch), rows fit between the nav and the deck, scroll by wheel, trackpad, touch drag and keys moves the camera along the wall. The porch carries an inert copy of the signed-in player's own wall (idle-loaded) so the paintings are already hanging when the camera gets there. The porch gets a "Gallery" plank sign on the wall and the radio a little table.
- **404:** Haiku, awake and sad on the chair among spilled paint (`haikuArt.ts` `sad`: drooping ears, tears, beret askew, paint on his paws; `spillArt.ts`). The beach notice and its camera are removed.

### 2026-11-20 — Round 4: 5-minute Daily, short Haiku feedback, debug tools, stale-cache fixes

- **Daily is 5 minutes:** `DAILY.attemptMs` 300 000, auto-grades at 1, 2, 3 and 4 minutes (`autoWindowsMs`), `autoMissAfterMs` 30 s (was 60 s, half a window), cron closes the day at 00:10 UTC. Copy, tests and mocks follow the constants.
- **Haiku's feedback was cut off by the server, not by a box:** `parseScore` did `.slice(0, 140)` and cut mid-word, and the prompt only asked for "one short sentence". Every box that shows a reason (right-stage bubble and chalkboard, phone popover and score sheet) fits 140 W/M-heavy characters except the phone score sheet, which scrolls by 6 px. `DAILY.reasonMaxChars` is 100: the prompt asks for at most that, `clampReason` keeps whole sentences or cuts at a word and adds "…", and an offline test injects 100 wide characters at 1980, 1440 and 375.
- **Gallery wall scales:** only paintings within a screen of the camera are in the page (`visibleWallItems`), so 500 paintings are ~270 DOM nodes and ~37 MB; max frame gap 17 ms scrolling at 500. TEMP DEBUG: `+1/+10/+100/Clear` on your own wall, backed by `POST /api/daily/debug-paintings` (`daily-debug.ts`). The wall reads at most 1000 days (`useGalleryItems` limit).
- **TEMP DEBUG:** "Debug: new room" in the studio creates a generated public room through the normal create path and walks in.
- **Sound toggle jank (ended Daily):** `Button` carries `transition-all`; inside the registered root `--px`, border and padding step with the camera, so the chip's border (3 → 7 px) and padding eased behind the scene on a 150 ms curve. Transitions are off inside `.play-register`, and the label has a fixed width so "on"/"off" no longer shifts the icon.
- **Stale dev cache:** `@generouted/react-router` is excluded from `optimizeDeps` (its route list was pre-bundled and served `immutable`); the reload guard remembers the failing module per tab session, so a second failure of the same module shows the error card instead of reloading.
- **Nav order:** Daily, Scores, Party, Gallery.

### 2026-11-21 — Round 5: a paged gallery wheel, one chalkboard board, clean Scores moves

- **Gallery is pages on a wheel, not a long wall:** the wall is exactly one camera view (`PorchWall` has no `count`; `wallLayout.ts` is `wallPageLayout`, whole rows and columns that fit below the nav/plaque and above the deck between two arrow signs, with a "3 / 12" plank under the rail). Newest first; right is older and wraps both ways; one page or none shows no arrows. `useWallPager` owns the page and the turn (one queued turn at most, instant under reduced motion) and shares the page with the porch's inert copy of the wall (`useWallPage`) so a hand-off never swaps pictures. A turn is two `.wall-page`s animated with WAAPI `transform` at the zoom curve over 520 ms, clipped to the rail; only the page and the incoming page are in the DOM. Input: arrow signs, ← →, touch swipe, and one wheel gesture = one page (40 px of travel, then locked until 140 ms of silence). The scroll code, virtualisation, growing siding tile and lanterns are deleted. Captions wrap the longest real prompt (`captionType`/`captionHeight` size the card from the px type floors); the offline caption test walks every prompt at 1980/1440/375.
- **One board on the chalkboard:** the porch's teaser and the Scores route's registered board were two different DOMs swapping at the hand-off. `ChalkboardBoard` is now the real `Leaderboard` laid out at the Scores close-up's size and scaled by that camera's own zoom onto the porch chalkboard (inert on the porch, live on `/scores`), in every scene a camera can fly through (porch, gallery, 404, settings, scores). `/scores` no longer registers a board root. The Scores scene also hangs the wall, and the painter just picked has their wall hung while the camera starts across.
- **Chained moves join:** `useContinuingZoom` cleared the running zoom when the porch unmounted for the floor pan, freezing the zoom in the pan's copy for ~80 ms; it now runs out. The chain hand-off is earlier (`SCENE_ZOOM_CHAIN_MS` 0.2) and the first hand-off render re-reads the camera in a layout effect (a heavy mount no longer paints the stale pose). A 404 reached from a close-up starts its flight from that close-up's camera.

### 2026-11-21 — Wave B: the Party basement and rooms, final pass

- **Controls under the nav (root cause):** the nav is an absolute overlay on scene pages and the room page started at y≈0, so the whole ticket stub (way back, code, Copy link, name, Host, mute) sat under it on desktop and, on phones, under the 68 px logo link (a tap on the top half of "New game" went to /home). `.room-play` now starts below the nav (`--room-top-clear` = `var(--porch-nav-height, 52px)`; phones clear the logo link, 72 px). One top bar in every state (lobby, playing, round over): back to the studio, code and Copy link, room name, Host, mute. The left-column exit is gone (one `room-exit` per page).
- **Scene covers every viewport:** the room's camera landed the easel under the board but never checked that the scene reached the screen edges (1980×1240 left 123 px of void on the right and 87 px under it; 2560×1080 much worse). `coverZoom`/`coverCamera` (`camera.ts`): the studio asks the room for the smallest board that lets the scene cover (`minBoardPx`, the room's container widens with it), and when the room cannot grow that far it slides by the difference (`roomShift`, a CSS `translate` on the room) so the board still sits exactly on the easel. Checked at 1980×1240, 1440×900, 375×812, 1280×720, 2560×1080 (tablet portrait 768–1023 keeps its old three-column room: the scene covers, the board does not fill the easel).
- **After Conjure the board sat 80–130 px off the easel (root cause):** focusing the room-name field scrolled the overflow-hidden `.pixel-scene` sideways (a hidden box is still scrollable by script), shifting the whole scene under the registered room. `.pixel-scene` is `overflow: clip`.
- **Back from a room:** the blocker reset the pop and then `navigate('/party', { replace: true })` replaced the room's entry, leaving two /party entries and a dead Forward. Leaving a room reached from the studio is now `navigate(-1)` after the camera move (a room opened cold still replaces).
- **Haiku's feed for late joiners:** the snapshot carries the room's last five judgements of the current round (`RecentJudgement`, Durable Object memory only, reset per round); the client replays them into the guess log. The empty-feed copy follows the board ("Haiku is studying the canvas" over a painted canvas, "did not get a guess in this round" after a round).
- **Phones:** `HaikuStrip` keeps the cat and Haiku's latest guess above the board (pulses on each new one, gold on a win). The toast ("Draw something new first!") sits on the board's foot and takes no taps.
- **P2-10 (token in the WebSocket URL):** left as is. Browsers cannot set headers on a WebSocket and the SDK's own realtime routes (`wsRoute`) read `?token=` the same way; the pixel route follows that mechanism.

