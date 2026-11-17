# Daily-mode merge, redesign, and stale-tab fix

Date: 2026-11-17 (America/New_York). Branch: `t3/daily-pixel-art-game`.
Status: COMPLETE. All requested verification commands passed; no product decisions were needed.

## Commits

- `6bbc9e9` — merge: integrate main pixel redesign with daily and party routes
- `67b72df` — feat(daily): apply synthwave redesign to daily mode
- `27881be` — fix(daily): stale-tab end targets its own day; shorter grade lease
- This report, progress entry, and refreshed not-started screenshots are saved in the final documentation commit.

## Merge and conflict resolution

Ran `git fetch origin && git merge origin/main`. The merge parents are the original daily head
`ba2c20652bcdd9183e1ae0994605cb774652b52f` and main
`d8ad9ec9eb50262c1dfb3a31becc6d15610331ab`.

1. **src/pages/(app)/home.tsx:** retained daily mode at /home. Copied main's complete redesigned lobby into
   src/pages/(app)/party.tsx, changing only its component name to PartyPage. A final no-index comparison proves
   the party file otherwise matches main's lobby exactly.
2. **src/pages/(app)/r/[code].tsx:** accepted main's complete room redesign, then reapplied all five /home → /party
   back links. The pre-merge diff from fb3e1a6 showed these were this branch's only room changes. The final diff
   against main contains only those five link changes.
3. **src/pages/index.tsx:** retained main's redesigned layout, tokens, logo, frame and buttons; reapplied the daily-first
   navigation (/home daily, /party co-op), hero, daily scene example, score breakdown and feature copy. Removed the
   obsolete third party-guess chip from the daily example.
4. **package.json:** kept both @fontsource/vt323 from main and @types/node from daily. The lockfile auto-merged;
   npm ci succeeded against it without rewriting it.
5. **docs/progress.md:** retained both branches' additions, including the earlier daily final-review notes and main's
   redesign and room/privacy/hardening history. Added a new progress entry after final verification.

No push, deployment, authority changes, new branch, secrets change, DAILY_JUDGE override, local judge helper,
or real AI request was performed. The API test server used the existing guarded test configuration.

## Daily design implementation

- Replaced old arcade-card/arcade-btn, rounded surfaces, fake-bold VT323, tiny labels, old amber/pink/green classes
  and old hardcoded backgrounds with pp-panel, pp-chip, pp-btn, pp-frame and shared sunset/theme tokens.
- Restyled **every home state**: signed out, not started, playing and ended. The prompt uses pp-word and a larger
  timer; Ask/Start/Done use the synthwave buttons. The mute control remains visible even before starting.
- The daily canvas uses PixelCanvas's shared boardCellSize helper via measured available width/height. ResizeObserver
  accounts for the board slot, main scroll position and palette height. The canvas is centered within its flexible
  column, remains crisp at multiples of 32px, and caps at 768px. Captures prove at least 576px on a 1440×900 screen,
  a fitting canvas/palette on 1280×720, and no document-width overflow at 375px.
- Restyled Leaderboard dates, ranks, names, medals and thumbnails; added explicit keyboard focus for player links.
- Restyled GradePanel errors, guesses, reasons, best score and readable two-column score breakdown.
- Restyled DailyTimer, PixelThumb (including unavailable fallback) and public profile/gallery cards, with shared
  gradient thumbnail frames and a keyboard-focusable daily link.
- Added a daily sound gate and hook using main's createSfx and shared persisted mute key: live grade blip, last-five
  countdown ticks, completion jingle for a scored attempt, and time-up tone for a zero-score attempt. No sound on
  initial load, repeated grades, a new day, stale recovery, painting or ambient/background events. Audio unlocks
  only after pointer/key interaction. Existing sfx tests cover mute and audio implementation; five daily sound
  tests cover the event gate.
- Updated existing offline lobby navigation checks and the screenshot capture from /home to /party.
- Added capture coverage for signed-out daily, not-started, playing, ended and populated public profile views at
  1440×900, 1280×720 and 375×812. All network/WebSocket traffic for these captures is intercepted locally.

## Stale-tab bug and regression coverage

**Root cause:** gradeDaily returned an invented current-day/not_started state for an invalid yesterday request;
then the client adopted its day and finishAttempt read that mutable day when posting /end. It could therefore
end today's actual attempt or force a fabricated ended/0 result.

**Fix:**

- Invalid-day grade responses now describe only the **requested day** and that day's actual stored row.
- The client treats invalid_day (or any cross-day grade response) as a locked, stale attempt. It does not merge the
  response state; it stops drawing/asking/finalizing and immediately reloads /api/daily/me. Failed refreshes keep
  the stale UI locked and retry through the existing ticker, rather than sending /end.
- finishAttempt captures its original day before any awaited work. sendEnd accepts that explicit day and checks
  the current day/stale flag before and after async boundaries. A pending finish cannot follow a refreshed day.
- /end invalid_attempt_day responses also lock and refresh rather than retrying a stale end. Valid /end responses
  are no longer forcibly relabeled ended. Recovery resets the frozen snapshot/finalizing refs so today's real
  attempt can paint/ask again.
- Server /end already validates the requested body day and rejects expired/invalid days before store.end; that
  invariant is retained and tested directly, including proving today's attempt is unchanged and store.end was
  never called for a rejected yesterday. No server fallback to today's attempt is introduced.
- Reduced DAILY.inFlightStaleMs from 300,000ms to **90,000ms**. The boundary test proves busy through 89,999ms,
  recovery exactly at 90,000ms with refunded reservation accounting, and an 80,000ms four-call production retry
  sequence still inside the lease. Existing ownership/stale-completion tests remain passing.

**Tests added/extended:**

- src/game/daily/final-client-regressions.test.ts: invalid-day reducer cannot adopt a fabricated today, keeps the
  old result, locks, refreshes, then clears stale state on authoritative load.
- src/game/daily/attempt.test.ts: exact 90-second crash recovery and 80-second production budget.
- src/server/daily-final-regressions.test.ts: expired yesterday + today's real attempt; requested-day response,
  no judge, no store.end, today's row untouched; production retry timing.
- src/server/daily-routes.test.ts: invalid day is retained in grade responses and rejected ends leave today playing.
- tests/offline/daily.spec.ts: eight real-client browser regressions (invalid /grade and invalid /end, each recovering
  to today not_started/playing/ended or a failed refresh). These assert no cross-day /end, no fabricated complete/0,
  locked stale controls, correct original-day request bodies, and painting restored on today's real attempt.

**Red/green evidence:** three new unit regressions failed on the original behavior (3 failed / 23 passed), then
passed after the fix (26/26 focused tests). The browser regression initially exposed a fixture-loading race; after
making initial /me responses stable until rejection, all four invalid-grade cases failed on the original built
client because no recovery read occurred. After rebuilding the fixed client, the cases passed. Expanded coverage
for the /end rejection path also passes (11/11 daily offline tests including existing UI checks).

## Verification (all exit 0)

### npm run verify

Lint and TypeScript passed, **39 test files / 383 unit tests** passed, then Worker/client build and prerender passed.

```text
 Test Files  39 passed (39)
      Tests  383 passed (383)
   Duration  1.47s (transform 973ms, setup 0ms, import 6.32s, tests 1.08s, environment 2ms)
dist/client/assets/dist-81Rc0mqx.js                             90.87 kB │ gzip:  30.81 kB
dist/client/assets/index-CiVOCa2X.js                           498.50 kB │ gzip: 160.52 kB

✓ built in 857ms
[prerender] wrote 1 page(s) [/], _spa.html, robots.txt, sitemap.xml
```

### npm run build && SCREENSHOTS=1 npx playwright test --config tests/offline.playwright.config.ts

SCREENSHOTS=1 enables main's normally skipped screenshot spec; **all 38 tests ran and passed**, none skipped.

```text
dist/client/assets/index-CiVOCa2X.js                           498.50 kB │ gzip: 160.52 kB

✓ built in 850ms
[prerender] wrote 1 page(s) [/], _spa.html, robots.txt, sitemap.xml
  ✓  37 tests/offline/pixel.spec.ts:477:3 › non-host cannot skip a live round and can start results when host is absent (139ms)
1280x720 banner-case metrics: {"canvasWidth":384,"canvasBottom":637,"paletteBottom":683}
  ✓  38 tests/offline/pixel.spec.ts:507:1 › banner-aware canvas sizing keeps palette inside 1280x720 with spectator banner and reject notice, and renders room name (109ms)

  38 passed (5.5s)
```

### npx playwright test --config tests/playwright.config.ts tests/api.spec.ts

Used the exact API-suite invocation from task-8-report.md: **4/4 passed**. This exercises a real local Worker,
including integration-disabled readiness and unauthenticated daily-route guards, not stubbed API assertions.

```text
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  1 tests/api.spec.ts:4:3 › API tests › test worker blocks paid integrations (100ms)
  ✓  2 tests/api.spec.ts:9:3 › API tests › daily routes reject unauthenticated requests (42ms)
  ✓  3 tests/api.spec.ts:18:3 › API tests › auth proxy forwards to auth worker (61ms)
  ✓  4 tests/api.spec.ts:23:3 › API tests › WebSocket endpoint exists (590ms)
[WebServer] [RecordRoom] webSocketClose code=1001 reason=

  4 passed (4.5s)
```

### Other checks

- npm ci: succeeded (502 installed / 509 audited); package lock unchanged.
- git diff --check: passed before each implementation commit and final report handoff.
- No new rounded surfaces, font-bold/font-extrabold, amber classes, or old hardcoded hex colors remain in swept daily files.
- Main's room diff contains only the five intended /party links; party lobby matches main aside from its function name.

## Screenshot evidence and visual inspection

Directory: `docs/superpowers/screenshots/2026-11-17-redesign/` (committed).

| View | 1440×900 | 1280×720 | 375×812 |
| --- | --- | --- | --- |
| Signed out | daily-signed-out-1440x900.png | daily-signed-out-1280x720.png | daily-signed-out-375x812.png |
| Not started | daily-not_started-1440x900.png | daily-not_started-1280x720.png | daily-not_started-375x812.png |
| Playing | daily-playing-1440x900.png | daily-playing-1280x720.png | daily-playing-375x812.png |
| Ended | daily-ended-1440x900.png | daily-ended-1280x720.png | daily-ended-375x812.png |
| Public profile | daily-profile-1440x900.png | daily-profile-1280x720.png | daily-profile-375x812.png |

Landing screenshots and party-1440x900.png, party-375x812.png, party-controls-375x812.png are also committed.
Unrelated room screenshot churn from rerunning main's capture spec was discarded.

Opened the generated daily PNGs for visual inspection, covering signed-out desktop, not-started mobile,
playing desktop/mobile and short desktop, ended desktop, and profile desktop/mobile. The actual rendered pages
use the reference's VT323, navy glow, square pink panels, sunset gradient frames/buttons, and crisp canvas.
The mobile not-started Start button is visible without a page-length gate; playing/mobile has a normal vertically
scrolling verdict/controls below the canvas. The 1280×720 playing capture keeps the palette visible. Screenshot
assertions verify the no-horizontal-overflow and desktop canvas-size requirements.

## Concerns / intentionally unchanged

- Production judging uses 20-second per-call timeouts; four calls total ~80 seconds, fitting the new 90-second lease.
  The pre-existing **dev-only local judge** still has a 60-second per-call timeout. A slow local-helper grade can
  therefore be superseded at 90 seconds; existing ownership checks prevent a superseded completion from winning.
  Its timeout was deliberately not changed as an unrelated dev-mode behavior change; no local helper was run.
- npm ci reports **17 dependency advisories (1 low, 16 high)** and an unapproved fsevents install-script warning.
  No audit fixes or dependency upgrades were attempted. Verification also retains existing Node localStorage and
  NO_COLOR/FORCE_COLOR warnings; none failed a command.
- Live sign-in/full attempts and real-judge tests remain unrun intentionally, per the no-real-AI/no-deploy brief.

## Provider

Codex performed implementation, self-review, screenshots and verification. No nested agents were started,
consistent with the implementation-sub-agent contract.
