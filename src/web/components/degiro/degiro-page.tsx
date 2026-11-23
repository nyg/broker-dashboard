import { UploadIcon } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'

import { type GaugeLevels, MarginGauge } from '@/components/margin-gauge'
import { type Column, TableCard } from '@/components/table-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ValueListCard, type ValueRow } from '@/components/value-list-card'
import type { Polled } from '@/hooks/use-polling'
import { setHaircut, uploadStatement } from '@/lib/api'
import { date, money, quantity } from '@/lib/format'

import type { DegiroDashboard, DegiroPosition } from '../../../shared/degiro.ts'
import { CLOSE_OUT_PCT, MARGIN_CALL_PCT, WATCH_PCT } from '../../../shared/margin.ts'

const DEGIRO_LEVELS: GaugeLevels = {
   'safe': { label: 'Safe', text: `Far from a margin call, which DEGIRO makes at ${CLOSE_OUT_PCT}%, when free space turns negative.` },
   'watch': { label: 'Watch', text: `Above ${WATCH_PCT}%. DEGIRO makes a margin call at ${CLOSE_OUT_PCT}%, when free space turns negative.` },
   'margin-call': { label: 'Near a call', text: `Above ${MARGIN_CALL_PCT}%. At ${CLOSE_OUT_PCT}% free space turns negative and DEGIRO makes a margin call.` },
   'close-out': { label: 'Margin call', text: 'Free space is negative: DEGIRO asks you to add money or sell, and may sell positions itself.' },
   'unknown': { label: 'Unknown', text: 'Not enough prices or haircuts to estimate it.' },
}

function errorMessage(error: unknown) {
   return error instanceof Error ? error.message : String(error)
}

function StatementButton({ label, onUploaded }: { label: string, onUploaded: () => void }) {
   const input = useRef<HTMLInputElement>(null)
   const [busy, setBusy] = useState(false)
   const [error, setError] = useState<string | null>(null)

   async function upload(event: ChangeEvent<HTMLInputElement>) {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (!file) {
         return
      }
      setBusy(true)
      try {
         await uploadStatement(file)
         setError(null)
         onUploaded()
      } catch (uploadError) {
         setError(errorMessage(uploadError))
      } finally {
         setBusy(false)
      }
   }

   return (
      <div className="space-y-2">
         <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={event => void upload(event)} />
         <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <UploadIcon />
            {busy ? 'Uploading…' : label}
         </Button>
         {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
   )
}

function StatementCard({ dashboard, onUploaded }: { dashboard: DegiroDashboard | null, onUploaded: () => void }) {
   return (
      <Card>
         <CardHeader>
            <CardTitle>Statement</CardTitle>
            <CardDescription>
               {dashboard
                  ? `Bookings up to ${dashboard.newestBooking ? date(dashboard.newestBooking) : 'an unknown date'}, uploaded ${date(dashboard.statementSavedAt.slice(0, 10))}. Upload a newer one after you trade, deposit or withdraw.`
                  : 'Export the account statement from DEGIRO as Account.csv and upload it here. The server keeps it and prices the positions with justETF.'}
            </CardDescription>
         </CardHeader>
         <CardContent>
            <StatementButton label={dashboard ? 'Upload a newer Account.csv' : 'Upload Account.csv'} onUploaded={onUploaded} />
         </CardContent>
      </Card>
   )
}

function HaircutInput({ position, onSaved }: { position: DegiroPosition, onSaved: () => void }) {
   const [error, setError] = useState<string | null>(null)

   async function save(text: string) {
      const haircutPct = text.trim() === '' ? null : Number(text)
      if (haircutPct === position.haircutPct) {
         return
      }
      try {
         await setHaircut(position.isin, haircutPct)
         setError(null)
         onSaved()
      } catch (saveError) {
         setError(errorMessage(saveError))
      }
   }

   return (
      <Input
         type="number"
         inputMode="decimal"
         min={0}
         max={100}
         step="any"
         defaultValue={position.haircutPct ?? ''}
         placeholder="–"
         aria-label={`Haircut for ${position.product}, in percent`}
         aria-invalid={error !== null}
         title={error ?? undefined}
         className="ml-auto w-20 text-right"
         onBlur={event => void save(event.currentTarget.value)}
         onKeyDown={event => {
            if (event.key === 'Enter') {
               event.currentTarget.blur()
            }
         }}
      />
   )
}

function PriceCell({ position }: { position: DegiroPosition }) {
   if (position.price === null) {
      return <span className="text-destructive" title={position.priceError ?? undefined}>no price</span>
   }
   return (
      <div>
         <div>{money(position.price)}</div>
         <div className="text-xs text-muted-foreground">
            {[position.priceVenue, position.priceDate && date(position.priceDate)].filter(Boolean).join(' ')}
         </div>
      </div>
   )
}

function positionColumns(onSaved: () => void): Column<DegiroPosition>[] {
   return [
      {
         header: 'Product',
         cell: row => (
            <div>
               <div className="font-medium">{row.product}</div>
               <div className="text-xs text-muted-foreground">{row.isin}</div>
            </div>
         ),
      },
      { header: 'Quantity', cell: row => quantity(row.quantity), numeric: true },
      { header: 'Price', cell: row => <PriceCell position={row} />, numeric: true },
      { header: 'Value', cell: row => money(row.value), numeric: true },
      { header: 'Haircut %', cell: row => <HaircutInput key={`${row.isin}-${row.haircutPct}`} position={row} onSaved={onSaved} />, numeric: true },
      { header: 'Collateral value', cell: row => money(row.collateralValue), numeric: true },
   ]
}

function accountRows({ margin, cash, cashError }: DegiroDashboard): ValueRow[] {
   return [
      { label: 'Cash', value: cashError ? 'unknown' : money(cash), hint: cashError ?? undefined },
      { label: 'Positions value', value: money(margin.positionsValue) },
      {
         label: 'Collateral value',
         value: money(margin.collateralValue),
         hint: 'Each position\'s value less its haircut: what DEGIRO lends against.',
      },
      {
         label: 'Free space',
         value: money(margin.freeSpace),
         hint: 'Collateral value plus cash. DEGIRO makes a margin call when it turns negative.',
         className: margin.freeSpace !== null && margin.freeSpace < 0 ? 'text-danger' : undefined,
      },
   ]
}

function Warnings({ dashboard }: { dashboard: DegiroDashboard }) {
   const { positionsWithoutHaircut, positionsWithoutPrice } = dashboard.margin
   return (
      <>
         {positionsWithoutHaircut > 0 && (
            <Alert>
               <AlertTitle>{positionsWithoutHaircut === 1 ? '1 position has' : `${positionsWithoutHaircut} positions have`} no haircut</AlertTitle>
               <AlertDescription>
                  Enter the share of each position&apos;s value that DEGIRO does not lend against. Until then it counts for no collateral, so the gauge errs high.
               </AlertDescription>
            </Alert>
         )}
         {positionsWithoutPrice > 0 && (
            <Alert variant="destructive">
               <AlertTitle>No price for {positionsWithoutPrice === 1 ? '1 position' : `${positionsWithoutPrice} positions`}</AlertTitle>
               <AlertDescription>They count for no collateral. Hover “no price” in the table for the reason.</AlertDescription>
            </Alert>
         )}
      </>
   )
}

export function DegiroPage({ state }: { state: Polled<{ dashboard: DegiroDashboard | null }> }) {
   const reload = () => void state.reload()

   if (state.error && !state.data) {
      return (
         <Alert variant="destructive">
            <AlertTitle>Could not load DEGIRO</AlertTitle>
            <AlertDescription>{state.error.message}</AlertDescription>
         </Alert>
      )
   }
   if (!state.data) {
      return <Skeleton className="h-72 rounded-xl" />
   }
   const { dashboard } = state.data
   if (!dashboard) {
      return <StatementCard dashboard={null} onUploaded={reload} />
   }
   const { currency, margin } = dashboard
   return (
      <div className="grid gap-4">
         {state.error && (
            <Alert variant="destructive">
               <AlertTitle>Could not reload DEGIRO, showing the last data</AlertTitle>
               <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
         )}
         <Warnings dashboard={dashboard} />
         <div className="grid gap-4 lg:grid-cols-3">
            <MarginGauge
               title="Loan to collateral, estimated"
               value={margin.utilizationPct}
               levels={DEGIRO_LEVELS}
               figures={[
                  { label: `Loan (${currency})`, value: money(margin.loan) },
                  { label: `Collateral value (${currency})`, value: money(margin.collateralValue) },
               ]}
            />
            <ValueListCard title={`Account (${currency})`} rows={accountRows(dashboard)} />
            <StatementCard dashboard={dashboard} onUploaded={reload} />
         </div>
         <TableCard
            title={`Positions (${currency})`}
            description="Prices from justETF: an exchange quote, or the fund's last published NAV where justETF has none."
            rows={dashboard.positions}
            columns={positionColumns(reload)}
            rowKey={row => row.isin}
         />
      </div>
   )
}
