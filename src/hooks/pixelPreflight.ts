import { statusToConnectError, type ConnectError } from '../game/client-state'

export async function pixelPreflight(pathUrl: string, hadToken: boolean, abort: AbortSignal): Promise<{ error: ConnectError | null; expired: boolean }> {
  const probe = (url: string) => fetch(url, {
    method: 'GET', credentials: 'same-origin',
    signal: AbortSignal.any([abort, AbortSignal.timeout(5000)]),
  })
  const response = await probe(pathUrl)
  if (response.status === 401 && hadToken) {
    const anonymousUrl = new URL(pathUrl)
    anonymousUrl.searchParams.delete('token')
    const anonymous = await probe(anonymousUrl.toString())
    const error = statusToConnectError(anonymous.status)
    return { error, expired: error === null }
  }
  return { error: statusToConnectError(response.status), expired: false }
}
