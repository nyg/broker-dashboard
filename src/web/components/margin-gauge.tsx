import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { money, percent } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { MarginSummary } from '../../shared/dashboard.ts'
import { CLOSE_OUT_PCT, MARGIN_CALL_PCT, type MarginLevel, marginLevel, WATCH_PCT } from '../../shared/margin.ts'

const LEVELS: Record<MarginLevel, { label: string, text: string, fill: string, badge: string }> = {
   'safe': {
      label: 'Safe',
      text: `Well below the ${MARGIN_CALL_PCT}% level where Saxo starts margin calls.`,
      fill: 'bg-safe',
      badge: 'bg-safe/15 text-safe',
   },
   'watch': {
      label: 'Watch',
      text: `Above ${WATCH_PCT}%. Saxo starts margin calls at ${MARGIN_CALL_PCT}%.`,
      fill: 'bg-watch',
      badge: 'bg-watch/20 text-watch',
   },
   'margin-call': {
      label: 'Margin call',
      text: `At ${MARGIN_CALL_PCT}% or more Saxo sends margin calls. At ${CLOSE_OUT_PCT}% it may close positions.`,
      fill: 'bg-danger',
      badge: 'bg-danger/15 text-danger',
   },
   'close-out': {
      label: 'Close-out',
      text: `At ${CLOSE_OUT_PCT}% Saxo may close positions and cancel open orders.`,
      fill: 'bg-danger',
      badge: 'bg-danger text-white',
   },
   'unknown': {
      label: 'Unknown',
      text: 'Saxo did not return a utilisation figure.',
      fill: 'bg-muted-foreground',
      badge: 'bg-muted text-muted-foreground',
   },
}

const TICKS = [WATCH_PCT, MARGIN_CALL_PCT]

export function MarginGauge({ margin, currency, decimals }: { margin: MarginSummary, currency: string, decimals: number }) {
   const value = margin.marginAndLoanUtilizationPct
   const level = LEVELS[marginLevel(value)]
   const width = Math.min(Math.max(value ?? 0, 0), CLOSE_OUT_PCT)

   return (
      <Card>
         <CardHeader>
            <CardTitle>Margin and loan utilisation</CardTitle>
            <CardDescription>{level.text}</CardDescription>
            <CardAction>
               <Badge className={level.badge}>{level.label}</Badge>
            </CardAction>
         </CardHeader>
         <CardContent className="space-y-4">
            <div className="text-5xl font-semibold tracking-tight tabular-nums">{percent(value)}</div>
            <div>
               <div
                  role="meter"
                  aria-label="Margin and loan utilisation"
                  aria-valuemin={0}
                  aria-valuemax={CLOSE_OUT_PCT}
                  aria-valuenow={value ?? undefined}
                  aria-valuetext={`${percent(value)}, ${level.label}`}
                  className="relative h-3 overflow-hidden rounded-full bg-muted"
               >
                  <div className={cn('h-full rounded-full transition-[width]', level.fill)} style={{ width: `${width}%` }} />
                  {TICKS.map(tick => (
                     <div key={tick} className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${tick}%` }} />
                  ))}
               </div>
               <div className="relative mt-1 h-4 text-xs text-muted-foreground tabular-nums">
                  <span className="absolute left-0">0%</span>
                  {TICKS.map(tick => (
                     <span key={tick} className="absolute -translate-x-1/2" style={{ left: `${tick}%` }}>{tick}%</span>
                  ))}
                  <span className="absolute right-0">{CLOSE_OUT_PCT}%</span>
               </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
               <dt className="text-muted-foreground">Margin utilisation</dt>
               <dd className="text-right tabular-nums">{percent(margin.marginUtilizationPct)}</dd>
               <dt className="text-muted-foreground">Collateral utilisation</dt>
               <dd className="text-right tabular-nums">{percent(margin.collateralUtilizationPct)}</dd>
               <dt className="text-muted-foreground">Loan ({currency})</dt>
               <dd className="text-right tabular-nums">{money(margin.collateralLoan, decimals)}</dd>
               <dt className="text-muted-foreground">Collateral credit value ({currency})</dt>
               <dd className="text-right tabular-nums">{money(margin.collateralCreditLine, decimals)}</dd>
            </dl>
         </CardContent>
      </Card>
   )
}
