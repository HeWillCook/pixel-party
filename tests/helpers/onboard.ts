import type { BrowserContext } from '@playwright/test'

/**
 * New test accounts have no username, so the first-sign-in pop-up would cover every page. Claim a
 * unique username and mark the tour done through the real profile routes, the way the pop-up does.
 */
export async function onboard(context: BrowserContext, label: string): Promise<void> {
  const tokenResponse = await context.request.post('/api/auth/token')
  if (!tokenResponse.ok()) throw new Error(`token: ${tokenResponse.status()}`)
  const { token } = await tokenResponse.json() as { token: string }
  const headers = { Authorization: `Bearer ${token}` }
  const me = await (await context.request.get('/api/profile/me', { headers })).json() as { profile: { username?: string; onboardedAt?: number } | null }
  if (!me.profile?.username) {
    const name = `${label}${Math.random().toString(36).slice(2, 8)}`.slice(0, 16)
    const saved = await context.request.post('/api/profile', { headers, data: { username: name } })
    if (!saved.ok()) throw new Error(`username: ${saved.status()} ${await saved.text()}`)
  }
  if (!me.profile?.onboardedAt) {
    const done = await context.request.post('/api/profile/onboarded', { headers })
    if (!done.ok()) throw new Error(`onboarded: ${done.status()} ${await done.text()}`)
  }
}
