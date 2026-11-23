import type { FormEvent, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LadderForm } from '@/lib/ladder-form'

import { type Duration, DURATIONS, SIDES } from '../../../shared/ladder.ts'

const DURATION_LABELS: Record<Duration, string> = {
   GoodTillCancel: 'Good till cancelled',
   DayOrder: 'Day',
   GoodTillDate: 'Good till date',
}

function Field({ id, label, hint, children }: { id: string, label: string, hint?: string, children: ReactNode }) {
   return (
      <div className="grid gap-1.5">
         <Label htmlFor={id}>{label}</Label>
         {children}
         {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
   )
}

function Choice<T extends string>({ id, value, options, onChange }: { id: string, value: T, options: { value: T, label: string }[], onChange: (value: T) => void }) {
   return (
      <Select value={value} onValueChange={next => onChange(next as T)}>
         <SelectTrigger id={id} className="w-full">
            <SelectValue />
         </SelectTrigger>
         <SelectContent>
            {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
         </SelectContent>
      </Select>
   )
}

interface LadderFormCardProps {
   form: LadderForm
   busy: boolean
   onChange: (change: Partial<LadderForm>) => void
   onSubmit: () => void
}

export function LadderFormCard({ form, busy, onChange, onSubmit }: LadderFormCardProps) {
   const underlying = form.levelKind === 'underlying'
   const submit = (event: FormEvent) => {
      event.preventDefault()
      onSubmit()
   }

   return (
      <Card>
         <CardHeader>
            <CardTitle>Ladder of limit orders</CardTitle>
            <CardDescription>Orders spread evenly between two prices, with the total split equally.</CardDescription>
         </CardHeader>
         <CardContent>
            <form className="grid gap-4" onSubmit={submit}>
               <div className="grid grid-cols-[1fr_auto] gap-3">
                  <Field id="symbol" label="Symbol">
                     <Input id="symbol" value={form.symbol} placeholder="IB1T:xswx" autoComplete="off" onChange={event => onChange({ symbol: event.target.value })} />
                  </Field>
                  <Field id="side" label="Side">
                     <Choice id="side" value={form.side} options={SIDES.map(side => ({ value: side, label: side }))} onChange={side => onChange({ side })} />
                  </Field>
               </div>
               <Field id="level-kind" label="Low and high are">
                  <Choice
                     id="level-kind"
                     value={form.levelKind}
                     options={[{ value: 'price', label: 'Instrument prices' }, { value: 'underlying', label: 'Underlying levels, e.g. Bitcoin' }]}
                     onChange={levelKind => onChange({ levelKind })}
                  />
               </Field>
               <div className="grid grid-cols-2 gap-3">
                  <Field id="low" label="Low">
                     <Input id="low" inputMode="decimal" value={form.low} onChange={event => onChange({ low: event.target.value })} />
                  </Field>
                  <Field id="high" label="High">
                     <Input id="high" inputMode="decimal" value={form.high} onChange={event => onChange({ high: event.target.value })} />
                  </Field>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  {underlying && (
                     <Field id="underlying-now" label="Underlying now">
                        <Input id="underlying-now" inputMode="decimal" value={form.underlyingNow} onChange={event => onChange({ underlyingNow: event.target.value })} />
                     </Field>
                  )}
                  <Field id="price-now" label="Instrument price now" hint="Optional when Saxo has a quote.">
                     <Input id="price-now" inputMode="decimal" value={form.priceNow} onChange={event => onChange({ priceNow: event.target.value })} />
                  </Field>
               </div>
               <div className="grid grid-cols-[5rem_1fr_1fr] gap-3">
                  <Field id="orders" label="Orders">
                     <Input id="orders" inputMode="numeric" value={form.orders} onChange={event => onChange({ orders: event.target.value })} />
                  </Field>
                  <Field id="size-kind" label="Split">
                     <Choice
                        id="size-kind"
                        value={form.sizeKind}
                        options={[{ value: 'value', label: 'Total value' }, { value: 'amount', label: 'Total units' }]}
                        onChange={sizeKind => onChange({ sizeKind })}
                     />
                  </Field>
                  <Field id="total" label={form.sizeKind === 'value' ? 'Value' : 'Units'}>
                     <Input id="total" inputMode="decimal" value={form.total} onChange={event => onChange({ total: event.target.value })} />
                  </Field>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <Field id="duration" label="Duration">
                     <Choice
                        id="duration"
                        value={form.duration}
                        options={DURATIONS.map(duration => ({ value: duration, label: DURATION_LABELS[duration] }))}
                        onChange={duration => onChange({ duration })}
                     />
                  </Field>
                  {form.duration === 'GoodTillDate' && (
                     <Field id="expires" label="Until">
                        <Input id="expires" type="date" value={form.expires} onChange={event => onChange({ expires: event.target.value })} />
                     </Field>
                  )}
               </div>
               <div className="flex items-center gap-2">
                  <Checkbox id="allow-marketable" checked={form.allowMarketable} onCheckedChange={checked => onChange({ allowMarketable: checked === true })} />
                  <Label htmlFor="allow-marketable" className="font-normal">Allow orders that fill immediately</Label>
               </div>
               <Button type="submit" disabled={busy}>{busy ? 'Calculating…' : 'Preview'}</Button>
            </form>
         </CardContent>
      </Card>
   )
}
