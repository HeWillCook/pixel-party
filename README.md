<img src="assets/icon.svg" width="64" height="64" alt="">

# Pixel Party

Pixel Party is a daily solo pixel-art challenge, with the original live multiplayer party canvas available as a
second mode.

## Daily mode

Visit `/home`, sign in, and start today's challenge. Everyone gets the same prompt and a 32×32 canvas. Paint for up
to 5 minutes; the app grades automatically at minutes 1 to 4, you can use up to three **Ask now** grades, and the
attempt ends with a final grade. Choose **Done** to finish early. Your attempt appears on the daily leaderboard, while your best grade and matching
drawing are retained for your profile. The prompt is hidden from the public gallery until the attempt ends and the
day closes.

Grades total up to 1000 points:

- **Fit (0–500):** how well the drawing matches the prompt, multiplied by 5.
- **Recognition (0–400):** whether the blind judge recognized the prompt subject, multiplied by 4.
- **Speed (0–100):** `round(100 × (1 − elapsed time / 300 seconds))` at the best grade.

Daily mode requires sign-in to play; visitors who are signed out can still view the leaderboard and public profiles.
The server enforces one attempt per UTC day and grade limits. In development and tests, a deterministic fake judge is
used by default. Production uses DeepSpace's server-side `anthropic/chat-completion` integration. An opt-in local
`claude -p` helper is available for development only: run `npm run judge:local` and configure `DAILY_JUDGE=local`
for the local dev process. Do not use this mode for production.

## Party mode

Visit `/party` to join the always-on public co-op board or create/join a room with friends. Players draw together
on a shared 32×32 canvas while the AI makes live guesses. Private rooms use a short invite code; a host starts a
round when the group is ready. Room actions are validated server-side and live room state is held by a Durable
Object.

## Development

Requires a supported Node.js version (see `package.json`). Install dependencies with `npm install`, then run
`npm run dev`. Run `npm run verify` for lint, type-check, unit tests, and build. Offline browser checks run after
building with `npx playwright test --config tests/offline.playwright.config.ts`.
