# PR 1: Daily fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily auto-grades fire at fixed 2/4/6/8-minute windows with visible skip, late and missed outcomes; manual grades are separate from Submit; there's no not-started flash; and there's an Exit control.

**Architecture:** Window outcomes become durable fields on the server `AttemptRow` (Durable Object SQLite JSON), resolved by pure functions in `src/game/daily/attempt.ts`. The server decides skips (blank or unchanged) without calling the judge. The client scheduler moves from the `/home` page into an app-wide provider in `src/pages/(app)/_layout.tsx`, so it keeps running on other app routes.

**Tech Stack:** TypeScript, React, DeepSpace SDK (Cloudflare Workers, Durable Objects), Vitest, Playwright (offline suite).

**Spec:** `docs/superpowers/specs/2026-11-17-porch-redesign-design.md` (sections "Daily grading", "Daily flow fixes", "Scoring legibility"; Daily only).

## Global Constraints

- Follow `AGENTS.md`: never run `deepspace push`, `deepspace deploy`, `app undeploy`, `app transfer` or `app collaborators`. No secrets in files. No real AI calls (use the fake/local judge modes).
- Install with `npm ci` if `node_modules` is missing. `npm run verify` must pass at the end; offline Playwright (`tests/offline/*.spec.ts`) may be updated where it asserts old copy or layout, keeping existing `data-testid`s where the element still exists.
- Windows are offsets from server `startedAt`: 120000, 240000, 360000 and 480000 ms. Manual grades: max 3, with a 20000 ms gap between manual grades only. An auto-grade never submits or ends the attempt.
- Visual styling is not final (PR 3 restyles everything). Keep the current look; ship correct behaviour and copy.
- Don't change the judge, prompts, `gradeScore` formula or AI budget.

## Review Focus

1. Old attempt rows (stored before this PR, with no `windows` or `lastAskAt` fields) mid-attempt on deploy day must load and keep working. Covered by Task 1's `normalizes legacy rows`.
2. A tab throttled in the background (timer ticks once a minute) must produce a late grade, not a missed one, when it fires within 60 s of the window. Covered by Task 1's `late within miss window` and Task 3's `fires a due window after a long tick gap`.
3. Two tabs open on the same attempt must not double-grade one window. The server must reject the second request with `busy` or `too_soon`, not grade the window twice. Covered by Task 2's `second auto for same window is not graded twice`.
4. A judge failure on an auto-grade leaves the window pending so it can retry inside the miss window; it is never recorded as graded with a score of 0. Covered by Task 1's `failed auto keeps window pending`.
5. A returning signed-in user who already finished today must never see the Start screen, even for one frame, including when `/api/daily/me` is slow or fails. Covered by Task 4's offline test.

---

### Task 1: Window model in the attempt engine

**Files:**
- Modify: `src/game/config.ts:75-86` (DAILY)
- Modify: `src/game/daily/attempt.ts`
- Test: `src/game/daily/attempt.test.ts`

**Interfaces:**
- Produces (in `attempt.ts`):
  ```ts
  export type AutoWindowStatus = 'pending' | 'graded' | 'skipped_unchanged' | 'skipped_blank' | 'missed'
  export interface AutoWindowRecord { index: number; status: AutoWindowStatus; resolvedAt: number | null; score: number | null; late: boolean }
  // AttemptRow gains: windows: AutoWindowRecord[]; lastAskAt: number | null; inFlightWindow: number | null
  export function normalizeRow(row: AttemptRow): AttemptRow            // fills windows (4 pending), lastAskAt, inFlightWindow for legacy rows
  export function autoWindowAt(startedAt: number, index: number): number
  export function settleMissedWindows(row: AttemptRow, now: number): AttemptRow
  export function dueAutoWindow(row: AttemptRow, now: number): number | null
  export function isBlankCells(cells: Uint8Array): boolean
  ```
  `reserveGrade(row, kind, cellsHash, now, blank: boolean)` gains a third result variant: `{ ok: 'skipped'; row: AttemptRow; window: number; status: 'skipped_blank' | 'skipped_unchanged' }`. Add `'window_missed'` to `GradeReject`.
- DAILY becomes: remove `firstAutoMs`, `autoEveryMs`, `autoMinGapMs`, `maxAuto`; add `autoWindowsMs: [120_000, 240_000, 360_000, 480_000] as const`, `autoLateMs: 5_000`, `autoMissAfterMs: 60_000`. Replace every usage repo-wide (`grep -rn "firstAutoMs\|autoEveryMs\|autoMinGapMs\|maxAuto" src tests`).

Rules:
- `settleMissedWindows`: each `pending` window whose due time is more than `autoMissAfterMs` ago, and isn't the `inFlightWindow`, becomes `missed` (`resolvedAt = now`).
- `dueAutoWindow`: after settling, the lowest-index `pending` window whose due time is `<= now`; otherwise `null`.
- In `reserveGrade`, kind `auto`: settle, then pick the due window. If there's none, return `too_soon` (or `window_missed` if the most recently due window was just settled as missed). If `blank`, mark the window `skipped_blank`. If `cellsHash === lastGradedHash`, mark it `skipped_unchanged`. Either skip returns `{ ok: 'skipped' }` with no in-flight reservation. Otherwise reserve with `inFlightWindow = index`. `autoUsed` counts graded windows only.
- Kind `ask`: gap checked against `lastAskAt` only; set `lastAskAt = now` on reserve. Kind `final`: unchanged.
- `completeGrade` with an outcome and `inFlightKind === 'auto'`: window → `graded`, `score = outcome.total`, `late = now - dueAt > autoLateMs`. With a null outcome (failure): the window stays `pending` and the in-flight fields clear.

- [ ] **Step 1: Write the failing tests** in `attempt.test.ts` (fixed `t0`; `cells` hashes `h1`/`h2`):
  - `fixed windows ignore manual grades`: an ask at t0+90s, then an auto at t0+120s → window 0 reserved (not `too_soon`).
  - `ask gap counts manual grades only`: auto completes at t0+240s, ask at t0+245s → ok; second ask at t0+255s → `too_soon`.
  - `blank canvas skips`: auto at t0+120s with `blank=true` → `{ok:'skipped', status:'skipped_blank', window:0}`, no in-flight.
  - `unchanged skips`: lastGradedHash `h1`, auto at t0+240s with `h1` → `skipped_unchanged`, window 1.
  - `late within miss window`: auto reserved at t0+150s, completed → window 0 `graded`, `late: true`.
  - `missed after 60s`: `settleMissedWindows(row, t0+181_000)` → window 0 `missed`; a reserve at that time → `window_missed`.
  - `failed auto keeps window pending`: `completeGrade(row, null, …)` → window 0 `pending`, `autoUsed` unchanged.
  - `normalizes legacy rows`: a row without `windows`/`lastAskAt`/`inFlightWindow` → 4 pending windows, nulls.
- [ ] **Step 2: Run** `npm run test:unit -- src/game/daily/attempt.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the interfaces and rules above. Update or remove existing tests that assert the 100 s gap.
- [ ] **Step 4: Run** `npm run test:unit -- src/game/daily`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(daily): fixed auto-grade windows with durable outcomes`.

### Task 2: Server service and routes

**Files:**
- Modify: `src/server/daily-service.ts` (state view at :22 and :50), `src/server/daily-routes.ts` (POST `/api/daily/grade`, GET `/api/daily/me`), `src/server/daily-room.ts` (load and save rows through `normalizeRow`)
- Test: `src/server/daily-service.test.ts`, `src/server/daily-routes.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  export interface AutoWindowView { index: number; dueAt: number; status: AutoWindowStatus; score: number | null; late: boolean }
  // DailyStateView gains: windows: AutoWindowView[]; asksLeft: number; nextAutoAt: number | null (next pending dueAt, else null)
  // POST /api/daily/grade (kind 'auto') may now answer 200 { skipped: 'skipped_blank' | 'skipped_unchanged', window: number, state: DailyStateView }
  ```
- Every state read (`/me`, grade responses) applies `settleMissedWindows` and persists the result if anything changed. A skip never calls the judge.

- [ ] **Step 1: Write the failing tests:**
  - `auto on blank cells skips without judge`: a fake judge spy shows 0 calls; the response has `skipped: 'skipped_blank'`; `/me` shows window 0 `skipped_blank`.
  - `me settles missed windows`: an attempt started 7 minutes ago with no grades → `/me` windows 0–2 `missed`, window 3 `pending`, `nextAutoAt = startedAt + 480000`.
  - `second auto for same window is not graded twice`: two concurrent autos at the same window → exactly one judge call; the other gets `busy` or `skipped_unchanged`.
  - `ask does not move nextAutoAt`: an ask at +90s → `nextAutoAt === startedAt + 120000`.
- [ ] **Step 2: Run** `npm run test:unit -- src/server/daily-service.test.ts src/server/daily-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Compute `blank` from the decoded cells, pass it to `reserveGrade`, persist skips, and remove the duplicated `nextAutoAt` formula.
- [ ] **Step 4: Run** `npm run test:unit -- src/server`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(daily): server records skipped and missed auto windows`.

### Task 3: Client schedule and reducer

**Files:**
- Modify: `src/game/daily/client-schedule.ts`
- Test: `src/game/daily/client-schedule.test.ts`, `src/game/daily/final-client-regressions.test.ts` (update)

**Interfaces:**
- Consumes: `AutoWindowView`, `DailyStateView` from Task 2.
- Produces:
  - `DailyClientState` gains `loaded: boolean` (false initially) and `notice: string | null`.
  - New actions: `{ type: 'grade_skipped'; status: 'skipped_blank' | 'skipped_unchanged'; window: number; state: DailyStateView }` and `{ type: 'clear_notice' }`.
  - `shouldFireAutoGrade(state: DailyClientState, now: number): boolean`. The `currentCellsHash` parameter is removed; the server decides skips.
  - `nextAutoAt` (the client helper) is deleted; use `state.nextAutoAt`.
  - Notice copy, exact: `skipped_unchanged` → `"Auto-grade skipped: no changes since your last grade"`; `skipped_blank` → `"Auto-grade skipped: nothing drawn yet"`.
- `state_loaded` sets `loaded: true`.

- [ ] **Step 1: Write the failing tests:**
  - `fires a due window after a long tick gap`: playing, `nextAutoAt = t`, `now = t + 55_000` → `true`; `now = t + 61_000` → `false`.
  - `does not fire while grading or before due` → `false`.
  - `grade_skipped sets notice and windows`.
  - `initial state is not loaded`: `initialDailyClientState().loaded === false`.
- [ ] **Step 2: Run** `npm run test:unit -- src/game/daily/client-schedule.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:unit -- src/game/daily`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(daily): client schedule follows server windows`.

### Task 4: App-wide daily provider and loading state

**Files:**
- Create: `src/hooks/DailyAttemptProvider.tsx`
- Modify: `src/hooks/useDailyAttempt.ts` (handle the `skipped` response; `loaded`; failed initial `/me` keeps `loaded: false` and retries with backoff instead of silently showing not-started), `src/pages/(app)/_layout.tsx:27` (mount the provider inside the auth and record providers), `src/pages/(app)/home.tsx:64` (consume the context; render a loading panel while `!state.loaded`)
- Test: `tests/offline/daily.spec.ts`

**Interfaces:**
- Produces: `DailyAttemptProvider({ children })` and `useDaily(): ReturnType<typeof useDailyAttempt>` (throws outside the provider). The one-second scheduler effect lives in the provider, so it runs on every `(app)` route. The hook doesn't fetch for signed-out users, and sets `loaded: true` for them.
- Loading panel copy: `"Setting up your easel…"` with `data-testid="daily-loading"`.

- [ ] **Step 1: Write the failing offline tests:**
  - `ended user never sees start`: stub `/api/daily/me` with a 1500 ms delay returning `ended` → `daily-loading` visible, and the Start button never appears (assert with a polling check across the delay); the ended view then appears.
  - `me failure stays loading then recovers`: the first `/me` returns 500 and the second returns `playing` → no Start button; the playing view appears.
  - `auto-grade fires on another route`: start an attempt, navigate to `/party`, advance the clock past 2:00 (Playwright `page.clock`) → a grade request is observed.
- [ ] **Step 2: Run** `npm run build && npx playwright test tests/offline/daily.spec.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `fix(daily): app-wide scheduler and no not-started flash`.

### Task 5: Daily UI: timeline, score legibility, buttons, Exit

**Files:**
- Create: `src/components/daily/AutoGradeTimeline.tsx`, `src/components/daily/ExitDailyButton.tsx`
- Modify: `src/components/daily/GradePanel.tsx`, `src/pages/(app)/home.tsx` (not-started rules list at :261-278, playing controls at :366-398)
- Test: `src/components/daily/AutoGradeTimeline.test.tsx` (if the repo has a React test setup; otherwise put the label logic in `src/game/daily/timeline-labels.ts` with `timeline-labels.test.ts`), `tests/offline/daily.spec.ts`

**Interfaces:**
- Consumes: `AutoWindowView`, `state.notice`, `state.asksLeft`.
- Produces: `timelineLabel(w: AutoWindowView, now: number): string` with this exact copy (times shown as `m:ss` of the window offset):
  - graded: `"2:00 · 655"`, plus `" (late)"` if late
  - skipped_unchanged: `"4:00 skipped: no changes since your last grade"`
  - skipped_blank: `"2:00 skipped: nothing drawn yet"`
  - missed: `"6:00 missed: tab was closed"`
  - pending, future: `"6:00 in 0:42"`; pending, due: `"6:00 grading…"`
- Copy:
  - **GradePanel rows:** `"Matches the prompt"` x/500, `"Easy to recognise"` x/400, `"Speed"` x/100, each with a bar, and the total as x/1000. The judge's reason stays.
  - **Buttons:** `"Grade now (N left)"` (`data-testid` kept from the old Ask button) and `"Submit & finish"` (`data-testid` kept from the old Done button). The helper line under them reads `"Grade now keeps you drawing. Submit locks in your best score; earlier means more speed points."`
  - **Not-started recipe:** a list with these four lines: `"Matches the prompt: up to 500"`, `"Easy to recognise: up to 400"`, `"Speed: up to 100"` and `"Auto-grades at 2, 4, 6 and 8 minutes · 3 manual grades · your best grade counts · Submit ends it"`.
  - **Exit:** an `"Exit"` button (`data-testid="daily-exit"`) in the playing header opens a confirm dialog (reuse the dialog primitive used by `src/components/game/DeleteRoomButton.tsx`). Title `"Leave the easel?"`, body `"Your 10 minutes keep running. Auto-grades still happen while this site is open, and you can come back any time before time runs out."`, buttons `"Keep painting"` and `"Exit"`. Exit navigates to `/party` for now; PR 3 retargets it to the porch.
  - `state.notice` shows as a transient inline notice for 6 s.

- [ ] **Step 1: Write the failing tests:** the label cases above (one `expect` each), plus offline: `exit confirm leaves to party` and `grade now and submit are separate` (clicking Grade now keeps status `playing`).
- [ ] **Step 2: Run** `npm run test:unit -- src/game/daily src/components/daily` and `npx playwright test tests/offline/daily.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(daily): auto-grade timeline, clear scoring, exit`.

### Task 6: Full verification and progress note

- [ ] **Step 1: Run** `npm run verify`. Expected: PASS (lint, tsc, unit, builds, prerender).
- [ ] **Step 2: Run** `npm run build && npx playwright test tests/offline`. Expected: PASS.
- [ ] **Step 3:** Append a dated entry to `docs/progress.md` (what changed, verification tails, provider line). Commit `docs: record daily fixes`.
