# Daily Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A solo, once-a-day, 10-minute pixel-art challenge judged by Haiku in two steps. The best grade is kept,
and the game has a daily leaderboard, public profile galleries, and medals awarded by cron. It becomes the app's home page, and the
current multiplayer game moves to "Party mode".

**Architecture:** The browser owns the canvas. The server referees:
- A `DailyRoom` Durable Object keyed by UTC day holds one SQLite row per player attempt. Every state change runs in
  `transactionSync`, applying pure rules from `src/game/daily/attempt.ts`.
- HTTP routes under `/api/daily/*` start attempts, grade them (blind guess, then score), and end them.
- Results go to two server-written collections. `dailyScores` is public. `dailyDrawings` is owner-only until the
  cron sets `visibility: 'public'` after the day closes.
- A daily cron at 00:15 UTC publishes the drawings and awards medals.
- The judge is fake by default (dev and tests). It is real only in the production build, and calls the local
  `claude -p` helper only when asked.

**Tech Stack:** DeepSpace SDK 0.44.2 (Cloudflare Workers, Hono, RecordRoom collections, CronRoom, BaseRoom + SQLite),
React + generouted pages, vitest, Playwright (offline config).

**Spec:** `docs/superpowers/specs/2026-11-17-daily-mode-design.md` (read it, especially §5.1–5.8).

## Global Constraints

- Never run `deepspace deploy`, `deepspace push`, `app undeploy`, `app transfer` or `app collaborators`.
  Never put secrets in files.
- Read `.agents/skills/deepspace/SKILL.md` before touching worker, DO or schema code.
- `node_modules` may be missing in a fresh worktree. Run `npm ci` first.
- `npm run verify` (lint, type-check, vitest, build) must pass at the end of every task, and all existing tests keep
  passing.
- No real AI call is ever made by tests or dev unless the person running them explicitly sets `DAILY_JUDGE=local`
  or `real`.
- Haiku is called only server-side via `createServerTools(env).integration('anthropic/chat-completion', body)`. Every
  call first reserves from `BudgetRoom`.
- Attempt: 10 min (`600_000` ms), one per user per UTC day of `startedAt`. Score total 0–1000 =
  `fit×5` (0–500) + `recognition×4` (0–400) + `round(100 × (1 − elapsedMs/600000))` (0–100).
- `BUDGET.dailyCalls = 1000`.
- Party mode (rooms, `/r/:code`, `PixelRoom`) keeps working unchanged apart from its entry route.
- Keep the existing visual style. The redesign is out of scope.

## Review Focus

1. **Double-clicked Ask, or two tabs grading at once:** only one grade runs, and the other gets `busy` without
   spending anything. Pinned in Task 1 (`reserveGrade` while in flight) and Task 4 (parallel `gradeDaily`).
2. **Reloading the page mid-attempt:** the prompt, timer, grade counts and best grade come back from
   `GET /api/daily/me`, and the drawing comes back from localStorage. Pinned in Task 4 (`dailyState` after start) and
   Task 6 (hook restores the grid).
3. **Budget refused or Haiku failing mid-attempt:** the grade reports `judge_resting`, Ask-now count is unchanged,
   in-flight is cleared, and the next grade works. Pinned in Task 4.
4. **Grading after 10:00, or across midnight:** a grade after `startedAt + 600_000 + graceMs` is rejected with
   `time_up`. An attempt started 23:55 still grades against its start day. Pinned in Task 1 and Task 4.
5. **Unchanged canvas:** an auto or final grade with the same cells hash as the last grade returns `unchanged` and
   costs no budget or judge call. Pinned in Task 1 and Task 4.

---

### Task 1: Daily rules core (config, prompts, scoring, attempt state machine)

**Files:**
- Modify: `src/game/config.ts` (add `DAILY`, set `BUDGET.dailyCalls` to 1000)
- Create: `src/game/daily/prompts.ts`, `src/game/daily/scoring.ts`, `src/game/daily/attempt.ts`
- Test: `src/game/daily/prompts.test.ts`, `src/game/daily/scoring.test.ts`, `src/game/daily/attempt.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // config.ts
  export const DAILY = { attemptMs: 600_000, graceMs: 15_000, firstAutoMs: 120_000, autoEveryMs: 120_000,
    autoMinGapMs: 100_000, maxAuto: 4, maxAsks: 3, askMinGapMs: 20_000, inFlightStaleMs: 60_000, renderPx: 512 } as const
  // prompts.ts (server-only module: must never be imported from src/pages, src/components or src/hooks)
  export interface DailyPrompt { prompt: string; subject: string }
  export const DAILY_PROMPTS: readonly DailyPrompt[]          // ≥ 80 entries
  export function promptForDay(day: string): DailyPrompt      // day = 'YYYY-MM-DD'
  // scoring.ts
  export interface GradeParts { fit: number; recognition: number; speed: number; total: number } // points, not raw
  export function gradeScore(raw: { fit: number; recognition: number; elapsedMs: number }): GradeParts
  // attempt.ts
  export type GradeKind = 'auto' | 'ask' | 'final'
  export type GradeReject = 'not_started' | 'ended' | 'time_up' | 'too_soon' | 'no_auto_left' | 'no_asks_left'
    | 'final_used' | 'unchanged' | 'busy'
  export interface AttemptRow { userId: string; day: string; startedAt: number; endedAt: number | null;
    autoUsed: number; asksUsed: number; finalUsed: boolean; inFlightSince: number | null; inFlightKind: GradeKind | null;
    lastGradedHash: string | null; lastGradeAt: number | null; bestScore: number; bestElapsedMs: number | null;
    lastCells: string | null }
  export function startAttempt(existing: AttemptRow | null, userId: string, day: string, now: number): { row: AttemptRow; created: boolean }
  export function reserveGrade(row: AttemptRow | null, kind: GradeKind, cellsHash: string, now: number):
    { ok: true; row: AttemptRow; elapsedMs: number } | { ok: false; reason: GradeReject }
  export function completeGrade(row: AttemptRow, outcome: { total: number; elapsedMs: number } | null,
    cellsHash: string, cells: string, now: number): { row: AttemptRow; improved: boolean }
  export function endAttempt(row: AttemptRow, cells: string | null, now: number): AttemptRow
  export function isEnded(row: AttemptRow, now: number): boolean   // endedAt !== null || now > startedAt + attemptMs + graceMs
  export function cellsHash(cells: string): string                 // cheap stable hash (e.g. FNV-1a hex) of the base64 cells
  ```

- [ ] **Step 1: Draft the prompts.** Write ≥ 80 `{ prompt, subject }` entries. Each is a subject plus a detail or
  scene that can be drawn at 32×32 in 16 colours ("a lighthouse in a storm" / subject "lighthouse"). `subject` is a
  single common noun. No duplicates and no brands. `promptForDay` indexes by days-since-epoch of `day` modulo length,
  after a fixed shuffle seed so consecutive days aren't alphabetical.
- [ ] **Step 2: Write failing tests.**
  - `prompts.test.ts`:
    - `promptForDay('2026-11-18')` is stable across calls, and differs from `promptForDay('2026-11-19')`;
    - `DAILY_PROMPTS.length >= 80`;
    - every `subject` is non-empty and lower-case;
    - prompts are unique;
    - no file under `src/pages`, `src/components` or `src/hooks` imports `daily/prompts` (read the files with
      `fs` and grep).
  - `scoring.test.ts`:
    - `gradeScore({fit:100, recognition:100, elapsedMs:0}).total === 1000`;
    - `gradeScore({fit:80, recognition:50, elapsedMs:120_000})` equals `{fit:400, recognition:200, speed:80, total:680}`;
    - `elapsedMs: 590_000` gives `speed 2`;
    - inputs are clamped: fit 150 gives 500, recognition −5 gives 0, elapsedMs 700_000 gives speed 0.
  - `attempt.test.ts` (use `now = Date.UTC(2026,10,18,12)`):
    - `startAttempt(null, …)` gives `created: true` and zeroed counters. A second `startAttempt(existing, …)` gives
      `created: false` with the row unchanged.
    - `reserveGrade(null, 'ask', h, now)` gives `not_started`.
    - Ask at `start + 5_000` is ok and sets `inFlightSince`. A second reserve while in flight gives `busy`. A reserve
      after `inFlightStaleMs` is ok again.
    - Auto at `start + 60_000` gives `too_soon`. Auto at `start + 120_000` is ok. Auto again at `+180_000` gives
      `too_soon` (gap < 100_000). A fifth auto gives `no_auto_left`.
    - A fourth ask gives `no_asks_left`. An ask within 20_000 of the last grade gives `too_soon`.
    - Auto or final with `cellsHash === lastGradedHash` gives `unchanged`. Ask with an unchanged hash is allowed
      (the player asked).
    - Final is allowed at `start + 610_000` (within grace) and gives `time_up` at `start + 616_000`. A second final
      gives `final_used`.
    - `completeGrade(row, null, …)` clears in-flight, refunds the ask if `inFlightKind === 'ask'` (`asksUsed − 1`),
      and refunds auto the same way, leaving `bestScore` unchanged.
    - `completeGrade` with total 700 then 600 leaves `bestScore 700` (`improved` true, then false). An equal 700 later
      leaves `bestElapsedMs` at the earlier value.
    - `endAttempt` sets `endedAt` and stores `cells` in `lastCells` only if non-null. After that, `reserveGrade` gives
      `ended`.
    - `isEnded` is true at `start + 615_001` with no `endAttempt`.
- [ ] **Step 3: Run** `npx vitest run src/game/daily`. Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** the three modules and the config change. Counters (`autoUsed`/`asksUsed`/`finalUsed`)
  are incremented in `reserveGrade`. `lastGradeAt` and `lastGradedHash` are set in `completeGrade` only on success.
  The ask-gap check uses `lastGradeAt`.
- [ ] **Step 5: Run** `npx vitest run src/game/daily`, then `npm run verify`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(daily): rules core: prompts, scoring, attempt state machine`

---

### Task 2: Two-step judge with fake / local / real modes

**Files:**
- Create: `src/game/daily/judge.ts`, `src/server/daily-judge.ts`, `src/server/budget.ts`, `scripts/local-judge.mjs`
- Modify: `vite.config.ts` (define `__DAILY_JUDGE__`), `src/server/pixel-room.ts` (use `reserveBudget` from
  `budget.ts`), `package.json` (script `"judge:local": "node scripts/local-judge.mjs"`)
- Test: `src/game/daily/judge.test.ts`, `src/server/daily-judge.test.ts`, `src/server/budget.test.ts`

**Interfaces:**
- Consumes: `renderZonePng(g, zone, outPx)`, `toBase64`, `decodeCells` (src/game/png.ts, grid.ts);
  `createServerTools(env).integration`; `extractText` (src/game/judge.ts); `utcDay`/`withTimeout` (src/server/room-time.ts).
- Produces:
  ```ts
  // src/game/daily/judge.ts
  export function buildBlindBody(pngBase64: string): object   // never contains the prompt
  export function parseBlind(text: string): { guess: string } | null
  export function buildScoreBody(pngBase64: string, prompt: string, subject: string, guess: string): object
  export function parseScore(text: string): { fit: number; recognition: number; reason: string } | null
  // src/server/daily-judge.ts
  export interface DailyJudge {
    blind(png: string): Promise<{ guess: string } | null>
    score(png: string, prompt: string, subject: string, guess: string): Promise<{ fit: number; recognition: number; reason: string } | null>
  }
  export function createDailyJudge(env: Env, mode?: 'fake' | 'local' | 'real'): DailyJudge  // default: __DAILY_JUDGE__
  export function fakeDailyJudge(): DailyJudge
  export async function renderCellsPng(cells: string): Promise<string>   // base64 PNG of a 32×32 grid at DAILY.renderPx
  // src/server/budget.ts
  export async function reserveBudget(env: Env): Promise<boolean>   // POST BudgetRoom 'global' /reserve, 5s timeout, false on any error
  ```

- [ ] **Step 1: Write failing tests.**
  - `judge.test.ts`:
    - `JSON.stringify(buildBlindBody('x'))` has no `prompt` text and contains the image block;
    - `buildScoreBody('x','a lighthouse in a storm','lighthouse','candle')` contains all three strings;
    - `parseBlind('```json\n{"guess":"a candle"}\n```')` gives `{guess:'a candle'}`, and `parseBlind('nope')` gives null;
    - `parseScore('{"fit":"72","recognition":40,"reason":"ok"}')` gives numbers clamped to 0–100;
    - `parseScore` returns null if fields are missing or non-finite;
    - `reason` is trimmed to ≤ 140 chars.
  - `daily-judge.test.ts`:
    - `fakeDailyJudge()` returns the same output for the same PNG and different output for a different PNG;
    - `fit`/`recognition` are in 0–100;
    - with `mode: 'fake'`, `createDailyJudge(env, 'fake').blind(...)` never calls `env`'s integration (pass an env
      whose tools would throw);
    - `renderCellsPng(encodeCells(new Uint8Array(1024)))` returns a non-empty base64 string.
  - `budget.test.ts`: `reserveBudget` returns true for `{ok:true}`, false for `{ok:false}`, false on a non-2xx
    response, and false when fetch throws (stub `env.BUDGET_ROOMS`).
- [ ] **Step 2: Run** `npx vitest run src/game/daily/judge.test.ts src/server/daily-judge.test.ts src/server/budget.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Judge copy.**
    - The blind system prompt tells the model the image is a 32×32 pixel drawing made by one person for a guessing
      game, and asks for raw JSON `{"guess": short phrase}`.
    - The score system prompt carries the rubric: `fit` is how well the whole prompt (subject plus detail) is shown;
      `recognition` is how close the blind guess is to `subject` (exact or synonym ≈ 100, related ≈ 50, wrong 0).
      It asks for JSON `{fit, recognition, reason}`, where `reason` is one short sentence addressed to the player.
    - Use `JUDGE.model`.
  - **Real mode** calls `createServerTools(env).integration('anthropic/chat-completion', body)` with a 20s timeout
    and `extractText`.
  - **Local mode** POSTs `{ system, user, png }` to `http://127.0.0.1:8789/judge` and expects `{ text }`.
  - **Fake mode** derives numbers from `cellsHash(png)` and picks a guess from a small canned list.
  - **`vite.config.ts`:** `__DAILY_JUDGE__` = `process.env.DAILY_JUDGE` if set. Otherwise `'fake'` when
    `PIXEL_PARTY_TEST === '1'` or the command is `serve`, else `'real'`. Declare the global next to
    `__PIXEL_PARTY_TEST__`, and keep `__PIXEL_PARTY_TEST__`'s integration guard working.
  - **`scripts/local-judge.mjs`:**
    - Node `http` server on 127.0.0.1:8789.
    - Writes the PNG to a temp file, then runs `claude -p` (system prompt plus "Read the image at <path>", with the
      Read tool allowed for that path and output format json) via `child_process.execFile`.
    - Returns `{ text }` and logs one line per call. No retries. Port and binary can be overridden via env vars.
  - **`pixel-room.ts`:** replace its private `reserveBudget` body with a call to `budget.ts` while keeping its
    `restingDay` logic.
- [ ] **Step 4: Run** the three test files, then `npm run verify`. Expected: PASS, including the existing
  `pixel-room.test.ts`.
- [ ] **Step 5: Manual check, no AI spend:** `node scripts/local-judge.mjs` starts and logs its port. Stop it.
  Do not send it a request.
- [ ] **Step 6: Commit** `feat(daily): two-step judge with fake/local/real modes; shared budget helper`

---

### Task 3: Storage: DailyRoom Durable Object and collections

**Files:**
- Create: `src/server/daily-room.ts`, `src/schemas/daily-scores-schema.ts`, `src/schemas/daily-drawings-schema.ts`
- Modify: `worker.ts` (export `DailyRoom`, add `{ binding: 'DAILY_ROOMS', className: 'DailyRoom', sqlite: true }` to
  `__DO_MANIFEST__`), `wrangler.toml` (`[[migrations]] tag = "v4" new_sqlite_classes = ["DailyRoom"]` plus the
  binding), `src/schemas.ts`
- Test: `src/server/daily-room.test.ts`

**Interfaces:**
- Consumes: everything in `attempt.ts` (Task 1).
- Produces:
  ```ts
  // daily-room.ts. One DO instance per UTC day: env.DAILY_ROOMS.idFromName(day)
  // POST /op with JSON { op: 'start'|'reserve'|'complete'|'end'|'get', userId, day, now, kind?, hash?, outcome?, cells? }
  // Each op loads the row, applies the pure function inside state.storage.transactionSync, saves, and returns JSON:
  //   start → { row, created }   reserve → reserveGrade result   complete → { row, improved }   end/get → { row | null }
  export class DailyRoom extends BaseRoom<Env>
  export interface AttemptStore {
    start(userId: string, day: string, now: number): Promise<{ row: AttemptRow; created: boolean }>
    reserve(userId: string, day: string, kind: GradeKind, hash: string, now: number): Promise<ReturnType<typeof reserveGrade>>
    complete(userId: string, day: string, outcome: { total: number; elapsedMs: number } | null, hash: string, cells: string, now: number): Promise<{ row: AttemptRow; improved: boolean }>
    end(userId: string, day: string, cells: string | null, now: number): Promise<AttemptRow | null>
    get(userId: string, day: string): Promise<AttemptRow | null>
  }
  export function doAttemptStore(env: Env): AttemptStore      // routes each call to idFromName(day)
  export function memoryAttemptStore(): AttemptStore          // same semantics over a Map; used by Task 4 tests
  ```
  Collections:
  - **`dailyScores`:**
    - `uniqueOn ['day','userId']`, `permissions: serverWrittenPermissions(true)`;
    - columns `day` text, `userId` text, `displayName` text, `avatarUrl` text, `score` number, `fit` number,
      `recognition` number, `speed` number, `bestElapsedMs` number, `ended` number (0/1), `medal` number (0–3).
  - **`dailyDrawings`:**
    - `uniqueOn ['day','userId']`, `ownerField: 'userId'`, `visibilityField: 'visibility'`,
      `permissions: serverWrittenPermissions('shared')`;
    - columns `day`, `userId`, `displayName`, `prompt`, `cells` (base64 text), `score`, `guess`, `reason`, and
      `visibility` (select `public`/`private`, default `private` when written).

- [ ] **Step 1: Write failing tests** (`daily-room.test.ts`).
  - Run the same scenario against `memoryAttemptStore()`, and against `doAttemptStore` backed by a fake namespace
    whose stub forwards to a `DailyRoom`'s `fetch`. If constructing `DailyRoom` in node vitest is impractical, test
    the DO's op handler as an exported pure function `handleOp(row, body)`.
  - The scenario:
    - start;
    - start again gives `created: false`;
    - reserve ask;
    - reserve ask again gives `busy`;
    - complete 500;
    - get shows `bestScore 500`;
    - end;
    - reserve gives `ended`.
  - Also assert that a row for `day 2026-11-17` is not visible via `get(userId, '2026-11-18')`.
- [ ] **Step 2: Run** `npx vitest run src/server/daily-room.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **DO table:** `attempts(day TEXT, userId TEXT, row TEXT NOT NULL, PRIMARY KEY(day,userId))`, where `row` is the
    JSON `AttemptRow`.
  - **DO entry points:** only `POST /op`. Everything else returns 404. `onMessage` is a no-op, like `BudgetRoom`.
  - **Collections:** register both schemas in `src/schemas.ts`. No wrangler migration is needed for collections.
- [ ] **Step 4: Run** the test, then `npm run verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(daily): DailyRoom referee DO and dailyScores/dailyDrawings collections`

---

### Task 4: Daily service and HTTP routes

**Files:**
- Create: `src/server/daily-service.ts`, `src/server/daily-routes.ts`
- Modify: `worker.ts` (call `registerDailyRoutes(app)` after `registerActionRoutes`)
- Test: `src/server/daily-service.test.ts`, `src/server/daily-routes.test.ts`

**Interfaces:**
- Consumes: `AttemptStore`, `memoryAttemptStore` (Task 3); `DailyJudge`, `fakeDailyJudge`, `renderCellsPng`,
  `reserveBudget` (Task 2); `promptForDay`, `gradeScore`, `cellsHash`, `DAILY` (Task 1); `ServerTools`,
  `memoryTools()` (src/server/room-test-tools.ts); `resolveAuth` (src/server/http-routes.ts) gives
  `{ userId, claims: { name?, image? } }`; `utcDay`.
- Produces:
  ```ts
  export interface DailyUser { userId: string; name: string; image: string }   // name = claims.name ?? 'Player'
  export interface DailyDeps { now(): number; store: AttemptStore; judge: DailyJudge; tools: ServerTools;
    reserveBudget(): Promise<boolean>; render(cells: string): Promise<string> }
  export interface GradeView { guess: string; reason: string; fit: number; recognition: number; speed: number; total: number; elapsedMs: number }
  export interface DailyStateView { day: string; status: 'not_started' | 'playing' | 'ended'; prompt?: string;
    startedAt?: number; endsAt?: number; autoUsed: number; asksUsed: number; finalUsed: boolean; best: number;
    nextAutoAt?: number; lastCells?: string }
  export function startDaily(deps: DailyDeps, user: DailyUser): Promise<DailyStateView>
  export function gradeDaily(deps: DailyDeps, user: DailyUser, kind: GradeKind, cells: string, day: string):
    Promise<{ ok: true; grade: GradeView; state: DailyStateView } | { ok: false; reason: GradeReject | 'judge_resting' | 'bad_cells'; state: DailyStateView }>
  export function endDaily(deps: DailyDeps, user: DailyUser, cells: string | null, day: string): Promise<DailyStateView>
  export function dailyState(deps: DailyDeps, userId: string): Promise<DailyStateView>
  export function todaysDrawings(deps: DailyDeps, userId: string): Promise<{ ok: true; drawings: unknown[] } | { ok: false }>
  export function registerDailyRoutes(app: Hono<AppContext>): void
  // Routes (all JSON; 401 { error: 'sign_in_required' } without a valid Bearer token):
  // POST /api/daily/start            → DailyStateView
  // POST /api/daily/grade { day, kind, cells } → gradeDaily result (HTTP 200 for ok:false too; 400 on malformed body)
  // POST /api/daily/end   { day, cells? } → DailyStateView (400 for an invalid attempt day)
  // GET  /api/daily/me               → DailyStateView
  // GET  /api/daily/today/drawings   → todaysDrawings (403 when caller hasn't ended today)
  ```
  Day for every operation (final-review amendment, November 17, 2026):
  - `start` explicitly starts/resumes today's row; yesterday does not consume today's attempt.
  - `me` resumes yesterday first only while that attempt is still in progress (through `endsAt + grace`),
    even if today's row also exists. Otherwise it returns today's row or today's `not_started` state.
  - `grade` and `end` require the start-day returned by the server in the JSON body. The server permits today,
    or yesterday only if that player's yesterday attempt is still live. It never guesses from whichever row exists.
  - The hook retains a live old-day canvas, then refetches `me` after ending across midnight (or when an idle
    page crosses midnight). Changing days resets the canvas, latest/best results, and scheduling state.
  - Today's spoiler access is still checked against today's ended row, independently of finishing yesterday.

  Authority/publication amendment: persist the full winning grade and its cells in the DO row, including the
  first accepted zero-point result. `publish` is a per-player/day ordered writer inside the DO that rereads the
  current winning row, never a caller-supplied grade. Start, later grades, end, and state reads republish it to
  repair record failures; existing visibility and medals are not reset. No background queue is introduced.
  Completion returns `applied: false` for stale reservations and the HTTP result is `ok: false, reason: 'stale'`.
  The lease is five minutes (longer than four bounded one-minute local calls), and each subsequent judge phase
  checks reservation ownership before spending budget/calling a model. Both daily and party use the build-time
  fake/real judge selection; only production's real mode reaches the party integration.

- [ ] **Step 1: Write failing tests** (`daily-service.test.ts`, using `memoryAttemptStore`, `memoryTools`,
  `fakeDailyJudge`, a controllable `now`, and `reserveBudget` as a `vi.fn` returning true; cells = `encodeCells` of a
  1024-byte grid).
  - **Start:**
    - `startDaily` returns `status 'playing'`, `prompt === promptForDay(day).prompt`, and `endsAt = startedAt + 600_000`;
    - it creates a `dailyScores` row (score 0, displayName from the user) and a `dailyDrawings` row
      (`visibility 'private'`);
    - calling it again doesn't reset `startedAt` and doesn't create duplicate rows.
  - **Before start:** `dailyState` returns no `prompt`.
  - **Grading:**
    - Ask at +5s gives `ok:true`, and `grade.total === gradeScore(...)` from the fake judge's numbers;
    - `dailyScores.score` and `dailyDrawings.cells` are updated;
    - `reserveBudget` is called twice (one per Haiku call).
  - **Parallel grades:** two `gradeDaily` 'ask' calls started without awaiting the first give exactly one `ok:true`
    and one `busy`.
  - **Budget refused:** `reserveBudget` returning false gives `judge_resting`, and `asksUsed` is unchanged afterwards.
    A judge returning null from `score` gives the same. After either, a new ask succeeds.
  - **Unchanged and lower grades:**
    - an unchanged 'auto' grade gives `unchanged`, with zero judge and budget calls;
    - a lower later grade doesn't change the saved `dailyDrawings.cells` or `dailyScores.score`.
  - **Bad input:** `cells` that don't decode to 1024 cells with values 0–15 give `bad_cells`, with no budget used.
  - **Time limits:**
    - a grade at `startedAt + 616_000` gives `time_up`;
    - `endDaily` sets `ended: 1` on `dailyScores` and stores `cells` on the drawing when no grade ever succeeded.
  - **Midnight:** start at `Date.UTC(2026,10,17,23,55)`, then grade at `00:01` the next day. The grade succeeds and
    updates the `2026-11-17` rows.
  - **Today's drawings:** `todaysDrawings` returns `ok:false` before the caller ends, and returns that day's drawings
    after.
  - `daily-routes.test.ts`: reuse the existing worker route test pattern (`src/server/worker-routes.test.ts`):
    - POST `/api/daily/start` without auth gives 401;
    - a malformed `/api/daily/grade` body gives 400.
- [ ] **Step 2: Run** `npx vitest run src/server/daily-service.test.ts src/server/daily-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Grade flow:** validate cells, then `store.reserve`, then `reserveBudget`, then `judge.blind`, then
    `reserveBudget`, then `judge.score`, then `gradeScore`, then `store.complete`.
  - **Retries:** retry each judge call once on null before treating it as failed. On any failure, call
    `store.complete(..., null, ...)` so the in-flight slot is released and the counter refunded.
  - **Records:** upsert by querying `where {day, userId}` and then `update`, or `create` if missing. Write to the
    records only when `improved`, or on start/end.
  - **Routes:** the routes build `DailyDeps` from `env` (`doAttemptStore(env)`, `createDailyJudge(env)`,
    `createServerTools(env)`, `() => reserveBudget(env)`, `renderCellsPng`, `Date.now`).
- [ ] **Step 4: Run** the tests, then `npm run verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(daily): daily service and /api/daily routes`

---

### Task 5: Close-the-day cron

**Files:**
- Create: `src/server/daily-close.ts`
- Modify: `src/cron.ts` (register `{ name: 'daily-close', schedule: '15 0 * * *', timezone: 'UTC' }` and dispatch it
  in `runTask`)
- Test: `src/server/daily-close.test.ts`

**Interfaces:**
- Consumes: `ServerTools`, `memoryTools()`, the collections from Task 3, `utcDay`.
- Produces: `export async function closeDay(tools: ServerTools, day: string): Promise<{ published: number; medals: number }>`.
  `runTask('daily-close', env)` calls `closeDay(createServerTools(env), utcDay(Date.now() - 86_400_000))`.

- [ ] **Step 1: Write failing tests.** Seed 5 `dailyScores` and 5 `dailyDrawings` rows for `2026-11-17` (two tied
  at 700 with `bestElapsedMs` 200_000 and 150_000), plus one row for `2026-11-18`. Then:
  - `closeDay(tools, '2026-11-17')` sets every 11-17 drawing to `visibility 'public'` and leaves the 11-18 one
    `private`;
  - it sets medal 1/2/3 by score descending, with ties broken by lower `bestElapsedMs` (the 150_000 row beats the
    200_000 one), and medal 0 for the rest;
  - it sets `ended: 1` on every 11-17 score;
  - running it twice gives the same result.
- [ ] **Step 2: Run** `npx vitest run src/server/daily-close.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Page through rows with `roomRecords` from `src/server/rooms.ts`, or the same 50-at-a-time
  pattern.
- [ ] **Step 4: Run** the test, then `npm run verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(daily): daily-close cron publishes drawings and awards medals`

---

### Task 6: Daily play page (home) and Party mode route

**Files:**
- Create: `src/game/daily/client-schedule.ts`, `src/hooks/useDailyAttempt.ts`, `src/components/daily/GradePanel.tsx`,
  `src/components/daily/DailyTimer.tsx`, `src/pages/(app)/party.tsx` (current `home.tsx` content moved here unchanged)
- Modify: `src/pages/(app)/home.tsx` (becomes the daily page), `src/nav.ts` (`/home` → label "Daily", add
  `{ path: '/party', label: 'Party mode' }`, keep `/r/play`), any links or tests that send party actions to
  `/home`, and `src/pages/index.tsx` landing copy (lead with the daily challenge, still link to `/home`)
- Test: `src/game/daily/client-schedule.test.ts`, `src/hooks/useDailyAttempt.test.ts` (only if the repo already
  tests hooks; otherwise test the pure reducer below)

**Interfaces:**
- Consumes: the `/api/daily/*` routes and the `DailyStateView`/`GradeView` shapes (Task 4, import the types);
  `getAuthToken`, `useAuthProfileReady`, `AuthOverlay` from `deepspace`; `PixelCanvas` and `Palette` props; the
  stroke helpers in `src/game/stroke.ts` for drag-fill; `encodeCells`/`decodeCells`; `DAILY`.
- Produces:
  ```ts
  // client-schedule.ts (pure)
  export function nextAutoAt(startedAt: number, autoUsed: number, lastGradeAt: number | null): number | null  // null when autoUsed >= 4
  export function shouldFinalGrade(now: number, startedAt: number): boolean   // now >= startedAt + attemptMs
  export function dailyReducer(state: DailyClientState, action: DailyAction): DailyClientState
  // useDailyAttempt.ts
  export function useDailyAttempt(): { state: DailyClientState; cells: Uint8Array; paint(x: number, y: number, color: number): void;
    start(): Promise<void>; askNow(): Promise<void>; done(): Promise<void> }
  ```
  `DailyClientState` holds:
  - the server `DailyStateView`;
  - `latest: GradeView | null`;
  - `grading: boolean`;
  - `lastError: string | null`.

- [ ] **Step 1: Write failing tests** (`client-schedule.test.ts`):
  - `nextAutoAt(s, 0, null) === s + 120_000`;
  - `nextAutoAt(s, 1, s + 120_000) === s + 240_000`;
  - `nextAutoAt(s, 4, x) === null`;
  - `shouldFinalGrade(s + 600_000, s)` is true;
  - in the reducer: a `grade_ok` action sets `latest` and `best = max`, and a `grade_rejected` action with
    `judge_resting` sets `lastError` to "Judge is resting, keep drawing" without changing `best`.
- [ ] **Step 2: Run** `npx vitest run src/game/daily/client-schedule.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Data:**
    - On mount, the hook loads `GET /api/daily/me`.
    - The canvas is local state, mirrored to localStorage under `daily:<day>:<userId>` (wrap every access in
      try/catch). It is restored on reload, falling back to `lastCells`.
  - **Grading:**
    - A 1s ticker fires the auto grade at `nextAutoAt`.
    - When the time is up, it fires the final grade (`kind 'final'`), then calls `end`.
    - `done()` sends a final grade, then `end`.
    - A grade response of `unchanged` or `too_soon` is silent.
  - **Page layout:**
    - Signed out: today's leaderboard (Task 7 component, or a placeholder slot if Task 7 lands later) plus a
      sign-in button.
    - Not started: a Start button that explains 10 minutes, 3 Ask-nows and grades every 2 minutes. The prompt is
      hidden.
    - Playing: prompt, timer, canvas, palette, "Ask now (n left)", Done, and a GradePanel with the latest guess
      ("Haiku thinks: …"), fit/recognition/speed parts, total, and "Best: N / 1000".
    - Ended: best drawing, score breakdown, and today's leaderboard.
  - Disable drawing when the attempt has ended.
- [ ] **Step 4: Run** the tests, then `npm run verify`. Expected: PASS.
- [ ] **Step 5: Manual check with the fake judge:** `npx deepspace dev start`, sign in, start, paint, press Ask now.
  The grade panel shows a fake guess and parts. Reload: the prompt, timer and drawing are restored. `/party` shows
  the old lobby and `/r/play` still works. Stop the dev server.
- [ ] **Step 6: Commit** `feat(daily): daily play page; party mode moves to /party`

---

### Task 7: Leaderboard and profile galleries

**Files:**
- Create: `src/components/daily/Leaderboard.tsx`, `src/components/daily/PixelThumb.tsx`,
  `src/pages/(app)/u/[userId].tsx`, `src/game/daily/rank.ts`
- Modify: `src/pages/(app)/home.tsx` (mount `Leaderboard` in the signed-out and ended states, with a day switcher
  for today and previous days)
- Test: `src/game/daily/rank.test.ts`

**Interfaces:**
- Consumes: `useQuery('dailyScores', { where: { day } })` and `useQuery('dailyDrawings', { where: { userId } })` from
  `deepspace`; `GET /api/daily/today/drawings` (Task 4); `PALETTE`, `decodeCells`.
- Produces: `export function rankScores(rows: { userId: string; score: number; bestElapsedMs: number | null }[]): { userId: string; rank: number }[]`
  (score descending, then lower `bestElapsedMs`, nulls last, with ranks 1..n and no shared ranks), and
  `<PixelThumb cells={string} size={number} />`.

- [ ] **Step 1: Write failing tests** (`rank.test.ts`):
  - `[{a,700,200k},{b,700,150k},{c,900,null}]` ranks to c=1, b=2, a=3;
  - an empty array gives `[]`.
- [ ] **Step 2: Run** `npx vitest run src/game/daily/rank.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Leaderboard:** rank, avatar, name (links to `/u/:userId`), score out of 1000, and a medal icon from the stored
    `medal`. For today, use the 1/2/3 ranks from `rankScores`, labelled "so far".
  - **Today's drawings:** when the viewer has ended today's attempt, the leaderboard also shows thumbnails, from
    `/api/daily/today/drawings`.
  - **Profile page:** display name and a grid of the player's `dailyDrawings` (newest first), each with
    `PixelThumb`, prompt, date, score, Haiku's guess and a medal. RBAC means visitors only see public (closed-day)
    drawings, and the owner also sees today's.
  - Signed-out visitors can view leaderboards and profiles.
- [ ] **Step 4: Run** the test, then `npm run verify`. Expected: PASS.
- [ ] **Step 5: Manual check with the fake judge:** after a played attempt, the leaderboard shows your row. Click
  your name: the profile shows today's drawing to you. In a signed-out window, the profile shows no today-drawing
  and the leaderboard shows the score only.
- [ ] **Step 6: Commit** `feat(daily): leaderboard, profile galleries, pixel thumbnails`

---

### Task 8: End-to-end check, docs, final verification

**Files:**
- Create: `tests/offline/daily.spec.ts`
- Modify: `docs/progress.md` (decisions and integration notes for §5.7 of the spec, verification log rows),
  `README.md` (daily mode first, party mode second), `docs/current-status.md`

- [ ] **Step 1: Write the offline Playwright test** using the existing `tests/offline` helpers and auth approach.
  If those tests run signed out only, cover the signed-out path plus the API 401s:
  - the home page shows a sign-in button and a leaderboard heading, and no prompt text;
  - `POST /api/daily/start` without auth returns 401;
  - `GET /api/__test/ready` passes, proving the test build has integrations disabled.
- [ ] **Step 2: Run** `npm run build && npx playwright test --config tests/offline.playwright.config.ts`. Expected:
  all tests pass (5 existing plus the new ones).
- [ ] **Step 3: Update the docs.**
  - `progress.md`: add a decision entry for the pivot dated 2026-11-17, and an "Integrations used by daily mode" table
    copied from spec §5.7 with any changes made during the build. Also record the local judge helper and the fake
    judge default.
  - `README.md`: how to play, and how judging and scoring work (the 0–1000 breakdown).
- [ ] **Step 4: Run** `npm run verify`. Expected: PASS. Paste the tail of the output into the progress verification log.
- [ ] **Step 5: Commit** `test(daily): offline e2e; docs for daily mode`

---

## Execution order

Task 1 comes first. Tasks 2 and 3 can then run in parallel, since they touch different files apart from `worker.ts`,
which only Task 3 edits. Task 4 needs 1–3. Task 5 needs 3. Tasks 6 and 7 need 4 (types and routes), and Task 7
needs 3 (collections). Task 8 comes last. Real-Haiku and local-CLI checks are **not** part of any task. The
controller asks Will before any of them.
