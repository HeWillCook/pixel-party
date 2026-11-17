# Pixel Party Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Pixel Party to `<name>.app.space`: a multiplayer 32×32 pixel canvas where players draw a word and Claude Haiku guesses it; co-op must ship, team mode and replay if time allows.

**Architecture:** DeepSpace scaffold (Hono Worker + Vite/React). One custom `PixelRoom extends BaseRoom` Durable Object per room holds the grid, validates every placement, runs rounds, and runs the AI judge from its own alarm. A single `BudgetRoom` DO enforces the app-wide daily AI cap. Low-frequency data (rooms, rounds, scores) are DeepSpace records written server-side. Game logic lives in pure, unit-tested modules under `src/game/`; DOs and React are thin shells over them.

**Tech Stack:** DeepSpace SDK 0.44.x (`deepspace`, `deepspace/worker`), Hono, React 19, Tailwind v4, Vitest, Playwright (via `deepspace test run`), Node 26 / npm 11.

**Spec:** `docs/superpowers/specs/2026-11-16-pixel-party-design.md` (read it first). Progress log: `docs/progress.md`. Platform rules: `.agents/skills/deepspace/SKILL.md`.

## Global Constraints

- Follow `.agents/skills/deepspace/SKILL.md` and `AGENTS.md`. docs.deep.space is the authority; read the relevant page before building in an area.
- Never run `deepspace deploy`, `push`, `app undeploy`, `app transfer`, `app collaborators` unless the task says so. Deploy needs Will's explicit go-ahead.
- Source authority is GitHub (`origin` = github.com/HeWillCook/pixel-party). Push `main` before the first deploy.
- No secrets in code, `.dev.vars`, commits, or logs. AI calls go through the DeepSpace integration proxy, billed `developer`.
- Caller identity only from a verified JWT. Never trust identity in query params or client headers.
- Co-op grid **32×32**; team grid **64×32** split into zones red `x 0-31` and blue `x 32-63`. 16-colour palette, index 0 = white/empty.
- Cooldown: **200 ms when 1 player connected**, else **min(1000 ms × players, 10 000 ms)**. Click-and-drag allowed (still one pixel per accepted message).
- Co-op round cap **5 min**; team round **3 min** fixed; intermission **8 s**; canvas clears between rounds.
- Judge: model `claude-haiku-5-5`, `max_tokens: 1024`, PNG upscaled nearest-neighbour to **512 px**, scheduled tick every **15 s**, "Ask the AI" min interval **10 s per room**, hard cap **6 calls/min/room**; judge only if grid changed since last judgement and ≥1 signed-in player connected and round is playing.
- **The judge prompt must never contain the target word.**
- App-wide daily budget **3 000 judge calls per UTC day** (config value); when exhausted broadcast `ai_resting`, drawing continues.
- Rooms: ≤**5** non-closed rooms per user; empty room → `paused` (timers and judge stop); rejoin within **10 min** resumes; user rooms empty **30 min** → `closed`; default board never closes.
- Signed-out users may spectate public rooms; placing, asking, and creating rooms require sign-in. Private rooms: unguessable join code; joining while signed in adds you to `rooms.memberIds`.
- Visual design is our own (not the scaffold theme); readable on a 1280×800 laptop and a phone.

## Review Focus

1. **Reconnect mid-round:** a dropped socket reconnects with backoff, receives a fresh snapshot, and any unconfirmed optimistic pixels are discarded. Test in Task 6 (`applyServerMsg` snapshot clears `pending`).
2. **Durable Object restart mid-round:** grid, placedBy, round, cooldowns, and the alarm survive eviction. Test in Task 4 (`serializeRoomState`/`deserializeRoomState` round-trip) and manual check in Task 8.
3. **Judge failure or garbage output:** network error, non-200, fenced/prosy JSON, or nonsense never ends or crashes a round; the next tick retries. Tests in Task 3 (`parseJudgeText`) and Task 4 (`shouldJudge` after failure).
4. **Guess phrasing:** "Lighthouses", "a lighthouse", "Light house", "LIGHTHOUSE." all match "lighthouse"; "lighthouse keeper" and "house" do not. Test in Task 2 (`matchGuess`).
5. **Concurrent writes to one cell:** two users hit the same pixel; the later accepted write wins and every client converges to it. Test in Task 2 (`setPixel` overwrite) and Task 8 two-browser check.

## Verification Pipeline

Nothing counts as done on an agent's say-so. Every task passes all four gates, in order:

1. **Implementer self-check** (the agent building the task): runs `npm run verify` and, when the task touches
   runtime/multi-user behaviour, `npx deepspace test run all`; pastes the tail of both outputs in its report.
2. **Independent review** (a fresh agent from a different model family than the implementer): first spec
   compliance against this plan and the spec (every Interfaces item, Global Constraint, and Review Focus test the
   task owns), then code quality (security: identity, RBAC, spend gates; no secrets; no scaffold leftovers;
   readable code). Findings go back to the same implementer; a task fails after two unfixed rounds and is escalated.
3. **Orchestrator verification** (Opus): re-runs `npm run verify` (and the task's own commands) in the repo itself,
   reads the diff for scope creep, and checks the task's acceptance items. Only then is the task committed as done.
4. **Logged**: one line per task in `docs/progress.md` → Verification log: task, commit, commands run, results,
   reviewer, anything Will must check by hand.

**Automated on every push (CI):** `.github/workflows/ci.yml` runs `npm ci` then `npm run verify` on Node 26.
`npm run verify` = `npm run lint && npm run type-check && npm run test:unit && npm run build` (added in Task 1).
CI deliberately excludes `deepspace test run` (needs a DeepSpace login; no deploy credentials in GitHub secrets).
Those run locally at gates 1 and 3 instead.

**Before every deploy:** CI green on the pushed commit, `npx deepspace test run all` green locally, then Task 8's live
checklist re-run on the deployed URL (two signed-in browsers + one signed-out) and recorded. Will approves each deploy.

**By Will by hand (for the writeup):** play a solo round, play with a second account, try to place while signed out,
read the diff of at least Tasks 4 and 5 (the game server and access control), and confirm the spend checks in
`npx deepspace app usage`.

---

### Task 1: Scaffold into the repo and prove the platform assumptions

The riskiest unknowns get proven before anything is built on them (spec §8).

**Files:**
- Create: the DeepSpace scaffold at the repo root (via `npm create deepspace@latest pixel-party` in a temp dir, then move its files into the repo root). Keep existing `README.md`, `assets/`, `docs/`, `.claude/skills/`, `.agents/skills/`. Merge the scaffold's `AGENTS.md`/`CLAUDE.md` content under our `AGENTS.md` (ours first).
- Create: `src/server/server-tools.ts`
- Create: `src/server/pixel-room.ts` (probe version only)
- Modify: `worker.ts`, `wrangler.toml` (DO binding + migration for `PixelRoom`), `src/server/realtime-routes.ts` (route)
- Modify: `docs/progress.md` (results)

**Interfaces:**
- Produces: `createServerTools(env: Env): ServerTools` in `src/server/server-tools.ts`, where
  `ServerTools = { create, update, get, query (same shapes as ActionTools in src/server/action-routes.ts), integration<T>(endpoint: string, body: unknown): Promise<ActionResult<T>> }`.
  Records go through the app RecordRoom stub `POST https://internal/api/tools/execute` with headers `X-User-Id: env.OWNER_USER_ID`, `X-App-Action: true` (same pattern as `createActionTools`). Integrations go through `apiWorkerFetch(env, path, …)` with `Authorization: Bearer ${env.APP_OWNER_JWT}` (developer billing). Reuse the scaffold's helpers (`splitIntegrationEndpoint`, `normalizeApiError`) rather than copying them; export them from their module if needed.
- Produces: WebSocket route `GET /api/pixel/:roomId/ws` (token optional; anonymous = spectator) forwarding to `env.PIXEL_ROOMS.idFromName(roomId)`, using the scaffold's `wsRoute` pattern in `realtime-routes.ts`. (Task 5 changes the path param to `:joinCode` and adds the room lookup.)

- [ ] **Step 1:** Check `npx deepspace auth whoami --json` shows Will's account. Scaffold as above; `npm install`. Add `"verify": "npm run lint && npm run type-check && npm run test:unit && npm run build"` to `package.json` scripts and `.github/workflows/ci.yml` (on push and pull_request: checkout, setup-node 26 with npm cache, `npm ci`, `npm run verify`). `npm run verify` passes locally; commit `chore: scaffold DeepSpace app and CI`.
- [ ] **Step 2:** Read `node_modules/deepspace/src` or `dist/*.d.ts` for `BaseRoom` (its connection/message/alarm hooks) and https://github.com/deepdotspace/tangent `worker.ts` + its game room for how a custom room is bound in `__DO_MANIFEST__` and `wrangler.toml`. Write the probe `PixelRoom` that on a `probe` message: (a) replies with the caller identity it received (userId or null); (b) calls `createServerTools(env).integration('anthropic/chat-completion', {model:'claude-haiku-5-5', max_tokens:64, messages:[{role:'user',content:'Reply with the word ok'}]})` and replies with the text; (c) creates then deletes a record in a throwaway collection `probes` (add a minimal schema).
- [ ] **Step 3:** `npx deepspace dev start`; connect with a signed-in browser and with a signed-out one (or `wscat`/a node script). Expected: signed-out connects with userId null; signed-in shows the real id; integration returns text; record create/delete succeed.
- [ ] **Step 4:** Record the three results (pass/fail + exact errors) in `docs/progress.md` → Findings. If (b) or (c) fails, STOP and report; the fallback (spec §8: internal app-authenticated Worker route) needs a decision before Task 4.
- [ ] **Step 5:** Remove the probe message handler and the `probes` schema (keep `server-tools.ts`, binding, and route). `npm run verify` passes. Commit `feat: PixelRoom binding, ws route, server tools (platform probe passed)`.

### Task 2: Game core (pure)

**Files:**
- Create: `src/game/config.ts`, `src/game/grid.ts`, `src/game/rules.ts`, `src/game/words.ts`, `src/game/scoring.ts`
- Test: `src/game/grid.test.ts`, `src/game/rules.test.ts`, `src/game/words.test.ts`, `src/game/scoring.test.ts`

**Interfaces (Produces):**
- `config.ts`: `PALETTE: readonly string[]` (16 hex, `[0] = '#ffffff'`); `type Mode = 'coop' | 'team'`; `type ZoneId = 'all' | 'red' | 'blue'`; `interface Zone { id: ZoneId; x: number; y: number; w: number; h: number }`; `interface ModeConfig { width: number; height: number; zones: Zone[]; roundMs: number | null; capMs: number; intermissionMs: number }`; `MODES: Record<Mode, ModeConfig>`; `JUDGE = { model, maxTokens, renderPx, tickMs: 15_000, askMinMs: 10_000, maxPerMinute: 6 }`; `BUDGET = { dailyCalls: 3000 }`; `ROOMS = { maxActivePerUser: 5, resumeWindowMs: 600_000, closeAfterEmptyMs: 1_800_000 }`. Values from Global Constraints.
- `grid.ts`: `interface Grid { width: number; height: number; cells: Uint8Array; placedBy: string[] }`; `createGrid(w, h): Grid`; `setPixel(g, x, y, color, userId): void`; `clearGrid(g): void`; `encodeCells(cells: Uint8Array): string` / `decodeCells(s: string, length: number): Uint8Array` (base64); `pixelsUsed(g, zone?: Zone): number` (non-zero cells); `contributors(g, zone?: Zone): string[]` (unique `placedBy` of non-zero cells, sorted).
- `rules.ts`: `cooldownMs(playersConnected: number): number`; `type RejectReason = 'not_signed_in' | 'round_inactive' | 'out_of_bounds' | 'bad_color' | 'cooldown'`; `validatePlacement(p: { width: number; height: number; x: number; y: number; color: number; userId: string | null; roundPlaying: boolean; lastPlacedAt: number | undefined; now: number; playersConnected: number }): { ok: true } | { ok: false; reason: RejectReason; retryAt?: number }`. Check order: signed in, round, bounds (integers only), colour 1-15 (0 = erase is not allowed in v1), cooldown.
- `words.ts`: `interface WordEntry { word: string; synonyms: string[]; tier: 'easy' | 'medium' }`; `WORDS: WordEntry[]` (≥30 drawable nouns, e.g. house, tree, sun, cat, fish, heart, rocket, pizza, lighthouse, umbrella…); `pickWord(rng: () => number, exclude: string[]): WordEntry`; `normalizeGuess(s: string): string`; `matchGuess(guess: string, entry: WordEntry): boolean`.
- `scoring.ts`: `coopScore(p: { pixelsUsed: number; totalCells: number; durationMs: number; capMs: number }): number` = `round(1000 × (0.5 × (1 − pixelsUsed/totalCells) + 0.5 × (1 − durationMs/capMs)))` clamped to 0-1000; `teamWinner(red: { matched: boolean; confidence: number }, blue: same): 'red' | 'blue' | 'draw'` (matched beats unmatched; tie → higher confidence; equal → draw).

- [ ] **Step 1: Write failing tests**, including:

```ts
expect(cooldownMs(1)).toBe(200); expect(cooldownMs(0)).toBe(200)
expect(cooldownMs(3)).toBe(3000); expect(cooldownMs(25)).toBe(10_000)
expect(validatePlacement({...base, userId: null})).toEqual({ ok: false, reason: 'not_signed_in' })
expect(validatePlacement({...base, x: 32})).toMatchObject({ ok: false, reason: 'out_of_bounds' })
expect(validatePlacement({...base, x: 1.5})).toMatchObject({ ok: false, reason: 'out_of_bounds' })
expect(validatePlacement({...base, color: 0})).toMatchObject({ reason: 'bad_color' })
expect(validatePlacement({...base, playersConnected: 3, lastPlacedAt: 1000, now: 2000}))
  .toEqual({ ok: false, reason: 'cooldown', retryAt: 4000 })
// Review Focus 4
const lh = { word: 'lighthouse', synonyms: ['light house', 'beacon tower'], tier: 'medium' as const }
for (const g of ['Lighthouses', 'a lighthouse', 'Light house', 'LIGHTHOUSE.', ' the lighthouse ']) expect(matchGuess(g, lh)).toBe(true)
for (const g of ['lighthouse keeper', 'house', 'tower']) expect(matchGuess(g, lh)).toBe(false)
// Review Focus 5
setPixel(g, 3, 4, 2, 'u1'); setPixel(g, 3, 4, 5, 'u2'); expect(g.cells[4 * 32 + 3]).toBe(5); expect(contributors(g)).toEqual(['u2'])
expect(decodeCells(encodeCells(g.cells), 1024)).toEqual(g.cells)
expect(coopScore({ pixelsUsed: 0, totalCells: 1024, durationMs: 0, capMs: 300_000 })).toBe(1000)
expect(coopScore({ pixelsUsed: 256, totalCells: 1024, durationMs: 60_000, capMs: 300_000 })).toBe(775)
expect(coopScore({ pixelsUsed: 1024, totalCells: 1024, durationMs: 400_000, capMs: 300_000 })).toBe(0)
expect(teamWinner({ matched: true, confidence: 0.2 }, { matched: false, confidence: 0.9 })).toBe('red')
```
Also: `pixelsUsed`/`contributors` restricted to the blue zone of a 64×32 grid; every `WORDS` entry's own word matches itself; `pickWord` never returns an excluded word.
- [ ] **Step 2:** `npx vitest run src/game` → FAIL (modules missing).
- [ ] **Step 3:** Implement. `normalizeGuess`: lowercase, strip punctuation, collapse spaces, drop leading `a `/`an `/`the `, strip one trailing `s`/`es` from the last word. Match = normalized guess equals normalized word or a synonym, also comparing with spaces removed.
- [ ] **Step 4:** `npx vitest run src/game` → PASS. `npm run verify` → PASS.
- [ ] **Step 5:** Commit `feat(game): grid, rules, words, scoring`.

### Task 3: Judge core (pure)

**Files:**
- Create: `src/game/png.ts`, `src/game/judge.ts`
- Test: `src/game/png.test.ts`, `src/game/judge.test.ts`

**Interfaces:**
- Consumes: `Grid`, `Zone`, `PALETTE`, `JUDGE` (Task 2).
- Produces:
  - `renderZonePng(g: Grid, zone: Zone, outPx: number): Promise<Uint8Array>`: RGB PNG, nearest-neighbour scale `floor(outPx / max(zone.w, zone.h))`, deflate via `CompressionStream('deflate')` (available in Workers and Node ≥18), CRC32 implemented locally. No new dependencies.
  - `toBase64(bytes: Uint8Array): string`.
  - `JUDGE_SYSTEM: string`, `JUDGE_USER_TEXT: string`: exact copy below.
  - `buildJudgeBody(pngBase64: string): object`: Anthropic Messages body `{ model: JUDGE.model, max_tokens: JUDGE.maxTokens, system: JUDGE_SYSTEM, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }, { type: 'text', text: JUDGE_USER_TEXT }] }] }`.
  - `extractText(payload: unknown): string | null`: pulls the model text out of the integration response. The shape was observed in spike 1: see `run_eval.py` and `results.json` under the session scratchpad `spike1/` if available, else log one real response in Task 1/4 and match it.
  - `interface JudgeResult { guesses: string[]; confidence: number }`; `parseJudgeText(text: string): JudgeResult | null`.

Prompt copy (fixed; never include the target word):
```
JUDGE_SYSTEM = "You judge a collaborative pixel-art canvas drawn by many people, one pixel at a time. Ignore isolated stray pixels; they are noise."
JUDGE_USER_TEXT = "What is this a drawing of? Reply with raw JSON only, no markdown fences: {\"guesses\": [three short nouns, most likely first], \"confidence\": number from 0 to 1}. If it is blank or unrecognisable, still give your three best guesses with low confidence."
```

- [ ] **Step 1: Failing tests:** PNG starts with bytes `89 50 4E 47 0D 0A 1A 0A`; IHDR width/height = `zone.w × scale` (32×32 zone at 512 → 512; 32-wide blue zone of a 64×32 grid at 512 → 512×512); decoding the PNG in the test (Node `zlib.inflateSync` on concatenated IDAT) gives the right RGB at a known pixel. `parseJudgeText` handles: plain JSON; ```` ```json ```` fenced; prose before/after the JSON; more than 3 guesses (truncate to 3); confidence as string `"0.7"` (coerce) or out of range (clamp 0-1); returns `null` for `"I can't tell"`, `{}`, `{"guesses": []}` (Review Focus 3). `buildJudgeBody` output never contains any `WORDS` word outside the image data: assert `JSON.stringify(body without data)` contains none of them.
- [ ] **Step 2:** `npx vitest run src/game/png.test.ts src/game/judge.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests PASS; `npm run verify` PASS.
- [ ] **Step 5:** Commit `feat(game): PNG renderer and judge request/response`.

### Task 4: PixelRoom and BudgetRoom (co-op)

**Files:**
- Create: `src/game/protocol.ts`, `src/game/room-logic.ts`, `src/server/budget-room.ts`
- Modify: `src/server/pixel-room.ts` (full implementation), `worker.ts`, `wrangler.toml` (BudgetRoom binding + migration)
- Test: `src/game/protocol.test.ts`, `src/game/room-logic.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces:
  - `protocol.ts`:
    `type ClientMsg = { t: 'place'; x: number; y: number; c: number } | { t: 'ask' } | { t: 'next' } | { t: 'team'; team: 'red' | 'blue' }`;
    `interface RoundView { id: string; word: string; state: 'playing' | 'intermission' | 'paused'; startedAt: number; endsAt: number | null; askAvailableAt: number; result?: { outcome: 'won' | 'timeout' | 'teamWin'; score?: number; winningTeam?: 'red' | 'blue' | 'draw' } }`;
    `type ServerMsg = { t: 'snapshot'; mode: Mode; width: number; height: number; cells: string; round: RoundView; you: { userId: string | null; cooldownUntil: number; team?: 'red' | 'blue' }; players: number; aiResting: boolean } | { t: 'pixel'; x: number; y: number; c: number; by: string } | { t: 'reject'; reason: RejectReason | 'ask_too_soon' | 'not_host'; retryAt?: number } | { t: 'round'; round: RoundView } | { t: 'judgement'; zone: ZoneId; guesses: string[]; confidence: number; matched: boolean } | { t: 'players'; count: number } | { t: 'ai_resting' }`;
    `parseClientMsg(raw: string): ClientMsg | null` (rejects unknown `t`, non-numeric fields, oversize input > 256 chars).
  - `room-logic.ts` (pure, all times injected):
    `interface RoomState { mode: Mode; grid: Grid; version: number; round: RoundView; lastPlacedAt: Record<string, number>; judgeCalls: number[]; lastJudgedVersion: number; lastJudgedAt: number; emptySince: number | null; status: 'playing' | 'intermission' | 'paused' | 'closed' }`;
    `shouldJudge(s: RoomState, now: number, signedInConnected: number, reason: 'tick' | 'ask'): { ok: true } | { ok: false; why: 'not_playing' | 'unchanged' | 'no_players' | 'too_soon' | 'rate_cap' }` (tick needs `now − lastJudgedAt ≥ tickMs`; ask needs `≥ askMinMs`; both need `judgeCalls` in the last 60 s < `maxPerMinute`, grid version changed, ≥1 signed-in connected, round playing);
    `nextAlarmAt(s: RoomState, now: number): number | null`;
    `serializeRoomState(s): string` / `deserializeRoomState(json: string): RoomState`.
  - `BudgetRoom extends BaseRoom`, single instance `idFromName('global')`, `POST /reserve` → `{ ok: boolean; used: number; cap: number }`, SQLite table `budget(day TEXT PRIMARY KEY, used INTEGER)`, day = UTC `YYYY-MM-DD`; reserve is a single transaction.
  - `PixelRoom` behaviour: on connect, send `snapshot` (spectators included); on `place`, `validatePlacement` → `setPixel`, bump `version`, persist, broadcast `pixel` (or send `reject` to the sender only); on `ask`/alarm tick → `shouldJudge` → reserve from BudgetRoom (if not ok: broadcast `ai_resting`, skip) → `renderZonePng` → `createServerTools(env).integration('anthropic/chat-completion', buildJudgeBody(...))` → `extractText` → `parseJudgeText` → broadcast `judgement` → if `matchGuess(guesses[0], word)`: end round with `coopScore`, write `rounds` record (Task 5 schema) and broadcast `round`. Timeouts at `capMs`. Intermission 8 s, then clear grid and start a new round with `pickWord` (exclude last 10 words). Last socket closes → `paused` (stop alarms except the close check); reconnect within `resumeWindowMs` resumes; later → new round. Non-default rooms empty `closeAfterEmptyMs` → `closed` (update `rooms` record). Persist `RoomState` to the DO's SQLite after every mutation (single row, `serializeRoomState`); restore in the constructor/first request and re-arm the alarm.
  - Judge errors: catch everything, log a single line, record the attempt time, continue (Review Focus 3).

- [ ] **Step 1: Failing tests:** `parseClientMsg` accepts valid messages and rejects `{"t":"place","x":"1"}`, `{"t":"nuke"}`, non-JSON, 300-char strings. `shouldJudge`: unchanged version → `unchanged`; ask 5 s after last → `too_soon`; 6 calls in last 60 s → `rate_cap`; 0 signed-in → `no_players`; intermission → `not_playing`; valid tick after 15 s → ok; after a failed call (lastJudgedAt set, version unchanged since a new pixel arrives) → ok once a pixel bumps version (Review Focus 3). `serializeRoomState`→`deserializeRoomState` round-trips a mid-round state with pixels, placedBy, cooldowns, and judgeCalls deep-equal (Review Focus 2). `nextAlarmAt` returns null when paused and the room is the default board, and a time ≤ `emptySince + closeAfterEmptyMs` otherwise.
- [ ] **Step 2:** `npx vitest run src/game` → new tests FAIL.
- [ ] **Step 3:** Implement `protocol.ts`, `room-logic.ts`, then `BudgetRoom` and the full `PixelRoom`. Keep game decisions in `room-logic.ts`/`rules.ts`; the DO only does I/O.
- [ ] **Step 4:** Unit tests PASS; `npm run verify` PASS. Manual: `npx deepspace dev start`, connect two sockets via a small node script (`scripts/ws-smoke.mjs`, may be kept): placements broadcast to both; cooldown rejects; `ask` produces a `judgement` from the real integration.
- [ ] **Step 5:** Commit `feat: PixelRoom co-op rounds, AI judge loop, daily budget`.

### Task 5: Schemas, room actions, and access control

**Files:**
- Create: `src/schemas/rooms-schema.ts`, `src/schemas/rounds-schema.ts`, `src/schemas/team-members-schema.ts`, `src/schemas/scores-schema.ts`
- Modify: `src/schemas.ts`, `src/actions/index.ts`, `src/server/realtime-routes.ts` (room lookup + access on the ws route)
- Test: `tests/rooms.spec.ts` (API spec, run with `npx deepspace test run api`/`all`)

**Interfaces:**
- Collections (fields from spec §5.3, with the builder-check changes; read https://docs.deep.space/concepts/permissions.md and https://docs.deep.space/concepts/data-model.md first; migrations are additive, so include every field now):
  - `rooms`: name, mode, visibility, joinCode, hostId, memberIds (`collaboratorsField`), status, currentRoundId, playerCount, lastActiveAt, isDefaultBoard. Read: public rooms → everyone incl. signed-out (`visibilityField` visibility=`public`); private → members. Client create/update/delete: denied (actions and server only).
  - `rounds`: roomId, mode, word, startedAt, endedAt, outcome, winningTeam, pixelsUsed, durationMs, score, contributorIds, finalGuesses, snapshotFileIds. Read like the parent room (store `visibility` on the round too if RBAC needs a local field); client writes denied.
  - `teamMembers`: roomId, userId, team. Server-written.
  - `scores`: userId, totalPoints, roundsWon. Server-written; readable by all.
- Actions (`src/actions/index.ts`):
  - `createRoom({ name: string; mode: Mode; visibility: 'public' | 'private' }) → { roomId: string; joinCode: string }`: name 1-40 chars; refuses with `room_limit` if the caller hosts ≥ `ROOMS.maxActivePerUser` non-closed rooms; joinCode = 10 chars from `crypto.getRandomValues` over a 32-char alphabet without lookalikes; `memberIds: [userId]`.
  - `joinRoom({ joinCode: string }) → { roomId: string }`: adds caller to `memberIds` (idempotent); `not_found` for unknown/closed.
- Default board: a `rooms` record with fixed recordId `default-board`, joinCode `play`, public, `isDefaultBoard: true`, created idempotently by `ensureDefaultBoard(tools: ServerTools)` in `src/server/default-board.ts`, called from the ws route when joinCode is `play`.
- WS route `GET /api/pixel/:joinCode/ws`: look up the room by joinCode via `createServerTools` → 404 if missing or closed; private + signed-out → 401; private + signed-in non-member → add via the same logic as `joinRoom`; forward to `PIXEL_ROOMS.idFromName(room.recordId)` with identity from the verified JWT and an internal `X-Room-Id` header set server-side (strip any client-supplied one).

- [ ] **Step 1: Failing API tests** (follow `tests/api.spec.ts` / `tests/collab.spec.ts` patterns): signed-in user creates a public and a private room; a second user can read the public room record but not the private one until `joinRoom`; the 6th `createRoom` by one user returns `room_limit`; a client attempt to `create` a `rounds` record directly is denied; signed-out ws to a private room gets 401; signed-out ws to `play` gets a snapshot.
- [ ] **Step 2:** `npx deepspace test run all` → new specs FAIL.
- [ ] **Step 3:** Implement schemas, actions, `ensureDefaultBoard`, route access. Have PixelRoom write `rounds` and update `rooms.status/playerCount/lastActiveAt/currentRoundId` through `createServerTools`.
- [ ] **Step 4:** `npx deepspace test run all` PASS; `npm run verify` PASS.
- [ ] **Step 5:** Commit `feat: rooms, rounds, access control, room actions`.

### Task 6: Client: lobby, room page, canvas, presence

Visual design is our own; use the `frontend-design` guidance. Pixel-forward, playful, high contrast; not the scaffold theme.

**Files:**
- Create: `src/game/client-state.ts` (+ `src/game/client-state.test.ts`), `src/hooks/usePixelRoom.ts`, `src/components/game/PixelCanvas.tsx`, `Palette.tsx`, `GuessFeed.tsx`, `RoundBar.tsx`, `AskAiButton.tsx`, `PlayerCursors.tsx`
- Create: `src/pages/(app)/r/[code].tsx`
- Modify: `src/pages/(app)/home.tsx` (lobby), `src/pages/index.tsx` (landing → Play now), `src/nav.ts`, `src/constants.ts` (`APP_NAME = 'Pixel Party'`)

**Interfaces:**
- Consumes: `ServerMsg`, `ClientMsg`, `RoundView` (Task 4); actions `createRoom`, `joinRoom` (Task 5); `rooms` collection via `useQuery`.
- Produces:
  - `client-state.ts`: `interface ClientState { connected: boolean; snapshotLoaded: boolean; mode: Mode; width: number; height: number; cells: Uint8Array; pending: Map<number, number /*prev colour*/>; round: RoundView | null; guesses: Record<ZoneId, { guesses: string[]; confidence: number; matched: boolean } | undefined>; players: number; you: …; aiResting: boolean; lastReject: … | null }`; `initialClientState(): ClientState`; `applyServerMsg(s, m: ServerMsg): ClientState`; `applyOptimisticPlace(s, x, y, c): ClientState`.
  - `usePixelRoom(joinCode: string): { state: ClientState; place(x, y, c): void; ask(): void; next(): void; chooseTeam(t): void }`: opens `wss://…/api/pixel/:joinCode/ws?token=<jwt from the SDK auth hook>` (token omitted when signed out), reconnects with exponential backoff 0.5 s → 8 s, client-side throttles drag to the current cooldown.
  - Presence: `usePresenceRoom` keyed `pixel:${joinCode}` for cursor `{x, y}` in grid coordinates, throttled to 10/s (check the presence API in docs before use).

- [ ] **Step 1: Failing tests** for `client-state.ts`: `snapshot` replaces cells and clears `pending` (Review Focus 1); `pixel` for a pending cell from self removes it from `pending`; `reject` restores the pending cell's previous colour; `judgement` stores per-zone guesses; `round` with a new id clears guesses.
- [ ] **Step 2:** `npx vitest run src/game/client-state.test.ts` → FAIL.
- [ ] **Step 3:** Implement state, hook, components, pages. Room page: canvas (crisp `image-rendering: pixelated`, scales to viewport), palette, round bar (word, timer, players), guess feed ("The AI thinks: …" animated on change), Ask the AI button with countdown, sign-in prompt for spectators, share-link copy, win/timeout overlay with score and contributors. Lobby: Play now (`/r/play`), Create room (name, mode, visibility), list of live public rooms (status ≠ closed).
- [ ] **Step 4:** Tests PASS; `npm run verify` PASS; `npx deepspace test screenshot` (or Playwright) screenshots of lobby, room (signed-in), room (spectator), win overlay at 1280×800 and 390×844 saved for review.
- [ ] **Step 5:** Commit `feat: lobby, room page, live canvas, guesses, presence`.

### Task 7: Two-user end-to-end test

**Files:**
- Create: `tests/pixel.spec.ts`

- [ ] **Step 1:** Write a Playwright spec using the scaffold's multi-user helpers (see `tests/collab.spec.ts`): user A and user B open `/r/play`; A places a pixel; B sees that cell's colour within 2 s; a signed-out context sees it too and gets a sign-in prompt instead of placing; A's immediate second placement with B connected is rejected (cooldown) and the cell reverts; both see the same `players` count (2).
- [ ] **Step 2:** `npx deepspace test run all` → PASS (fix app code, not the test, if behaviour is wrong).
- [ ] **Step 3:** Commit `test: two-user pixel sync, cooldown, spectator`.

### Task 8: First deploy and live verification (needs Will's go-ahead)

- [ ] **Step 1:** Clean worktree; `git push origin main`; confirm `git remote -v` shows GitHub. Ask Will to approve the deploy.
- [ ] **Step 2:** `npx deepspace deploy` → `serving: confirmed`; note the URL in `docs/progress.md`.
- [ ] **Step 3:** Live checks, each recorded pass/fail in `docs/progress.md`: two browsers (two accounts) see each other's pixels and cursors; signed-out browser spectates, cannot place or ask; a solo round can be won in ≤2 min by drawing an easy word; Ask the AI countdown enforced; closing all tabs then reopening within 10 min resumes the round (Review Focus 2); `npx deepspace logs --json` shows no exceptions; `npx deepspace app usage` per-call cost recorded (spec §8).
- [ ] **Step 4:** Judge re-test on real canvases: draw ≥8 words in the live app (Will + agent), record AI guesses/accuracy in `docs/progress.md`; adjust word list tiers or prompt if accuracy < ~70%, commit, redeploy.
- [ ] **Step 5:** Commit `docs: live verification results`.

**Day-3 checkpoint:** if Tasks 1-8 are not solid, skip Tasks 9-10 and spend the time on co-op hardening; record the decision in `docs/progress.md`.

### Task 9 (should-ship): Team mode

**Files:**
- Modify: `src/game/room-logic.ts`, `src/server/pixel-room.ts`, `src/components/game/*`, `src/pages/(app)/r/[code].tsx`, lobby create form
- Test: `src/game/room-logic.test.ts`, `tests/pixel.spec.ts`

**Interfaces:** `MODES.team` from Task 2; `teamWinner` from Task 2; `{t:'team'}` message and `teamMembers` collection from Tasks 4-5.

- [ ] **Step 1: Failing tests:** team assignment balances (new player joins the smaller team; explicit `team` message switches); round ends at exactly `roundMs`; at end the judge runs once per zone (red, blue) and `teamWinner` decides; placements are allowed in either zone (sabotage); live ticks judge both zones within the same rate cap (2 calls per tick count toward `maxPerMinute`).
- [ ] **Step 2:** FAIL. **Step 3:** Implement; UI shows the zone divider, team colours, per-zone guess feeds, team picker, end-of-round winner banner. **Step 4:** `npx vitest run` + `npx deepspace test run all` PASS; screenshots. **Step 5:** Commit `feat: team mode with zones and sabotage`; redeploy after Will's go-ahead; add live checks to `docs/progress.md`.

### Task 10 (should-ship): Round replay

**Files:**
- Modify: `src/server/pixel-room.ts` (save each judged PNG via app file storage, append the file id to the round's `snapshotFileIds`)
- Create: `src/components/game/Replay.tsx` (flipbook of snapshots on the win/timeout overlay and on a `/rounds/:id` page)

- [ ] **Step 1:** Read https://docs.deep.space/guides/file-uploads.md for worker-side `appFiles`. Failing test: the round record after a won round lists ≥1 snapshot id (API spec).
- [ ] **Step 2:** FAIL. **Step 3:** Implement; flipbook plays snapshots at 4 fps with nearest-neighbour scaling. **Step 4:** tests PASS, screenshot. **Step 5:** Commit `feat: round replay from judge snapshots`.

### Task 11: Submission writeup

- [ ] **Step 1:** Update `README.md`: what it is, live URL, how to play, architecture diagram (spec §5.2), DeepSpace features and integrations used and left out with reasons (spec §6), the main tradeoff (custom BaseRoom vs records), spend controls, what's unfinished and what's next (quick play, currency, etc.), and how to run locally.
- [ ] **Step 2:** Draft the portal note (≤300 words) in `docs/submission-note.md` from `docs/progress.md`: what was built, integrations, main tradeoff, what the agents did, what Will verified/changed. Will rewrites it in Will's own words.
- [ ] **Step 3:** Commit `docs: README and submission note`.
