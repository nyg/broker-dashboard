import type { Duration, LadderRequest, Side, SizeKind } from '../../shared/ladder.ts'

export type LevelKind = 'price' | 'underlying'

export interface LadderForm {
   symbol: string
   side: Side
   levelKind: LevelKind
   low: string
   high: string
   underlyingNow: string
   priceNow: string
   orders: string
   sizeKind: SizeKind
   total: string
   duration: Duration
   expires: string
   allowMarketable: boolean
}

export const EMPTY_FORM: LadderForm = {
   symbol: '',
   side: 'Buy',
   levelKind: 'price',
   low: '',
   high: '',
   underlyingNow: '',
   priceNow: '',
   orders: '10',
   sizeKind: 'value',
   total: '',
   duration: 'GoodTillCancel',
   expires: '',
   allowMarketable: false,
}

function decimal(text: string) {
   return text.replace(/[\s'’]/g, '').replace(',', '.')
}

export function toRequest(form: LadderForm): LadderRequest {
   const underlying = form.levelKind === 'underlying'
   return {
      symbol: form.symbol.trim(),
      low: decimal(form.low),
      high: decimal(form.high),
      orders: Number(form.orders),
      sizeKind: form.sizeKind,
      total: decimal(form.total),
      underlyingNow: underlying ? decimal(form.underlyingNow) : null,
      priceNow: decimal(form.priceNow) || null,
      side: form.side,
      duration: form.duration,
      expires: form.duration === 'GoodTillDate' ? form.expires : null,
      allowMarketable: form.allowMarketable,
   }
}
