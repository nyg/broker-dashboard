export const SIDES = ['Buy', 'Sell'] as const
export const DURATIONS = ['GoodTillCancel', 'DayOrder', 'GoodTillDate'] as const
export const SIZE_KINDS = ['value', 'amount'] as const

export type Side = typeof SIDES[number]
export type Duration = typeof DURATIONS[number]
export type SizeKind = typeof SIZE_KINDS[number]

export interface LadderRequest {
   symbol: string
   low: string
   high: string
   orders: number
   sizeKind: SizeKind
   total: string
   underlyingNow: string | null
   priceNow: string | null
   side: Side
   duration: Duration
   expires: string | null
   allowMarketable: boolean
}

export interface InstrumentCandidate {
   symbol: string
   assetType: string
   description: string
}

export interface LadderRung {
   level: string
   price: string
   amount: string
   value: number
}

export interface LadderPreview {
   planId: string | null
   ordersEnabled: boolean
   instrument: InstrumentCandidate & { currency: string }
   accountId: string
   side: Side
   duration: Duration
   expires: string | null
   quote: { bid: number | null, ask: number | null, priceType: string | null }
   reference: { underlyingNow: string, priceNow: string, source: 'saxo' | 'manual', ratio: string } | null
   rungs: LadderRung[]
   totalAmount: string
   totalValue: number
   cash: { currency: string, cash: number | null, transactionsNotBooked: number | null, cashAvailableForTrading: number | null }
   errors: string[]
   warnings: string[]
}

export interface PrecheckResult {
   number: number
   problem: string | null
   commission: number | null
   estimatedTotalCost: number | null
}

export interface PrecheckResponse {
   ok: boolean
   results: PrecheckResult[]
}

export interface PlacedOrder {
   number: number
   orderId: string
   amount: string
   price: string
}

export interface PlaceResponse {
   batchId: string
   total: number
   placed: PlacedOrder[]
   failure: { number: number, problem: string } | null
}

export interface LadderError {
   error: string
   candidates?: InstrumentCandidate[]
}
