import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { percent } from '@/lib/format'
import { cn } from '@/lib/utils'

import { CLOSE_OUT_PCT, MARGIN_CALL_PCT, type MarginLevel, marginLevel, WATCH_PCT } from '../../shared/margin.ts'

export type GaugeLevels = Record<MarginLevel, { label: string, text: string }>

export interface GaugeFigure {
   label: string
   value: string
}

const STYLES: Record<MarginLevel, { fill: string, badge: string }> = {
   'safe': { fill: 'bg-safe', badge: 'bg-safe/15 text-safe' },
   'watch': { fill: 'bg-watch', badge: 'bg-watch/20 text-watch' },
   'margin-call': { fill: 'bg-danger', badge: 'bg-danger/15 text-danger' },
   'close-out': { fill: 'bg-danger', badge: 'bg-danger text-white' },
   'unknown': { fill: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
}

const TICKS = [WATCH_PCT, MARGIN_CALL_PCT]

interface MarginGaugeProps {
   title: string
   value: number | null
   levels: GaugeLevels
   figures: GaugeFigure[]
}

export function MarginGauge({ title, value, levels, figures }: MarginGaugeProps) {
   const level = marginLevel(value)
   const { label, text } = levels[level]
   const width = Math.min(Math.max(value ?? 0, 0), CLOSE_OUT_PCT)

   return (
      <Card>
         <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{text}</CardDescription>
            <CardAction>
               <Badge className={STYLES[level].badge}>{label}</Badge>
            </CardAction>
         </CardHeader>
         <CardContent className="space-y-4">
            <div className="text-5xl font-semibold tracking-tight tabular-nums">{percent(value)}</div>
            <div>
               <div
                  role="meter"
                  aria-label={title}
                  aria-valuemin={0}
                  aria-valuemax={CLOSE_OUT_PCT}
                  aria-valuenow={value ?? undefined}
                  aria-valuetext={`${percent(value)}, ${label}`}
                  className="relative h-3 overflow-hidden rounded-full bg-muted"
               >
                  <div className={cn('h-full rounded-full transition-[width]', STYLES[level].fill)} style={{ width: `${width}%` }} />
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
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
               {figures.map(figure => (
                  <div key={figure.label} className="contents">
                     <dt className="text-muted-foreground">{figure.label}</dt>
                     <dd className="text-right tabular-nums">{figure.value}</dd>
                  </div>
               ))}
            </dl>
         </CardContent>
      </Card>
   )
}
