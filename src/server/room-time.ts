export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

export async function withTimeout<Value>(pending: Promise<Value>, milliseconds: number, fallback: Value): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      pending,
      new Promise<Value>(resolve => { timer = setTimeout(() => resolve(fallback), milliseconds) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
