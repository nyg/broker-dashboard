import Big from 'big.js'

import type { Duration, Side } from '../../shared/ladder.ts'

export interface TickSizeScheme {
   DefaultTickSize?: number
   Elements?: { HighPrice: number, TickSize: number }[]
}

export interface InstrumentDetails {
   IsTradable?: boolean
   TickSize?: number
   TickSizeScheme?: TickSizeScheme
   Format?: { OrderDecimals?: number }
   AmountDecimals?: number
   LotSize?: number
   LotSizeType?: string
   MinimumTradeSize?: number
   MinimumLotSize?: number
   MinimumOrderValue?: number
   SupportedOrderTypeSettings?: { OrderType?: string, DurationTypes?: string[] }[]
}

export interface Rung {
   level: Big
   price: Big
   amount: Big
   value: Big
}

export interface Quote {
   Ask?: number
   Bid?: number
   Mid?: number
   PriceTypeAsk?: string
}

export interface PriceInfoDetails {
   LastTraded?: number
   LastClose?: number
}

export function decimalPlaces(value: Big) {
   return Math.max(0, value.c.length - 1 - value.e)
}

export function tickSize(details: InstrumentDetails, price: Big) {
   const scheme = details.TickSizeScheme
   if (scheme) {
      const elements = [...scheme.Elements ?? []].sort((a, b) => a.HighPrice - b.HighPrice)
      const element = elements.find(item => price.lte(item.HighPrice))
      if (element) {
         return new Big(element.TickSize)
      }
      if (scheme.DefaultTickSize) {
         return new Big(scheme.DefaultTickSize)
      }
   }
   if (details.TickSize) {
      return new Big(details.TickSize)
   }
   return new Big(10).pow(-(details.Format?.OrderDecimals ?? 2))
}

export function roundToTick(price: Big, tick: Big, side: Side) {
   const rounding = side === 'Buy' ? Big.roundDown : Big.roundUp
   return price.div(tick).round(0, rounding).times(tick)
}

// A price rounded with one band's tick can land in a lower band whose tick it is not a multiple of.
export function priceOnTick(rawPrice: Big, details: InstrumentDetails, side: Side) {
   const price = roundToTick(rawPrice, tickSize(details, rawPrice), side)
   const tick = tickSize(details, price)
   return price.mod(tick).eq(0) ? price : roundToTick(rawPrice, tick, side)
}

export function amountStep(details: InstrumentDetails) {
   if (details.LotSizeType && details.LotSizeType !== 'NotUsed' && details.LotSize) {
      return new Big(details.LotSize)
   }
   return new Big(10).pow(-(details.AmountDecimals ?? 0))
}

function floorToStep(value: Big, step: Big) {
   return value.div(step).round(0, Big.roundDown).times(step)
}

export interface LadderSize {
   totalValue?: Big
   totalAmount?: Big
}

export function buildLadder(low: Big, high: Big, count: number, side: Side, details: InstrumentDetails, size: LadderSize, ratio = new Big(1)) {
   const range = high.minus(low)
   const unitStep = amountStep(details)
   const rungs: Rung[] = []
   for (let index = 0; index < count; index++) {
      const level = low.plus(range.times(index).div(count - 1))
      const price = priceOnTick(level.times(ratio), details, side)
      const amount = size.totalValue
         ? price.gt(0) ? floorToStep(size.totalValue.div(count).div(price), unitStep) : new Big(0)
         : floorToStep((size.totalAmount ?? new Big(0)).div(count), unitStep)
      rungs.push({ level, price, amount, value: amount.times(price) })
   }
   return rungs.sort((a, b) => side === 'Buy' ? b.price.cmp(a.price) : a.price.cmp(b.price))
}

export function marketPrice(quote: Quote, side: Side) {
   const price = side === 'Buy' ? quote.Ask : quote.Bid
   return price && price > 0 ? new Big(price) : null
}

export function referencePrice(quote: Quote, details: PriceInfoDetails) {
   const price = quote.Mid || details.LastTraded || details.LastClose
   return price ? new Big(price) : null
}

export function checkLadder(rungs: Rung[], details: InstrumentDetails, market: Big | null, side: Side, allowMarketable: boolean) {
   const errors: string[] = []
   const warnings: string[] = []
   const prices = rungs.map(rung => rung.price.toString())
   if (new Set(prices).size < prices.length) {
      errors.push('Some orders share the same price after rounding to the tick size: widen the range or use fewer orders.')
   }
   rungs.forEach((rung, index) => {
      const number = index + 1
      if (rung.price.lte(0)) {
         errors.push(`Order ${number}: price ${rung.price} is not positive.`)
      } else if (rung.amount.lte(0)) {
         errors.push(`Order ${number}: the share of the total is too small for one unit at ${rung.price}.`)
      } else if (details.MinimumTradeSize && rung.amount.lt(details.MinimumTradeSize)) {
         errors.push(`Order ${number}: amount ${rung.amount} is below the minimum trade size ${details.MinimumTradeSize}.`)
      } else if (details.MinimumLotSize && rung.amount.lt(details.MinimumLotSize)) {
         errors.push(`Order ${number}: amount ${rung.amount} is below the minimum lot size ${details.MinimumLotSize}.`)
      } else if (details.MinimumOrderValue && rung.value.lt(details.MinimumOrderValue)) {
         errors.push(`Order ${number}: value ${rung.value} is below the minimum order value ${details.MinimumOrderValue}.`)
      }
   })
   if (market === null) {
      warnings.push('No current market price: cannot check whether some orders would fill immediately.')
   } else {
      const marketable = rungs.filter(rung => side === 'Buy' ? rung.price.gte(market) : rung.price.lte(market))
      if (marketable.length) {
         const message = `${marketable.length} order(s) are priced through the market (${market}) and would fill immediately.`
         if (allowMarketable) {
            warnings.push(message)
         } else {
            errors.push(`${message} Tick "Allow orders that fill immediately" if that is intended.`)
         }
      }
   }
   return { errors, warnings }
}

export function orderSettingsErrors(details: InstrumentDetails, duration: Duration) {
   if (details.IsTradable === false) {
      return ['This instrument is not tradable on your account.']
   }
   const settings = new Map((details.SupportedOrderTypeSettings ?? []).map(item => [item.OrderType, item.DurationTypes ?? []]))
   if (settings.size && !settings.has('Limit')) {
      return [`Limit orders are not supported for this instrument. Supported: ${[...settings.keys()].join(', ')}`]
   }
   const limitDurations = settings.get('Limit')
   if (limitDurations && !limitDurations.includes(duration)) {
      return [`${duration} is not supported for limit orders here. Supported: ${limitDurations.join(', ')}`]
   }
   return []
}

export interface OrderInstrument {
   uic: number
   assetType: string
}

export function orderBody(accountKey: string, instrument: OrderInstrument, rung: Rung, side: Side, duration: Duration, expires: string | null) {
   return {
      AccountKey: accountKey,
      Uic: instrument.uic,
      AssetType: instrument.assetType,
      BuySell: side,
      Amount: rung.amount.toNumber(),
      OrderType: 'Limit',
      OrderPrice: rung.price.toNumber(),
      OrderDuration: duration === 'GoodTillDate'
         ? { DurationType: duration, ExpirationDateTime: expires, ExpirationDateContainsTime: false }
         : { DurationType: duration },
      ManualOrder: true,
   }
}

export type OrderBody = ReturnType<typeof orderBody>
