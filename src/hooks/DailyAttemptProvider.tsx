import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useDailyAttempt } from './useDailyAttempt'

const DailyContext = createContext<ReturnType<typeof useDailyAttempt> | null>(null)

export function DailyAttemptProvider({ children }: { children: ReactNode }) {
  const daily = useDailyAttempt()
  useEffect(() => {
    const interval = setInterval(daily.tick, 1_000)
    return () => clearInterval(interval)
  }, [daily.tick])
  return <DailyContext.Provider value={daily}>{children}</DailyContext.Provider>
}

export function useDaily(): ReturnType<typeof useDailyAttempt> {
  const daily = useContext(DailyContext)
  if (!daily) throw new Error('useDaily must be used within DailyAttemptProvider')
  return daily
}
