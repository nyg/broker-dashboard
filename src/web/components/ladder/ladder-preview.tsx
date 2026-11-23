import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
   AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { money, quantity } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { LadderPreview, PlaceResponse, PrecheckResponse } from '../../../shared/ladder.ts'

const SECONDS_PER_ORDER = 1.1

interface LadderPreviewCardProps {
   preview: LadderPreview
   precheck: PrecheckResponse | null
   placed: PlaceResponse | null
   busy: 'precheck' | 'place' | null
   onPrecheck: () => void
   onPlace: (confirmation: string) => void
}

function quoteText({ quote }: LadderPreview) {
   if (quote.bid === null && quote.ask === null) {
      return `Saxo quote: none (${quote.priceType ?? 'no price type'})`
   }
   return `Saxo quote: bid ${quote.bid ?? '–'}, ask ${quote.ask ?? '–'} (${quote.priceType ?? 'unknown'})`
}

function MessageList({ title, messages, destructive }: { title: string, messages: string[], destructive?: boolean }) {
   if (!messages.length) {
      return null
   }
   return (
      <Alert variant={destructive ? 'destructive' : 'default'} className={cn(!destructive && 'border-watch/40 text-watch')}>
         <AlertTitle>{title}</AlertTitle>
         <AlertDescription>
            <ul className="list-disc pl-4">
               {messages.map(message => <li key={message}>{message}</li>)}
            </ul>
         </AlertDescription>
      </Alert>
   )
}

function PlaceDialog({ count, total, currency, disabled, onPlace }: { count: number, total: number, currency: string, disabled: boolean, onPlace: (confirmation: string) => void }) {
   const [typed, setTyped] = useState('')
   const phrase = `place ${count}`
   return (
      <AlertDialog onOpenChange={() => setTyped('')}>
         <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={disabled}>Place {count} orders</Button>
         </AlertDialogTrigger>
         <AlertDialogContent>
            <AlertDialogHeader>
               <AlertDialogTitle>Place {count} orders with real money?</AlertDialogTitle>
               <AlertDialogDescription>
                  Saxo receives {count} limit orders worth {money(total)} {currency} before costs, one per second. Type <strong>{phrase}</strong> to confirm.
               </AlertDialogDescription>
            </AlertDialogHeader>
            <Input value={typed} autoComplete="off" aria-label="Confirmation" onChange={event => setTyped(event.target.value)} />
            <AlertDialogFooter>
               <AlertDialogCancel>Cancel</AlertDialogCancel>
               <AlertDialogAction variant="destructive" disabled={typed.trim() !== phrase} onClick={() => onPlace(typed)}>
                  Place orders
               </AlertDialogAction>
            </AlertDialogFooter>
         </AlertDialogContent>
      </AlertDialog>
   )
}

function PlacedAlert({ placed }: { placed: PlaceResponse }) {
   const ids = placed.placed.map(order => order.orderId).join(', ') || 'none'
   if (placed.failure) {
      return (
         <Alert variant="destructive">
            <AlertTitle>Order {placed.failure.number} failed: {placed.failure.problem}</AlertTitle>
            <AlertDescription>Stopped. {placed.placed.length} of {placed.total} orders placed: {ids}</AlertDescription>
         </Alert>
      )
   }
   return (
      <Alert className="border-safe/40 text-safe">
         <AlertTitle>All {placed.total} orders placed</AlertTitle>
         <AlertDescription>Order IDs {ids}. ExternalReference prefix {placed.batchId}.</AlertDescription>
      </Alert>
   )
}

export function LadderPreviewCard({ preview, precheck, placed, busy, onPrecheck, onPlace }: LadderPreviewCardProps) {
   const { instrument, reference, rungs } = preview
   const currency = instrument.currency
   const results = new Map(precheck?.results.map(result => [result.number, result]))
   const count = rungs.length
   const canPrecheck = preview.planId !== null && !placed
   const failures = precheck?.results.filter(result => result.problem).map(result => `Order ${result.number}: ${result.problem}`) ?? []

   return (
      <Card>
         <CardHeader>
            <CardTitle>{preview.side} {instrument.description} ({instrument.symbol}, {instrument.assetType})</CardTitle>
            <CardDescription className="grid gap-0.5">
               <span>Account {preview.accountId}. Limit orders, {preview.duration}{preview.expires ? ` until ${preview.expires}` : ''}.</span>
               <span>{quoteText(preview)}</span>
               {reference && (
                  <span>
                     Underlying now {reference.underlyingNow}, instrument now {reference.priceNow} ({reference.source === 'saxo' ? 'Saxo' : 'entered'}): limit price = underlying level × {reference.ratio}
                  </span>
               )}
            </CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4">
            <Table>
               <TableHeader>
                  <TableRow>
                     <TableHead className="text-right">#</TableHead>
                     {reference && <TableHead className="text-right">Underlying level</TableHead>}
                     <TableHead className="text-right">Limit price</TableHead>
                     <TableHead className="text-right">Amount</TableHead>
                     <TableHead className="text-right">Value ({currency})</TableHead>
                     {precheck && <TableHead className="text-right">Commission</TableHead>}
                     {precheck && <TableHead className="text-right">Estimated total</TableHead>}
                     {precheck && <TableHead>Precheck</TableHead>}
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {rungs.map((rung, index) => {
                     const result = results.get(index + 1)
                     return (
                        <TableRow key={rung.price}>
                           <TableCell className="text-right tabular-nums">{index + 1}</TableCell>
                           {reference && <TableCell className="text-right tabular-nums">{money(Number(rung.level))}</TableCell>}
                           <TableCell className="text-right tabular-nums">{rung.price}</TableCell>
                           <TableCell className="text-right tabular-nums">{quantity(Number(rung.amount))}</TableCell>
                           <TableCell className="text-right tabular-nums">{money(rung.value)}</TableCell>
                           {precheck && <TableCell className="text-right tabular-nums">{money(result?.commission ?? null)}</TableCell>}
                           {precheck && <TableCell className="text-right tabular-nums">{money(result?.estimatedTotalCost ?? null)}</TableCell>}
                           {precheck && <TableCell className={result?.problem ? 'text-danger' : 'text-safe'}>{result?.problem ?? 'Ok'}</TableCell>}
                        </TableRow>
                     )
                  })}
               </TableBody>
               <TableFooter>
                  <TableRow>
                     <TableCell colSpan={reference ? 3 : 2}>Total before costs</TableCell>
                     <TableCell className="text-right tabular-nums">{quantity(Number(preview.totalAmount))}</TableCell>
                     <TableCell className="text-right tabular-nums">{money(preview.totalValue)}</TableCell>
                     {precheck && <TableCell colSpan={3} />}
                  </TableRow>
               </TableFooter>
            </Table>
            <p className="text-sm text-muted-foreground">
               Cash {money(preview.cash.cash)} {preview.cash.currency}
               {preview.cash.transactionsNotBooked !== null && `, transactions not booked ${money(preview.cash.transactionsNotBooked)} ${preview.cash.currency}`}
               , cash available for trading {money(preview.cash.cashAvailableForTrading)} {preview.cash.currency}
            </p>
            <MessageList title="Not placing anything" messages={preview.errors} destructive />
            <MessageList title="Warnings" messages={preview.warnings} />
            <MessageList title="Precheck failed, nothing placed" messages={failures} destructive />
            {placed && <PlacedAlert placed={placed} />}
            {!preview.ordersEnabled && (
               <Alert>
                  <AlertTitle>Orders are disabled on this server</AlertTitle>
                  <AlertDescription>Set ORDERS_ENABLED=true in its environment to check and place orders.</AlertDescription>
               </Alert>
            )}
         </CardContent>
         {canPrecheck && (
            <CardFooter className="flex flex-wrap gap-3">
               <Button variant="outline" disabled={busy !== null} onClick={onPrecheck}>
                  {busy === 'precheck' ? `Checking ${count} orders, about ${Math.ceil(count * SECONDS_PER_ORDER)} s…` : 'Check with Saxo'}
               </Button>
               {precheck?.ok && (
                  busy === 'place'
                     ? <Button variant="destructive" disabled>Placing {count} orders, about {Math.ceil(count * SECONDS_PER_ORDER)} s…</Button>
                     : <PlaceDialog count={count} total={preview.totalValue} currency={currency} disabled={busy !== null} onPlace={onPlace} />
               )}
            </CardFooter>
         )}
      </Card>
   )
}
