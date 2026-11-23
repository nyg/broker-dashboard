export type MarginLevel = 'safe' | 'watch' | 'margin-call' | 'close-out' | 'unknown'

// Saxo Switzerland sends margin calls from 75% "margin and loan utilisation" and keeps it below 100%
// by closing positions: https://www.home.saxo/en-ch/accounts/lombard-loan
export const MARGIN_CALL_PCT = 75
export const CLOSE_OUT_PCT = 100
export const WATCH_PCT = 50

export function marginLevel(utilizationPct: number | null): MarginLevel {
   if (utilizationPct === null || !Number.isFinite(utilizationPct)) {
      return 'unknown'
   }
   if (utilizationPct >= CLOSE_OUT_PCT) {
      return 'close-out'
   }
   if (utilizationPct >= MARGIN_CALL_PCT) {
      return 'margin-call'
   }
   if (utilizationPct >= WATCH_PCT) {
      return 'watch'
   }
   return 'safe'
}

export function marginAndLoanUtilization(combinedPct: number | null, ...partsPct: (number | null)[]) {
   if (combinedPct !== null) {
      return combinedPct
   }
   const known = partsPct.filter(value => value !== null)
   return known.length ? Math.max(...known) : null
}
