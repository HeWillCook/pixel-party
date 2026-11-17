# Project progress log

Running record of design decisions, findings, and status for the DeepSpace build exercise.
Newest entries at the bottom of each section. This doubles as source material for the final submission note.

## Brief (from the exercise)

Build and deploy a small, finished full-stack app on DeepSpace within five days. Judged on scope judgment,
a working important path, technical depth, sensible use (or deliberate non-use) of integrations, readable code,
protected secrets, use of platform primitives, and an honest writeup of tradeoffs, agent work, and what I verified.

## The idea: Pixel Party (working name)

A live, shared pixel canvas turned into a game, judged by an AI.

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

## Open questions

- Custom DO integration + record access: **resolved, Task 1 PASS** (see Findings).
- Cooldown length, round length, judge frequency
- Final name ("Pixel Party" for now)

## Verification log

| Task | Commit | Commands run | Result | Reviewer | Will to check by hand |
|---|---|---|---|---|---|
| 1 | `9859338` | `npm run verify` normal + credentials denied; signed-out/signed-in JWT WebSockets; one Haiku call; record create/delete/query | PASS: 6 unit tests; all three platform probes; probe removed | Implementer self-check only; controller review follows | Optional browser OAuth UI smoke; signed-in WebSocket identity already verified with real login JWT |
| 1 fix round 1 | `add7097` — `fix: close client integration proxy, harden server tools` | Covering tests; `npm run verify` normal + credentials denied | PASS: 31 covering tests; 34 full-suite tests; lint, type-check, Worker/client build | Implementer self-check; controller review follows | None added |

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
