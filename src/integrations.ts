/**
 * Integration Billing Config
 *
 * Configure who pays for each integration's API calls.
 *
 * - 'developer': The app owner pays (default).
 * - 'user': The calling user pays.
 *
 * Client calls are denied unless an entry explicitly sets `client: true`.
 * Pixle enables none: AI runs server-side in PixelRoom via server-tools,
 * where game budgets must be enforced before spending developer credits.
 *
 * Opted-in client integrations require sign-in by default. `anonymous: true`
 * also permits signed-out callers for developer billing; user billing always
 * requires sign-in. Server-side integration calls do not use the client flag.
 *
 * IMPORTANT: any integration backed by per-user connected accounts (Google,
 * Composio) must be 'user' — the api-worker resolves the account from the
 * JWT subject. With 'developer' the app owner's JWT is forwarded, so every
 * signed-in user connects and acts on the app owner's account. Server code
 * that acts for a user in the background (e.g. a cron job) uses
 * `callComposio(env, ..., { asUser })` from 'deepspace/worker' instead.
 */

export const integrations: Record<
  string,
  { billing: 'developer' | 'user'; anonymous?: boolean; client?: boolean }
> = {
  google: { billing: 'user' },
  composio: { billing: 'user' },
}
