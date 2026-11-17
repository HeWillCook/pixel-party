# Current status

## Handoff (2026-11-17)

**Goal:** Pixel Party, Will's DeepSpace build-exercise submission: a daily solo pixel-art challenge with the
multiplayer party canvas as a secondary mode. The app is live at https://pixel-party.app.space; the repository is
`HeWillCook/pixel-party`.

**Where things are:** Daily mode is the main feature and is implemented across prompt/rules, the server-side judge,
referee Durable Object, service/routes, daily close cron, client attempt flow, leaderboard, and profiles. Party mode
remains available at `/party`. The build is on branch `t3/daily-pixel-art-game`; no deploy or push was performed for
this task.

**Done:**
- A signed-in player gets one 10-minute daily attempt, can paint, request grades, reload and restore the attempt,
  finish early, and see their best grade retained. Every attempt is ranked; the public leaderboard and user gallery
  are readable without signing in.
- Scoring totals 0–1000 from fit×5, recognition×4, and speed. The default development/test judge is fake; production
  uses the server-side DeepSpace Anthropic integration. An opt-in local `claude -p` helper is dev-only.
- Party-mode routes and lobby remain available. Daily integration choices and verification are logged in
  `docs/progress.md`; design/spec details remain under `docs/superpowers/`.

**Remaining hands-on checks for Will:**
- Sign in on dev and live, then play a full daily attempt: Start → paint → Ask now → reload and confirm the canvas
  restores → Done → confirm best grade → check leaderboard and profile.
- Optional real-judge check, either through the local helper or live: this costs credits. Do not run it without
  Will's go-ahead.

**Verification:** See the Task 8 row in `docs/progress.md`; it records the final build, offline Playwright, and
`npm run verify` results. The offline suite verifies signed-out `/home`, `/u/<id>`, and `/party`, plus the
unauthenticated daily-start response. The existing API readiness test checks `/api/__test/ready` in the test worker.

**Constraints:** Do not run `deepspace push`, `deepspace deploy`, `app undeploy`, `app transfer`, or
`app collaborators` unless separately requested. Never set `DAILY_JUDGE` or run the local judge helper against a
request without Will's approval. Secrets belong only in `npx deepspace secrets`.
