# Daily mode final-review fixes

## Status and scope

DONE. Fixed I1–I5, M3, and M13 on `t3/daily-pixel-art-game`, based on `73c99fd`.
Other minors were deliberately left alone. No deployment, remote push, real AI call,
local-judge helper invocation, dependency change, or `DAILY_JUDGE` override.

## Findings and covering tests

### I1 — delayed writes cannot replace the current best

- The DO row now persists the complete winning grade, its exact cells, and the
  player's display profile. Collection writes no longer take a request's captured grade.
- `DailyRoom` owns a per-player/day publication mutex. Each publisher reads the
  current row after acquiring that mutex, then writes both projections in order.
  Waiting requests remain ordinary awaited requests, not background/durable jobs.
- `daily-final-regressions.test.ts`: `I1 serializes delayed projection writes using
  the current authoritative best` holds the first score update, accepts a newer
  better grade, releases the old write, and checks that both collections retain 997
  and the winning cells/reason/parts.
- `daily-room.test.ts`: `publishes the durable winning snapshot through an ordered
  current-best writer` runs against both memory and the actual DailyRoom HTTP/SQL
  handler. It holds a projection write while a better result commits, then checks
  the persisted full winner and both records.

### I2 — recoverable projections retain the original winning image

- Start, accepted grades (including later lower grades), end, and state reads
  republish the DO's current best. State reads can also repair yesterday's ended
  or expired row without resuming it. Repair needs no new model call.
- A failed score write or a failure between score/drawing writes leaves the full
  winner in the DO. The next successful publication writes the same full winner.
  Publication failure does not poison the mutex for the next request.
- The publisher supplies `medal: 0` and `visibility: private` only when creating a
  missing record; repair never resets existing medals or public visibility.
- `daily-final-regressions.test.ts`: both `I2 repairs a failed %s projection on a
  later lower grade` cases (`dailyScores`, `dailyDrawings`), plus all three
  `I2 repairs the durable winner on %s without regrading` cases (`state`, `end`,
  `start`). Assertions include the winning image, score, reason, and elapsed time.

### I3 — start-day identity and cross-midnight resume

- `/me` resumes a live yesterday attempt through its final-grace boundary, even
  if today's row also exists; otherwise it returns today's state. `/start` still
  explicitly starts/resumes today, so finishing yesterday never consumes today.
- Grade/end HTTP bodies require `day`. Ownership comes from verified auth, and
  the server permits only today, or yesterday while that user's attempt is live.
  Invalid day grades reject without judging; invalid day end requests return 400.
- The hook captures and sends its attempt day. Idle/ended pages refetch `/me`
  across UTC midnight, while live attempts stay on their original day. Day changes
  reset results/scheduling and clear the canvas when no saved drawing exists.
- Today's drawing permission remains based on today's ended row, not yesterday's.
- `daily-final-regressions.test.ts`: `I3 resumes yesterday after midnight and binds
  old tabs when both days exist`; `I3 resumes only through yesterday's grace window,
  not an expired row`.
- `daily-routes.test.ts`: required-day cases and `I3 routes yesterday and today
  independently and rejects invalid or expired days`. These check actual worker
  route parsing, both rows, start-day elapsed time, and invalid/ended/older/future days.
- `final-client-regressions.test.ts`: day-change result/scheduler reset and rollover
  refresh decisions for playing versus ended/unstarted states. The previous service
  midnight test now asserts resume rather than the incorrect today-only contract.
- Amended Task 4's API/day-selection plan to match these contracts.

### I4 — party mode observes dev/test fake mode

- Both judge entry points use `configuredJudgeMode()`. PixelRoom returns a canned
  guess whenever the configured mode is not `real`, before any integration call.
  Its existing real-mode integration, budget, timeout, and persistence path remains.
- `pixel-room.test.ts`: `I4 never calls a paid integration for party judging in
  normal dev fake mode`, explicitly with the special test guard off, starts an
  eligible signed-in party Ask and verifies zero integration calls.
- `daily-judge.test.ts`: `I4 shares the build-time fake mode with party judging by
  default` verifies the actual Vitest build-time selection. Existing party real-path
  tests select the real branch through a mocked mode function and keep every
  integration mocked; they do not enable real upstream access.

### I5 — stale completion is a rejected grade

- Completion now returns `applied: false` for a mismatched reservation. The service
  returns `ok: false, reason: stale` without a `grade`; clients never treat that
  computed result as an accepted/latest grade.
- The reducer takes the server's accepted best instead of taking the maximum of
  the computed grade and that best. A rejected response uses its authoritative state.
- The reservation lifetime is five minutes, longer than four bounded 60-second
  local judge calls plus the four bounded budget reservations. Every model phase
  and retry checks reservation ownership before and after budget reservation.
- `daily-final-regressions.test.ts`: stale high-score completion after a replacement,
  with service-response/reducer assertions; four-call bounded local retry sequence.
- `final-client-regressions.test.ts`: a computed/client 999 cannot override the
  accepted server best of 359.
- Existing service stale-success/failure tests now assert explicit stale rejection,
  no subsequent scoring phase after losing ownership, and preservation of a live
  replacement reservation; pure-rule and DO tests assert `applied: false` too.

### M3 — ended snapshots are immutable

- `endAttempt` returns an already-ended row unchanged, including its saved cells.
  Previous-day selection no longer falls back to ended/expired attempts; explicit
  mutation of those yesterday attempts is refused.
- `daily-final-regressions.test.ts`: `M3 freezes an ended ungraded snapshot,
  including after public publication` checks repeated end, next-day implicit end,
  explicit old-day rejection, and state-read repair. Neither the original public
  image nor its visibility/medal changes. Pure end-rule coverage was updated too.

### M13 — the first zero-point result is a real winning snapshot

- A missing accepted best is identified by `bestElapsedMs === null`, not by a
  numeric comparison to the initial zero sentinel. The first valid zero persists
  its cells, guess, reason, parts, and elapsed time; later equal results still do
  not replace an accepted best.
- `daily-final-regressions.test.ts`: `M13 retains the first valid zero-point grade
  and its full snapshot` grades at 10:00, ends with different cells, and checks
  that the gallery retains the graded zero-point image/guess/reason and 600000 ms.

## TDD evidence

- RED: `npx vitest run src/server/daily-final-regressions.test.ts` — **10 failed**
  before implementation: delayed writes regressed the records; repair left zero
  projections; midnight `/me` lost the live attempt; repeated end replaced cells;
  zero best retained elapsed time 0; stale completion returned `ok: true`.
- RED: `npx vitest run src/server/pixel-room.test.ts -t 'I4'` — **1 failed** before
  implementation: the integration spy was called once under normal fake/dev mode.
- RED: `npx vitest run src/game/daily/final-client-regressions.test.ts` — **3 failed**
  before client implementation: missing rollover predicate, retained previous-day
  result, and computed/client best overriding the referee.
- GREEN: focused final run below — **149 passed**. Two earlier focused failures
  were expected obsolete assertions for client `max` and `judge_resting` on stale
  failure; updated to the reviewed authoritative-best/stale contracts and reran.

## Final verification

All commands completed successfully on November 17, 2026:

| Command | Result |
| --- | --- |
| `npx vitest run src/game/daily src/server/daily*.test.ts src/server/pixel-room.test.ts` | 14 files, **149/149 tests passed** |
| `npm run verify` | ESLint, TypeScript, **35 files / 333 unit tests**, Worker/client build, prerender passed |
| `npm run build && npx playwright test --config tests/offline.playwright.config.ts` | Build passed; **8/8 Playwright tests passed** |
| `npx playwright test --config tests/playwright.config.ts tests/api.spec.ts` | **4/4 passed**, including real test-worker auth guards and integration-disabled readiness |
| `git diff --check` | Passed |

Verify tail: `Test Files 35 passed (35); Tests 333 passed (333); ✓ built in 872ms;
[prerender] wrote 1 page(s) [/], _spa.html, robots.txt, sitemap.xml.`

No test failures or application errors remain. Output retains the already-known
Node experimental-localStorage warnings and Playwright NO_COLOR/FORCE_COLOR
warnings; these were not suppressed or fixed (M5 remains deferred).

## Files changed

- Authority/projection: `src/game/config.ts`, `src/game/daily/attempt.ts`,
  `src/server/daily-room.ts`, new `src/server/daily-records.ts`,
  `src/server/daily-service.ts`.
- API/client: `src/server/daily-routes.ts`, `src/hooks/useDailyAttempt.ts`,
  `src/game/daily/client-schedule.ts`.
- Judge selection: `src/server/daily-judge.ts`, `src/server/pixel-room.ts`.
- New regressions: `src/server/daily-final-regressions.test.ts`,
  `src/game/daily/final-client-regressions.test.ts`.
- Updated tests: `src/game/daily/attempt.test.ts`,
  `src/game/daily/client-schedule.test.ts`, `src/server/daily-room.test.ts`,
  `src/server/daily-service.test.ts`, `src/server/daily-routes.test.ts`,
  `src/server/daily-judge.test.ts`, `src/server/pixel-room.test.ts`.
- Documentation: `docs/superpowers/plans/2026-11-17-daily-mode.md`,
  `docs/progress.md`, this report.

## Self-review and limitations

- Read the source/test diff. Confirmed ordered fresh-row publication, mutex recovery
  after errors, persistence before projection, start-day ownership checks, separate
  current-day spoiler access, frozen ended cells, first-zero handling, and production
  party behavior. No unrelated minor fixes or scope changes were made.
- Collection projections are repaired on subsequent requests, deliberately not by
  background queues. Both records converge to the same persisted winning snapshot;
  an upstream failure can temporarily interrupt publication between them.
- Offline browser tests use intercepted traffic; API Playwright checks the real
  guarded test worker. No signed-in live attempt, real Haiku quality/latency test,
  deployment, or remote push is claimed. No remaining correctness concern identified.

Provider: Codex implemented, self-reviewed, tested, and committed these fixes;
no nested agents were dispatched, per the implementation-subagent contract.
