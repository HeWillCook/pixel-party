# Pixel Party redesign: merge and review fixes

Date: 2026-11-17. Branch: `t3/pixel-redesign-direction`.

## Outcome

Merged `origin/main` (`fb45ffd`) into redesign HEAD `f100412` with merge commit
`3fb7ba5` (two parents; no rebase). All eight review findings are addressed.
No push, deploy, PR, subagent, or reviewer was started. The lockfile did not
change relative to `f100412`, so the conditional `npm ci` was not necessary.

## Textual conflicts

| File | Resolution |
| --- | --- |
| `docs/progress.md` | Kept both redesign entries and main's lifecycle/routing investigation entries in date order. All conflicting entries are dated November 17. |
| `src/components/game/RoundBar.tsx` | Kept the centered redesigned round bar and Sunset styling; used main's `ROUND OVER` label. |
| `src/game/protocol.ts` | Kept main's terminal `closed` message alongside optional watcher counts on snapshots and player updates. |
| `src/pages/(app)/home.tsx` | Kept the redesigned cards and typography, main's host-only delete controls/deleted-room filtering, and main's four-character placeholder, uppercase normalization and legacy-compatible input ceiling. |
| `src/pages/(app)/r/[code].tsx` | Kept redesigned layout, players/watchers, guess log and sounds; retained main's terminal host-closed copy, delete button, start authorization, host-only live skip, and explicit New game controls/copy. |
| `tests/offline/pixel.spec.ts` | Retained main's direct/home-join/reload access checks, deletion/no-reconnect tests and explicit-start tests, plus redesign layout/audio/focus coverage. Updated the redesign next-button lookup to main's New game label. |

## Logical conflict audit

- Reducer: `closedByHost`, `connectError`, terminal authorization reset and snapshot
  loading coexist with `snapshotSeq`, `guessLog`, `guessLogRoundId` and `watching`.
  Same-round snapshots preserve the guess log and advance `snapshotSeq`; new rounds
  clear it. Terminal `closed` resets the board. Existing reducer tests cover these paths.
- Lifecycle/audio: closing or deleting resets/disconnects state rather than ending a
  normal playing round. Added explicit sound tests for HTTP-style closure and the
  terminal message, plus disconnected win/timeout/guess transitions. Roster/host absence
  creates no sound event; it only changes permission UI. No new sound kinds were added.
- Reconnect: `usePixelRoom` preserves state on disconnect/open; a socket opening alone
  is not a fresh snapshot. The countdown gate now stays blocked until `snapshotSeq`
  changes. The hook feeds the same gate both state transitions and timer checks, so
  a disconnect shorter than the 250 ms polling interval is not ignored by polling alone.
- Intermission: removed the redesign's automatic-next countdown copy. Both header and
  overlay use explicit New game and main's host-waiting copy. No server timer was changed.
- Permissions: header Skip Round is host-only for a live custom room. New game and
  lobby Start retain main's connected-player fallback when the host is absent and on
  `play`. Added non-host tests with the host present and absent; main's existing custom
  and public-board explicit-start tests remain intact.
- Offline DOM: kept all literal `data-testid` values found on either original side;
  programmatic union comparison reported `Missing literal test IDs: []`. Main's access
  tests retain their document-start insertion observers and reload assertions, unweakened.
- Screenshot protocol: the playing snapshot fixture now uses TypeScript `satisfies`
  against the merged snapshot message type. The offline helper has the corresponding
  typed return and explicit watcher count. Existing lifecycle fixtures remain compatible.
- Server/CI: main's routing rollback, lifecycle, room-code and CI behavior remains.
  Relative to main, the only server PixelRoom changes remain the redesign's watcher
  count additions. Judge, scoring, game palette/config and AI budget files have no
  delta from main. Offline e2e remains wired into CI.

## Eight review fixes and coverage

1. **Mobile results:** split the results card into a shrinking, independently scrollable
   content body and a non-scrolling footer. Container queries compact narrow-board
   padding/headings and hide the decorative icon. Contributors scroll above the footer.
   Always-running offline tests at **375×812 and 1280×720** measure both View Canvas
   and New game before clicking: every edge must be inside both viewport and canvas,
   without `scrollIntoView`. Both controls remain functional.
2. **Reconnect countdown:** a disconnected/unloaded state arms `awaitingSnapshot`;
   repeated connected checks with the stale sequence remain silent. A fresh snapshot
   resets the baseline before subsequent second changes can tick.
   Covered by `waits across repeated reconnect intervals until a fresh snapshot arrives`
   in `src/game/sound-events.test.ts`.
3. **Disconnected sound events:** `soundEventsFor` returns no events when the next
   state is disconnected or terminal, and also silences the reconnect edge from a
   disconnected previous state. Covered by `silences every event when disconnected,
   closing, or deleted`, including guess, win, timeout and both closure paths.
4. **Room-code copy:** main already supplies `Enter 4-char code`; retained it and the
   64-character ceiling needed for legacy links/codes. Landing copy contains no stale
   code-length claim; the public board still uses `play`. Offline home assertions pin
   the placeholder and ceiling; main's lowercase home-join test verifies normalization.
5. **Cleanup:** removed the unused RoundBar `roomName` prop and call-site argument.
   Named the 24-pixel budget `CANVAS_BOTTOM_CHROME_PX`, with the requested explanation
   of the canvas/palette gap, frame shadow and bottom padding. TypeScript, existing
   banner-aware sizing coverage and screenshot dimensions validate the cleanup.
6. **Scroll-aware sizing:** top offset includes document `window.scrollY` and the actual
   room `main` scroll container's `scrollTop`. Added a desktop offline regression that
   scrolls `main` 100 px, triggers measurement, and verifies unchanged canvas dimensions.
7. **Focus-test independence:** the swatch test uses one Shift keyboard press followed
   by direct `.focus()`, with no dependency on the number/order of tabbable controls.
8. **Visible focus:** nav links, `.pp-logo` links and home visibility toggles use the
   palette's `3px solid var(--sunset-1)` outline at 2 px offset. Removed the toggles'
   outline suppression. An offline test directly focuses each visible nav/logo link
   and both toggles and asserts width, style, color and offset.

## Design consistency

- Delete-room trigger and Cancel use `.pp-chip`; End room uses `.pp-btn`. The existing
  shared `.pp-panel` dialog already supplies square corners, VT323 and Sunset title
  styling. Deletion coverage now also asserts the panel/button classes and square edges.
- Public-room cards retain the host action outside the navigation link. At mobile sizes,
  the action gets its own row so the room name remains readable; desktop remains inline.
  Screenshot coverage asserts the mobile title is not truncated. Restored shared focus
  styling for the nested room-card link after moving `.pp-panel` to its container.
- The selected palette inset now references `var(--sunset-1)` instead of a duplicate
  literal hex value. No changes to `PALETTE` or the root font size.
- Visual inspection caught an entering-dialog animation in the first capture; the
  final dialog screenshot disables/fast-forwards animations for a settled render.
- Compared all 13 captures against the reference HTML's VT323, Navy glow, Sunset logo
  and frame gradients, pink square panels and hard shadows. Checked desktop/mobile
  room, results, lobby, home, landing and delete dialog. No in-scope visual issue remains.

Required scan:

```text
$ rg -n "amber-|rose-|emerald-|rounded-(sm|md|lg|xl|full)|font-(bold|extrabold|semibold)" src --glob '*.tsx'
src/components/ui/Avatar.tsx:19:        'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted',
src/components/ui/Avatar.tsx:43:        'flex h-full w-full items-center justify-center rounded-full text-sm font-medium text-muted-foreground',
```

Only permitted round avatars remain. A separate literal-hex scan now finds only
React error-number examples in comments, not color declarations in TSX.

## Verification evidence

Red/green: sound regression run failed with two expected failures (a stale reconnect
tick and disconnected win event) before the implementation; all 11 sound tests now pass.
The mobile footer regression failed at a control bottom of 704 px versus canvas bottom
585 px; focus failed at a default 1 px outline versus the required 3 px. The scroll
fixture was corrected to exercise the real `main` scroller, then reproduced unwanted
canvas growth from 480 px to 576 px before the fix. All corrected regressions pass.

Final commands all exited **0**, run after the final source/test edits:

```text
$ npm run verify
> npm run lint && npm run type-check && npm run test:unit && npm run build
> eslint .
> tsc --noEmit
Test Files  24 passed (24)
     Tests  263 passed (263)
✓ built in 790ms
[prerender] wrote 1 page(s) [/], _spa.html, robots.txt, sitemap.xml

$ npx playwright test -c tests/offline.playwright.config.ts
1280x720 banner-case metrics: {"canvasWidth":384,"canvasBottom":637,"paletteBottom":683}
✓ banner-aware canvas sizing keeps palette inside 1280x720 with spectator banner and reject notice, and renders room name
1 skipped
19 passed (4.5s)

$ npm run build && SCREENSHOTS=1 npx playwright test -c tests/offline.playwright.config.ts screenshots
1440x900 metrics: {"canvasWidth":672,"canvasHeight":672,"canvasBottom":823,"paletteBottom":869,"askBottom":253.75,"vh":900,"mainScrollHeight":851,"mainClientHeight":851}
1280x720 metrics: {"canvasWidth":480,"canvasHeight":480,"canvasBottom":631,"paletteBottom":677,"askBottom":253.75}
375x812 metrics: {"canvasWidth":320,"docScrollWidth":375,"bodyScrollWidth":375}
✓ capture playing room, lobby, overlay, landing, and home screenshots
1 passed (2.7s)
```

The single ordinary-suite skip is the explicitly gated screenshot capture; both
mobile/desktop action-visibility regressions run normally without `SCREENSHOTS=1`.
`git diff --check` passes. No merge conflict markers remain.

## Screenshot list

All files are in `docs/superpowers/screenshots/2026-11-17-redesign/`, refreshed by the
explicit screenshot run and individually inspected:

- `room-playing-1440x900.png`
- `room-playing-1280x720.png`
- `room-playing-375x812.png`
- `room-overlay-1440x900.png`
- `room-overlay-1280x720.png` (added)
- `room-overlay-375x812.png`
- `delete-room-confirm-1440x900.png` (added)
- `room-lobby-1440x900.png`
- `landing-1440x900.png`
- `landing-375x812.png`
- `home-1440x900.png`
- `home-375x812.png`
- `home-controls-375x812.png` (added; scrolled view of host action, create/join controls)

## Concerns and limits

- No unresolved in-scope merge, behavior or design finding.
- Node emits nonblocking experimental localStorage warnings in unit tests; Playwright
  emits the existing NO_COLOR/FORCE_COLOR warning. Both complete successfully.
- Validation is local/offline; no live integrations or authenticated production flows
  were exercised. Main's previously unresolved production-only private-room flash
  investigation remains documented as unproven; this work does not claim to fix it.
- The report is explicitly tracked despite `.superpowers/` being ignored, so the
  implementation record survives checkout handoff.

Provider: Codex performed the merge, implementation, visual inspection and verification;
no subagents or reviewers were spawned, as requested.
