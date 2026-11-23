import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface ValueRow {
   label: string
   value: ReactNode
   hint?: string
   className?: string
}

export function ValueListCard({ title, rows }: { title: string, rows: ValueRow[] }) {
   return (
      <Card>
         <CardHeader>
            <CardTitle>{title}</CardTitle>
         </CardHeader>
         <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
               {rows.map(row => (
                  <div key={row.label} className="contents">
                     <dt
                        title={row.hint}
                        className={cn('text-muted-foreground', row.hint && 'w-fit cursor-help underline decoration-dotted underline-offset-4')}
                     >
                        {row.label}
                     </dt>
                     <dd className={cn('text-right tabular-nums', row.className)}>{row.value}</dd>
                  </div>
               ))}
            </dl>
         </CardContent>
      </Card>
   )
}
