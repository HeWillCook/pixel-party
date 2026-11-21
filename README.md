<img src="assets/icon.svg" width="64" height="64" alt="">

# Pixle

Pixle is a daily solo pixel-art challenge, with the original live multiplayer party canvas available as a
second mode.

## Daily mode

Visit `/home`, sign in, and start today's challenge. Everyone gets the same prompt and a 32×32 canvas. Paint for the
full five minutes: Haiku judges the canvas at the halfway point (2:30) and delivers the final verdict at 5:00, both
automatically. Your attempt appears on the daily leaderboard. The prompt is hidden from the public gallery until the
attempt ends and the day closes.

Each judgement totals up to 1000 points, and your **higher** judgement is your score:

- **Matches the prompt (0–500):** how much of the prompt (subject plus the asked detail) is drawn, weighted 60/40
  with how recognizable the blind guess found it. If the blind guess misses the subject entirely, the prompt score is
  capped at 30.
- **Art quality bonus (0–500):** pixel-art craft, paid in proportion to the prompt match, so a beautiful drawing of
  the wrong thing earns almost nothing.

There is no speed component. The painting shown on your profile and in the gallery is the **latest** canvas you had
(the one you had at 5:00), while the guess and comment that travel with it come from the most recent judgement.

Daily mode requires sign-in to play; visitors who are signed out can still view the leaderboard and public profiles.
The server enforces one attempt per UTC day and refuses any early finish. In development and tests, a deterministic
fake judge is used by default. Production uses DeepSpace's server-side `anthropic/chat-completion` integration. An
opt-in local `claude -p` helper is available for development only: run `npm run judge:local` and configure
`DAILY_JUDGE=local` for the local dev process. Do not use this mode for production.

## Party mode

Visit `/party` to join the always-on public co-op board or create/join a room with friends. Players draw together
on a shared 32×32 canvas while the AI makes live guesses. Private rooms use a short invite code; a host starts a
round when the group is ready. Room actions are validated server-side and live room state is held by a Durable
Object.

## Development

Requires a supported Node.js version (see `package.json`). Install dependencies with `npm install`, then run
`npm run dev`. Run `npm run verify` for lint, type-check, unit tests, and build. Offline browser checks run after
building with `npx playwright test --config tests/offline.playwright.config.ts`.
