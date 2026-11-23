import { useState } from 'react'

import { LadderFormCard } from '@/components/ladder/ladder-form'
import { LadderPreviewCard } from '@/components/ladder/ladder-preview'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ApiError, placeLadder, precheckLadder, previewLadder } from '@/lib/api'
import { EMPTY_FORM, type LadderForm, toRequest } from '@/lib/ladder-form'

import type { LadderPreview, PlaceResponse, PrecheckResponse } from '../../../shared/ladder.ts'

interface LadderState {
   preview: LadderPreview | null
   precheck: PrecheckResponse | null
   placed: PlaceResponse | null
   error: ApiError | null
   busy: 'preview' | 'precheck' | 'place' | null
}

const EMPTY_STATE: LadderState = { preview: null, precheck: null, placed: null, error: null, busy: null }

function apiError(error: unknown) {
   return error instanceof ApiError ? error : new ApiError(error instanceof Error ? error.message : String(error))
}

export function LadderPage({ onOrdersPlaced }: { onOrdersPlaced: () => void }) {
   const [form, setForm] = useState<LadderForm>(EMPTY_FORM)
   const [state, setState] = useState<LadderState>(EMPTY_STATE)

   function change(update: Partial<LadderForm>) {
      setForm(current => ({ ...current, ...update }))
      setState(current => current.busy ? current : EMPTY_STATE)
   }

   async function run<T>(busy: LadderState['busy'], request: () => Promise<T>, apply: (result: T) => Partial<LadderState>) {
      setState(current => ({ ...current, busy, error: null }))
      try {
         const result = await request()
         setState(current => ({ ...current, ...apply(result), busy: null }))
      } catch (error) {
         setState(current => ({ ...current, error: apiError(error), busy: null }))
      }
   }

   const preview = () => run('preview', () => previewLadder(toRequest(form)), result => ({ preview: result, precheck: null, placed: null }))
   const precheck = (planId: string) => run('precheck', () => precheckLadder(planId), result => ({ precheck: result }))
   const place = (planId: string, confirmation: string) => run('place', () => placeLadder(planId, confirmation), result => {
      onOrdersPlaced()
      return { placed: result }
   })

   return (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
         <LadderFormCard form={form} busy={state.busy === 'preview'} onChange={change} onSubmit={() => void preview()} />
         <div className="grid gap-4">
            {state.error && (
               <Alert variant="destructive">
                  <AlertTitle>{state.error.message}</AlertTitle>
                  {state.error.candidates.length > 0 && (
                     <AlertDescription className="flex flex-wrap gap-2 pt-2">
                        {state.error.candidates.map(candidate => (
                           <Button
                              key={`${candidate.symbol}-${candidate.assetType}`}
                              variant="outline"
                              size="sm"
                              title={candidate.description}
                              onClick={() => change({ symbol: candidate.symbol })}
                           >
                              {candidate.symbol} · {candidate.assetType}
                           </Button>
                        ))}
                     </AlertDescription>
                  )}
               </Alert>
            )}
            {state.preview && (
               <LadderPreviewCard
                  preview={state.preview}
                  precheck={state.precheck}
                  placed={state.placed}
                  busy={state.busy === 'precheck' || state.busy === 'place' ? state.busy : null}
                  onPrecheck={() => void precheck(state.preview!.planId!)}
                  onPlace={confirmation => void place(state.preview!.planId!, confirmation)}
               />
            )}
         </div>
      </div>
   )
}
