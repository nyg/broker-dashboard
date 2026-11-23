import { useCallback, useEffect, useState } from 'react'

export interface Polled<T> {
   data: T | null
   error: Error | null
   reload: () => Promise<void>
}

// `load` must be stable (a module-level function), or every render restarts the polling.
export function usePolling<T>(load: () => Promise<T>, intervalMs: number, enabled = true): Polled<T> {
   const [data, setData] = useState<T | null>(null)
   const [error, setError] = useState<Error | null>(null)
   const reload = useCallback(async () => {
      try {
         const result = await load()
         setData(result)
         setError(null)
      } catch (loadError) {
         setError(loadError instanceof Error ? loadError : new Error(String(loadError)))
      }
   }, [load])

   useEffect(() => {
      if (!enabled) {
         return undefined
      }
      const reloadIfVisible = () => {
         if (document.visibilityState === 'visible') {
            void reload()
         }
      }
      const firstLoad = setTimeout(reloadIfVisible, 0)
      const timer = setInterval(reloadIfVisible, intervalMs)
      document.addEventListener('visibilitychange', reloadIfVisible)
      return () => {
         clearTimeout(firstLoad)
         clearInterval(timer)
         document.removeEventListener('visibilitychange', reloadIfVisible)
      }
   }, [enabled, intervalMs, reload])

   return { data, error, reload }
}
