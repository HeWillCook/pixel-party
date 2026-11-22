<img src="assets/icon.svg" width="64" height="64" alt="">

# Pixle

Pixle is a daily solo pixel-art challenge, with the original live multiplayer party canvas available as a
second mode.

## Daily mode

Visit `/home`, sign in, and start today's challenge. Everyone gets the same prompt and a 32×32 canvas. Paint for up
to five minutes and submit whenever you're happy: Haiku judges the canvas at the halfway point (2:30) and gives the
final verdict when you submit, or automatically at 5:00. Two non-scoring Haiku peeks comment along the way. Your attempt appears on the daily leaderboard. The prompt is hidden from the public gallery until the
attempt ends and the day closes.

Each judgement totals up to 1000 points, and your **higher** judgement is your score:

- **Matches the prompt (0–500):** how much of the prompt (subject plus the asked detail) is drawn, weighted 60/40
  with how recognizable the blind guess found it. If the blind guess misses the subject entirely, the prompt score is
  capped at 30.
- **Art quality bonus (0–500):** pixel-art craft, paid in proportion to the prompt match, so a beautiful drawing of
  the wrong thing earns almost nothing.

There is no speed component. The painting shown on your profile and in the gallery is the **latest** canvas you had
(the one you submitted), while the guess and comment that travel with it come from the most recent judgement.

Daily mode requires sign-in to play; visitors who are signed out can still view the leaderboard and public profiles.
The server enforces one attempt per UTC day. Writing letters on the canvas doesn't count as drawing: a spelled
word sets recognition to 0. Today's paintings stay private until you finish your own attempt (the leaderboard and
friends' galleries then show them); scores are always visible. In development and tests, a deterministic
fake judge is used by default. Production uses DeepSpace's server-side `anthropic/chat-completion` integration. An
opt-in local `claude -p` helper is available for development only: run `npm run judge:local` and configure
`DAILY_JUDGE=local` for the local dev process. Do not use this mode for production.

## Party mode

Visit `/party` to host a room or join one from the open-games list (private rooms ask for their code). Players
click and drag to paint one shared 32×32 canvas while Haiku guesses live; there is no score, the round ends when
Haiku guesses the word. Spelled letters never count as a guess. Co-op is the only mode for now. Room actions are validated server-side and live room state is held by a Durable
Object.

## Development

Requires a supported Node.js version (see `package.json`). Install dependencies with `npm install`, then run
`npm run dev`. Run `npm run verify` for lint, type-check, unit tests, and build. Offline browser checks run after
building with `npx playwright test --config tests/offline.playwright.config.ts`.
