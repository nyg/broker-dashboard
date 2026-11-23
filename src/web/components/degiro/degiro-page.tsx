import { UploadIcon } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'

import { type GaugeLevels, MarginGauge } from '@/components/margin-gauge'
import { type Column, TableCard } from '@/components/table-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ValueListCard, type ValueRow } from '@/components/value-list-card'
import type { Polled } from '@/hooks/use-polling'
import { type DegiroSettingsChange, saveDegiroSettings, setCreditOverride, uploadStatement } from '@/lib/api'
import { date, money, percent, quantity } from '@/lib/format'

import {
   DEGIRO_PROFILES,
   type DegiroDashboard,
   type DegiroPosition,
   type DegiroProfile,
   PROFILE_CREDIT_PCT,
} from '../../../shared/degiro.ts'
import { CLOSE_OUT_PCT, MARGIN_CALL_PCT, WATCH_PCT } from '../../../shared/margin.ts'

const DEGIRO_LEVELS: GaugeLevels = {
   'safe': { label: 'Safe', text: `Far from a margin call, which DEGIRO makes at ${CLOSE_OUT_PCT}%, when the credit or margin surplus turns negative.` },
   'watch': { label: 'Watch', text: `Above ${WATCH_PCT}%. DEGIRO makes a margin call at ${CLOSE_OUT_PCT}%, when the credit or margin surplus turns negative.` },
   'margin-call': { label: 'Near a call', text: `Above ${MARGIN_CALL_PCT}%. At ${CLOSE_OUT_PCT}% a surplus turns negative and DEGIRO makes a margin call.` },
   'close-out': { label: 'Margin call', text: 'A surplus is negative: DEGIRO asks you to add money or sell, and may sell positions itself.' },
   'unknown': { label: 'Unknown', text: 'Not enough prices or credit percentages to estimate it.' },
}

const PROFILE_NAMES: Record<DegiroProfile, string> = {
   custody: 'Custody',
   basic: 'Basic',
   active: 'Active',
   trader: 'Trader',
   custom: 'Custom',
}

function profileLabel(profile: DegiroProfile) {
   return profile === 'custom' ? 'Custom percentage' : `${PROFILE_NAMES[profile]}, ${PROFILE_CREDIT_PCT[profile]}%`
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

interface PercentInputProps {
   id?: string
   label: string
   value: number | null
   placeholder?: string
   max?: number
   onSave: (value: number | null) => Promise<void>
   className?: string
}

function PercentInput({ id, label, value, placeholder = '–', max = 100, onSave, className }: PercentInputProps) {
   const [error, setError] = useState<string | null>(null)

   async function save(text: string) {
      const next = text.trim() === '' ? null : Number(text)
      if (next === value) {
         return
      }
      try {
         await onSave(next)
         setError(null)
      } catch (saveError) {
         setError(errorMessage(saveError))
      }
   }

   return (
      <Input
         id={id}
         type="number"
         inputMode="decimal"
         min={0}
         max={max}
         step="any"
         defaultValue={value ?? ''}
         placeholder={placeholder}
         aria-label={label}
         aria-invalid={error !== null}
         title={error ?? undefined}
         className={className}
         onBlur={event => void save(event.currentTarget.value)}
         onKeyDown={event => {
            if (event.key === 'Enter') {
               event.currentTarget.blur()
            }
         }}
      />
   )
}

function SettingsCard({ dashboard, onSaved }: { dashboard: DegiroDashboard, onSaved: () => void }) {
   const [error, setError] = useState<string | null>(null)

   async function save(changes: DegiroSettingsChange) {
      try {
         await saveDegiroSettings(changes)
         setError(null)
         onSaved()
      } catch (saveError) {
         setError(errorMessage(saveError))
         throw saveError
      }
   }

   return (
      <Card>
         <CardHeader>
            <CardTitle>Margin settings</CardTitle>
            <CardDescription>
               Copy them from DEGIRO&apos;s Available to trade: the profile sets the Collateral value, and the portfolio risk is Portfolio Risk divided by Value of portfolio.
            </CardDescription>
         </CardHeader>
         <CardContent className="space-y-3">
            <div className="grid gap-1.5">
               <Label htmlFor="degiro-profile">Account profile</Label>
               <Select value={dashboard.profile ?? ''} onValueChange={profile => void save({ profile: profile as DegiroProfile }).catch(() => {})}>
                  <SelectTrigger id="degiro-profile" className="w-full">
                     <SelectValue placeholder="Choose your profile" />
                  </SelectTrigger>
                  <SelectContent>
                     {DEGIRO_PROFILES.map(profile => <SelectItem key={profile} value={profile}>{profileLabel(profile)}</SelectItem>)}
                  </SelectContent>
               </Select>
            </div>
            {dashboard.profile === 'custom' && (
               <div className="grid gap-1.5">
                  <Label htmlFor="degiro-custom-credit">Credit, % of each position&apos;s value</Label>
                  <PercentInput
                     key={dashboard.customCreditPct}
                     id="degiro-custom-credit"
                     label="Credit, in percent of each position's value"
                     value={dashboard.customCreditPct}
                     onSave={customCreditPct => save({ customCreditPct })}
                  />
               </div>
            )}
            <div className="grid gap-1.5">
               <Label htmlFor="degiro-portfolio-risk">Portfolio risk, % of portfolio value</Label>
               <PercentInput
                  key={dashboard.portfolioRiskPct}
                  id="degiro-portfolio-risk"
                  label="Portfolio risk, in percent of portfolio value"
                  value={dashboard.portfolioRiskPct}
                  placeholder="not set"
                  max={1000}
                  onSave={portfolioRiskPct => save({ portfolioRiskPct })}
               />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
         </CardContent>
      </Card>
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

function positionColumns(defaultCreditPct: number | null, onSaved: () => void): Column<DegiroPosition>[] {
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
      {
         header: 'Credit %',
         cell: row => (
            <PercentInput
               key={`${row.isin}-${row.creditOverridePct}`}
               label={`Credit for ${row.product}, in percent; empty uses the profile's`}
               value={row.creditOverridePct}
               placeholder={defaultCreditPct === null ? '–' : String(defaultCreditPct)}
               onSave={async creditPct => {
                  await setCreditOverride(row.isin, creditPct)
                  onSaved()
               }}
               className="ml-auto w-20 text-right"
            />
         ),
         numeric: true,
      },
      { header: 'Collateral value', cell: row => money(row.collateralValue), numeric: true },
   ]
}

function accountRows({ margin, cash, cashError }: DegiroDashboard): ValueRow[] {
   const surplusClass = (value: number | null) => (value !== null && value < 0 ? 'text-danger' : undefined)
   return [
      { label: 'Value of portfolio', value: money(margin.positionsValue) },
      { label: 'Cash balance', value: cashError ? 'unknown' : money(cash), hint: cashError ?? undefined },
      { label: 'Collateral value', value: money(margin.collateralValue), hint: 'The share of each position\'s value DEGIRO lends against.' },
      {
         label: 'Credit surplus',
         value: money(margin.creditSurplus),
         hint: 'Collateral value plus cash balance.',
         className: surplusClass(margin.creditSurplus),
      },
      { label: 'Portfolio risk', value: money(margin.portfolioRisk), hint: 'Value of portfolio times the portfolio risk percentage you set.' },
      {
         label: 'Margin surplus',
         value: money(margin.marginSurplus),
         hint: 'Value of portfolio plus cash balance, less portfolio risk.',
         className: surplusClass(margin.marginSurplus),
      },
   ]
}

function Warnings({ dashboard }: { dashboard: DegiroDashboard }) {
   const { positionsWithoutCredit, positionsWithoutPrice } = dashboard.margin
   return (
      <>
         {dashboard.profile === null && (
            <Alert>
               <AlertTitle>Choose your DEGIRO account profile</AlertTitle>
               <AlertDescription>
                  It sets how much DEGIRO lends against your positions. Until then they count for no collateral, so the gauge cannot show a figure.
               </AlertDescription>
            </Alert>
         )}
         {dashboard.profile !== null && positionsWithoutCredit > 0 && (
            <Alert>
               <AlertTitle>{positionsWithoutCredit === 1 ? '1 position has' : `${positionsWithoutCredit} positions have`} no credit percentage</AlertTitle>
               <AlertDescription>Enter your custom percentage, or one per position. Until then they count for no collateral, so the gauge errs high.</AlertDescription>
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
         <div className="grid items-start gap-4 lg:grid-cols-3">
            <MarginGauge
               title="Loan used, estimated"
               value={margin.utilizationPct}
               levels={DEGIRO_LEVELS}
               figures={[
                  { label: 'Credit test', value: percent(margin.creditUtilizationPct) },
                  { label: 'Margin test', value: dashboard.portfolioRiskPct === null ? 'set the portfolio risk' : percent(margin.marginUtilizationPct) },
                  { label: `Loan (${currency})`, value: money(margin.loan) },
               ]}
            />
            <ValueListCard title={`Account (${currency})`} rows={accountRows(dashboard)} />
            <div className="grid gap-4">
               <SettingsCard dashboard={dashboard} onSaved={reload} />
               <StatementCard dashboard={dashboard} onUploaded={reload} />
            </div>
         </div>
         <TableCard
            title={`Positions (${currency})`}
            description="Prices from justETF: an exchange quote, or the fund's last published NAV where justETF has none. An empty Credit % uses the profile's; enter 0 for a product DEGIRO does not lend against."
            rows={dashboard.positions}
            columns={positionColumns(dashboard.defaultCreditPct, reload)}
            rowKey={row => row.isin}
         />
      </div>
   )
}
