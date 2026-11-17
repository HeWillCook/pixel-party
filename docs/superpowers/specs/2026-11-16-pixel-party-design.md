# Pixel Party: design

Status: approved 2026-11-16 (builder check done) · 2026-11-16 · Repo: github.com/HeWillCook/pixel-party (public)
Running log of how we got here: `docs/progress.md`.

## 1. Intent

Pixel Party is a multiplayer pixel canvas where people draw together and an AI judges what they made.
It is the submission for the DeepSpace build exercise, so it must be small, finished, deployed, and
explainable in a live interview. The reviewers value scope judgment, a working core path, real use of
DeepSpace primitives, and an honest writeup over feature count.

Why this idea: a shared live canvas is exactly what DeepSpace's Durable Objects and realtime sync are
built for, nothing similar exists among the 37 official examples, and an AI judge running in the
background gives the canvas a goal, which turns a toy into a game.

## 2. Goals, non-goals, anti-goals

**Goals (must ship)**
- Co-op mode works end to end on the live URL: join a room, place pixels, see others' pixels and
  cursors live, watch the AI's guesses update, win when it guesses the word, see the score.
- Every pixel placement is validated server-side (membership, round state, bounds, palette, cooldown).
- The AI judge runs server-side through the DeepSpace integration proxy, with spend bounded.
- Rooms: an always-on default public co-op board, plus rooms anyone signed in can create and share by link.
- A reviewer visiting alone can play a full co-op round.

**Should ship (if co-op is solid by end of day 3)**
- Team mode: two teams, two zones, same prompt, anyone can paint anywhere (sabotage), AI judges each zone at round end.
- Round replay built from judge-tick snapshots.

**Could ship**
- All-time leaderboard; in-room chat.

**Future ideas (not in this build)**
- Quick play / matchmaking into open public rooms, once there is real traffic.
- An in-game currency earned by playing, spent on extra "Ask the AI" requests (Will's idea, 2026-11-16).

**Non-goals**: freehand drawing tools (brush, fill, shapes), mobile-native app, moderation tooling beyond
the basics in §8, accounts/profile pages, payments.

**Anti-goals** (a failure even if it technically works)
- Two half-finished modes instead of one finished one.
- Anonymous visitors able to trigger paid AI calls without limit.
- Client-trusted game state (cooldowns or scores enforced only in the browser).
- A recreation of an existing product's name, branding, or look. Pixel Party is a genre, not a clone.

## 3. Constraints

- Five-day window starting 2026-11-16; submission assumed due ~2026-11-21.
- DeepSpace SDK (Cloudflare Worker + Hono, Vite + React + TS, Tailwind). Follow `.claude/skills/deepspace/SKILL.md`;
  docs.deep.space is the authority.
- Schema migrations are additive only: get collection shapes right early.
- Deploy requires a clean committed worktree. **Source authority is GitHub** (remote `origin` set before the
  first deploy; the first deploy latches it permanently).
- Secrets only via `deepspace secrets` (we expect to need none: integrations are billed through the platform).
- Developer-billed integrations accept anonymous callers, so the app must gate them.
- Only `anthropic/chat-completion` accepts images among DeepSpace's AI integrations (OpenAI chat is text-only;
  the Gemini integration only generates images). The judge is Claude.

## 4. Approaches considered

### 4.1 Where pixel state lives (decided: A)

| | Design | Verdict |
|---|---|---|
| **A** | **Custom `BaseRoom` Durable Object per match.** Pixels in the room's SQLite; placements arrive over WebSocket, are validated and written in one step, then a tiny `{x,y,color}` event is broadcast. | **Chosen.** Validation and write are atomic inside one DO, so cooldowns can't race; minimal broadcast size; the pattern the official games use (Tangent's `AppGameRoom`, PartyPack's `GameRoom`). Costs: we own a small message protocol and reconnect logic. |
| B | Records only, pixels grouped into tile records, written by a server action. | Rejected. Every `put` rebroadcasts the full record (verified in SDK `handlers/records.ts`), so each pixel resends a whole tile; action get+update are separate calls, so cooldowns can be raced. Fixing that rebuilds A. |
| C | Built-in `CanvasRoom` / `useCanvas`. | Rejected. It is a Yjs document of freeform shapes, re-encoded whole per update, gated only by viewer vs member. |

Records are still used for everything that is not hot: rooms, rounds, guesses, scores.

### 4.2 How players get into games (decided: both)

One always-on public co-op board, plus rooms anyone can create (shareable link). Rejected: global boards only
(team mode would be empty), rooms only (no lively default for a solo reviewer). **Quick play / matchmaking was
considered and cut (2026-11-16):** random matching only helps with real traffic; with few players it drops people
into empty rooms, and the default board already serves "just let me play". Listed as a with-real-users next step.

### 4.3 Game modes (decided: co-op first, team mode second on the same engine)

Modes differ only in configuration: grid size, zones, round end condition, and the judge question.

## 5. Design

### 5.1 Game rules

**Co-op**
- Grid 32×32, fixed 16-colour palette. (Spike 1: crude 32×32 drawings were recognised at 100% even with 15%
  noise; 64×64 needs ~4× the pixels, too slow for small groups.)
- A round picks a word from a curated list (easy/medium words, each with accepted synonyms).
  Everyone sees the word.
- **Solo should just be fun (decided with Will).** When you're the only player, cooldown drops to ≈0.2s and
  click-and-drag painting is allowed, so a solo round takes a minute or two. Cooldown grows as players join
  (≈ min(1s × players, 10s)). Exact curve is a tuning knob; every pixel still counts toward the score.
- **"Ask the AI" button (decided with Will).** Any signed-in player can request an immediate judgement instead of
  waiting for the next tick. Server-enforced limit: at most one judgement per room every 10s (the button shows a
  countdown), and the canvas must have changed since the last one. Spend stays bounded at ≤6 calls/minute/room.
- The judge runs while the round is active (see 5.4). The AI's latest top-3 guesses are shown live
  ("The AI thinks: robot? person? rocket?"). That feed is the main feedback loop of the game.
- Win: the AI's top-1 guess matches the word or a synonym. Round score rewards few pixels and little time
  (e.g. `1000 × (1 − pixelsUsed/1024)` blended with time; exact formula is a tuning knob, keep it simple).
- Players whose pixels are present in the winning canvas get credit (per-pixel `lastPlacedBy`).
- Round times out after a cap (e.g. 5 min) with "the AI never got it"; then a new round starts after a short intermission.
- The canvas clears between rounds.

**Team (should-ship)**
- Grid 64×32 split into two 32×32 zones, Red and Blue. Players pick or are assigned a team on joining.
- Same word for both teams; anyone can place anywhere, including the rival zone.
- Fixed round length (e.g. 3 min). At the end, the judge evaluates each zone separately; the team whose zone
  gets the word as top-1 wins; if both or neither do, higher confidence wins.
- Live guesses per zone shown during the round, same as co-op.

### 5.2 Architecture

```
Browser (React)                         Worker (Hono)                      Durable Objects
─────────────────                       ─────────────                      ───────────────
Lobby / room pages ── useQuery ───────▶ RecordRoom (SDK) ◀──── writes ──── PixelRoom (custom, per match)
Canvas ─────────────── WebSocket ─────▶ /api/rooms/:id/ws ───────────────▶ PixelRoom
Cursors ────────────── usePresenceRoom ▶ PresenceRoom (SDK)                 │
                                        integration proxy ◀── judge call ── PixelRoom alarm
                                        file storage (R2) ◀── snapshots ─── PixelRoom
```

- **`PixelRoom extends BaseRoom`**, one instance per room (DO id derived from room id). Owns the grid,
  per-pixel `lastPlacedBy`, per-user cooldowns, the active round's live state, and the judge loop.
  Persists in its own SQLite so a DO restart loses nothing.
- **RecordRoom collections** hold durable, queryable, low-frequency data (5.3). PixelRoom writes them
  server-side; clients never write rounds, guesses, or scores.
- **PresenceRoom** keyed per room for cursors and player count. Ephemeral by design.
- Worker WebSocket route authenticates from the verified JWT (never identity in the URL) and forwards to the PixelRoom.

### 5.3 Collections (records)

Field lists are the intended shape; the builder finalises names. Because migrations are additive, add
anything plausibly needed now.

- `rooms`: name, mode (`coop`|`team`), visibility (`public`|`private`), joinCode, hostId, memberIds
  (collaborators array), status (`lobby`|`playing`|`intermission`|`paused`|`closed`), currentRoundId,
  playerCount (denormalised for the live-rooms list), lastActiveAt, isDefaultBoard.
- `rounds`: roomId, mode, word, startedAt, endedAt, outcome (`won`|`timeout`|`teamWin`), winningTeam,
  pixelsUsed, durationMs, score, contributorIds, finalGuesses, snapshotFileIds (ordered, for replay).
- ~~`judgements`~~ *(builder-check call: dropped as a collection).* Live guesses are broadcast over the PixelRoom
  WebSocket, not stored per tick; only the final guesses and the snapshot file list are saved on the `rounds` record.
  This avoids ~240 records/hour/room.
- `teamMembers` (team mode): roomId, userId, team.
- `scores` (could-ship leaderboard): userId, totalPoints, roundsWon.

Permissions intent: anyone (including signed-out) can read public rooms and their rounds;
private rooms and their rounds are readable only by members. *Membership (my call):* a private room is joined
by its unguessable link/code; joining adds the user to `rooms.memberIds` (a `collaboratorsField`), which is what
RBAC checks. No separate membership collection; only the server writes rounds, judgements,
scores; signed-in users create rooms (rate-limited, e.g. ≤5 active rooms per user).

### 5.4 The AI judge

- Runs in the PixelRoom's own Durable Object **alarm**, not the SDK cron. The cron's granularity is minutes;
  the game needs ticks every ~10-20s per active room, and only while players are present.
- Tick conditions: round active AND ≥1 connected signed-in player AND the grid changed since the last tick AND
  at least N new pixels or T seconds since last judgement. This bounds spend to active, changing rooms.
- Tick: render grid → PNG upscaled nearest-neighbour to 512×512 → `anthropic/chat-completion` with
  `claude-haiku-5-5`, `max_tokens: 1024`, prompt asking for raw JSON `{guesses: [3], confidence}` and to ignore
  stray isolated pixels → parse → write a `judgements` record → broadcast → check win.
- Team mode: same call per zone (crop) at round end, plus optional lower-frequency live ticks.
- Measured in spike 1: ~1.7s median latency, ~$0.00007 per call. A busy room judging every 15s costs <$0.02/hour.
- **App-wide daily AI budget (decided with Will).** A global counter of judge calls per UTC day (default cap 3,000
  calls ≈ $0.25). Every judge call, scheduled or "Ask the AI", reserves from it first; when it's exhausted, judging
  stops until the next day and rooms show "The AI is resting, back tomorrow" while drawing continues. The counter
  must be atomic across rooms, so it lives in one place (e.g. a single named budget Durable Object or a single
  record updated server-side; builder picks after the day-1 platform check). Cap is a config value. This bounds the
  worst case (scripted accounts keeping many rooms busy, ~$3/day per account otherwise) to the cap.
- Failure handling: on error or unparseable output, skip the tick and retry next tick; never end a round on a failed call.
- Snapshot PNGs saved to app file storage per tick (enables replay; should-ship).

### 5.5 Rooms, joining, and auth

- Home: "Play now" (joins the default public co-op board), "Create room" (mode + public/private, gives a share
  link), and a list of live public rooms.
- Rooms have a URL `/r/:joinCode`. Private rooms are joinable by link only.
- Signed-out visitors can watch public rooms (canvas, cursors, guesses). Placing pixels and creating rooms
  require sign-in (Google/GitHub via DeepSpace auth). This is what keeps paid judge calls behind auth.
- Room host can start the next round early and kick players (minimal; could-ship).
- **Room lifecycle (my call):** when the last player disconnects, the room goes `paused`: round timer and judge
  stop, canvas kept. A player rejoining within 10 minutes resumes the round; after that, the next joiner starts a
  fresh round. User-created rooms empty for 30 minutes are set `closed` by the PixelRoom's own alarm and drop off the
  live-rooms list; the ≤5-rooms cap counts only non-closed rooms. The default board never closes, it only pauses.
  So nothing (timers, judge spend) runs in a room nobody is in.

### 5.6 Client-server protocol (PixelRoom WebSocket)

- Server → client on connect: full snapshot (grid as compact encoding, palette, round state, your cooldown, your team).
- Client → server: `place {x, y, color}`.
- Server → clients: `pixel {x, y, color, by}`, `round {state…}`, `judgement {guesses, confidence, zone}`.
- Server → sender only: `reject {reason, retryAt}` (cooldown, out of zone rules, not signed in, round not active).
- Client shows its own pixel optimistically and rolls back on `reject`. This is game-local UI state, separate from the SDK's records.

## 6. DeepSpace features and integrations

| Used | What for | Why this and not something else |
|---|---|---|
| `BaseRoom` custom Durable Object | Authoritative grid, validation, judge loop | Atomic validate+write; tiny broadcasts (see 4.1) |
| Records + `useQuery` | Rooms, rounds, judgements, scores, live lobby | Built-in sync and RBAC for low-frequency data |
| PresenceRoom | Cursors, player count | Ephemeral data, exactly its purpose |
| Auth (Google/GitHub) | Identity for placement, room hosts, credit | Gate on paid judge calls and room creation |
| Permissions (RBAC, visibility) | Public vs private rooms; server-only writes | Enforced on the server, not in UI |
| `anthropic/chat-completion` (Haiku 5.5) | The AI judge (vision) | Only DeepSpace AI integration that accepts images; Haiku matched Sonnet at 1/20 the cost in spike 1 |
| File storage | Judge snapshots, round replay | Platform-scoped storage, no custom buckets |

| Considered, left out | Why |
|---|---|
| OpenAI / Gemini integrations | No image input through DeepSpace (OpenAI chat is text-only; Gemini is generation-only) |
| SDK cron | Minute granularity; the judge needs per-room ticks of seconds, only while active (DO alarm instead) |
| Payments, email | Nothing to sell; nobody wants email from a party game |
| LiveKit voice, ElevenLabs announcer | Players already use Discord; announcer is a gimmick |
| AI image generation | The point is that humans draw |
| `CanvasRoom`, record-tile storage | See 4.1 |

## 7. Plan shape (five days)

- **Day 1 (11-17):** scaffold, PixelRoom with grid + WebSocket + validation + cooldown, canvas UI, one hard-coded room. Deploy early (GitHub source).
- **Day 2:** rounds, word list, judge loop, live guesses, co-op win/score. Re-test judge on real canvases drawn in the app.
- **Day 3:** rooms collection, create/share, default board, presence cursors, sign-in gating, polish co-op. **Decision point:** team mode in or out.
- **Day 4:** team mode (or co-op hardening + replay if out).
- **Day 5:** replay if time, tests, two-browser verification on the live URL, writeup.

## 8. Risks and how we handle them

- **Platform calls from a custom DO (verify first thing on day 1):** unverified that `BaseRoom` code can
  (a) call the integration proxy and (b) write records, the way server actions (`ActionContext.tools`) and
  cron (`buildCronContext`) can. Fallback for both: the PixelRoom calls an internal, app-authenticated Worker
  route that runs with action/cron-style tools. Decide before building the judge or the rounds writes.
- **Anonymous spectators on a custom DO (verify day 1):** the WebSocket route is ours, so a request with no
  valid JWT should be admittable as a read-only spectator (identity absent, never client-asserted). If that turns
  out unsupported, spectators get an HTTP snapshot endpoint plus polling, and sign-in is required for the live socket.
- **Real crowd drawings are messier than spike 1's test set**: re-test on day 2 with canvases drawn in the app;
  adjust grid, prompt, and word list.
- **Too easy**: scoring on pixels used and time makes "easy" the goal; word list has difficulty tiers.
- **Spend abuse**: per-room cap (≤6 calls/min) + per-user room cap (≤5) + app-wide daily budget (above). Check
  `npx deepspace app usage` after the first deploy to confirm the real per-call price on our tier.
- **Griefing in co-op**: cooldown, sign-in, and the judge prompt ignoring stray pixels; host kick if time.
- **Throughput/latency under load**: unmeasured. Measure with a scripted multi-client test on day 1-2;
  cooldown caps per-user rate anyway.
- **PNG encoding in Workers**: needs a small pure-JS encoder or `CompressionStream`-based deflate; pick on day 2.

## 9. Testing and verification

- Unit tests (`npx deepspace test run all`): placement validation, cooldown scaling, zone rules, judge-response
  parsing and word/synonym matching, scoring.
- Two-user test on local dev and on the live URL (two browsers, one signed out spectating).
- Judge re-test on real in-app canvases; record results in `docs/progress.md`.
- Before submission: `deepspace logs`, `app usage` (integration spend), and a check that a signed-out client cannot place pixels or trigger a judgement.

## 10. Left to the builder

Exact field names, word list contents, cooldown curve, score formula, palette, visual design (must be our
own, not the scaffold theme), PNG encoder choice, file layout within the scaffold's conventions.
