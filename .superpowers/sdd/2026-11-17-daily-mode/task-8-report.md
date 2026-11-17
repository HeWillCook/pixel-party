# Task 8 implementation report

## Implemented

- Added offline Playwright checks for signed-out `/home` (sign-in button, leaderboard, no active prompt), public
  `/u/offline-player` profile empty state, and `/party` lobby. Real-worker auth checks were added in the review fix below.
- Updated `docs/progress.md` with the 2026-11-17 daily-mode pivot decision, integrations as implemented, fake/local judge notes,
  the prompt-list future idea, and verification results.
- Rewrote `README.md` with daily mode first and party mode second, including the 0–1000 score breakdown and judge
  behavior. Updated `docs/current-status.md` with the current handoff and Will's remaining manual checks.
- No deployments, pushes, real model calls, or local judge helper runs.

## Tests

- `npm run build && npx playwright test --config tests/offline.playwright.config.ts`: build passed; initial Playwright run
  exposed an assertion serialization mistake (`Response` was returned from `page.evaluate`, yielding `undefined` for status).
  Changed the browser evaluation to return the numeric status directly, then reran the offline suite: **9/9 passed**
  (five existing plus four daily checks).
- `npx playwright test --config tests/playwright.config.ts tests/api.spec.ts`: **3/3 passed**, including the real test-worker
  `/api/__test/ready` response `{ code: "test_integration_disabled" }`.
- `npm run verify`: PASS — ESLint, TypeScript, 33 test files / 310 unit tests, Worker/client build, prerender. Tail recorded
  in `docs/progress.md`.
- `git diff --check`: PASS.

## TDD evidence

- No TDD cycle required by the task brief. The offline test initially failed on the browser-evaluation return shape; correcting
  it made the endpoint response check pass.

## Files changed

- `tests/offline/daily.spec.ts`
- `docs/progress.md`
- `docs/current-status.md`
- `README.md`
- `.superpowers/sdd/2026-11-17-daily-mode/task-8-report.md`

## Self-review

- Offline client tests intercept APIs and WebSockets; the actual test-worker integration-disabled readiness probe is separately
  covered by existing `tests/api.spec.ts` and was run successfully.
- Remaining hands-on checks are intentionally assigned to Will: sign-in and a full daily attempt on dev/live, plus any optional
  real-judge trial after explicit approval because it costs credits.
- No other concerns found.

## Provider

- Codex implementation and verification; no nested agents (per implementer contract).

## Review fix

- Removed the self-fulfilling route-stubbed 401 assertion from `tests/offline/daily.spec.ts`; the offline fixture now keeps
  only the routes needed to render the UI.
- Added real-worker API assertions in `tests/api.spec.ts`: unauthenticated `POST /api/daily/start` and `GET /api/daily/me`
  each return HTTP 401 with `{ error: "sign_in_required" }`.
- `npx playwright test --config tests/playwright.config.ts tests/api.spec.ts`: **4/4 passed**, including both daily auth
  guards and `/api/__test/ready` (`test_integration_disabled`).
- `npx playwright test --config tests/offline.playwright.config.ts`: **8/8 passed** (four daily UI checks plus four
  existing pixel checks).
- `npm run verify`: PASS — lint, type-check, **310 unit tests**, Worker/client build, and prerender. Build tail:
  `✓ built in 818ms; [prerender] wrote 1 page(s) [/], _spa.html, robots.txt, sitemap.xml.`
- No deployments, pushes, real model calls, or local judge helper runs.
