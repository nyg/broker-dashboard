import { describe, expect, it } from 'vitest'

import type { LadderRequest } from '../../shared/ladder.ts'
import { SaxoApiError } from '../saxo-api.ts'
import { type LadderApi, LadderService, parseLadderRequest } from './service.ts'

const INSTRUMENT = { Identifier: 52705751, AssetType: 'Etn', Symbol: 'IB1T:xswx', Description: 'iShares Bitcoin ETN', CurrencyCode: 'CHF' }
const DETAILS = {
   IsTradable: true,
   TickSize: 0.001,
   AmountDecimals: 0,
   MinimumTradeSize: 1,
   LotSizeType: 'NotUsed',
   SupportedOrderTypeSettings: [{ OrderType: 'Limit', DurationTypes: ['DayOrder', 'GoodTillCancel', 'GoodTillDate'] }],
}
const QUOTE = { Quote: { Ask: 5.25, Bid: 5.24, Mid: 5.245, PriceTypeAsk: 'Delayed' }, PriceInfoDetails: { LastTraded: 5.245 } }
const NO_ACCESS = { Quote: { PriceTypeAsk: 'NoAccess' }, PriceInfoDetails: null }

interface FakeOptions {
   prices?: object
   failPlaceAt?: number
   precheckErrorAt?: number
}

class FakeApi implements LadderApi {
   readonly posts: { path: string, body: Record<string, unknown> }[] = []
   readonly #options: FakeOptions

   constructor(options: FakeOptions = {}) {
      this.#options = options
   }

   async get<T>(path: string): Promise<T> {
      const responses: Record<string, unknown> = {
         '/port/v1/clients/me': { ClientKey: 'ck', DefaultAccountKey: 'ak' },
         '/trade/v1/infoprices': this.#options.prices ?? QUOTE,
         '/port/v1/balances': { Currency: 'CHF', CashBalance: 7532.17, TransactionsNotBooked: -5008.71, CashAvailableForTrading: 27184.69 },
      }
      return (path.startsWith('/ref/v1/instruments/details/') ? DETAILS : responses[path]) as T
   }

   async getAll<T>(path: string): Promise<T[]> {
      const responses: Record<string, unknown[]> = {
         '/port/v1/accounts/me': [{ AccountKey: 'ak', AccountId: '80000/1' }],
         '/ref/v1/instruments': [INSTRUMENT, { ...INSTRUMENT, Identifier: 1, Symbol: 'IB1T:xetr', CurrencyCode: 'EUR' }],
      }
      return responses[path] as T[]
   }

   async post<T>(path: string, body: unknown): Promise<T> {
      this.posts.push({ path, body: body as Record<string, unknown> })
      const count = this.posts.filter(post => post.path === path).length
      const order = body as { Amount: number, OrderPrice: number }
      if (path.endsWith('/precheck')) {
         return (count === this.#options.precheckErrorAt
            ? { PreCheckResult: 'Ok', ErrorInfo: { ErrorCode: 'InsufficientCash', Message: 'Not enough cash' } }
            : { PreCheckResult: 'Ok', Cost: { Commission: 4 }, EstimatedTotalCost: order.Amount * order.OrderPrice + 4 }) as T
      }
      if (count === this.#options.failPlaceAt) {
         throw new SaxoApiError(400, path, JSON.stringify({ ErrorInfo: { ErrorCode: 'PriceNotInTickSizeIncrements', Message: 'Price not in tick size' } }))
      }
      return { OrderId: `500000${count}` } as T
   }

   placed() {
      return this.posts.filter(post => post.path === '/trade/v2/orders')
   }
}

const BASE: LadderRequest = {
   symbol: 'IB1T:xswx',
   low: '40000',
   high: '55000',
   orders: 10,
   sizeKind: 'value',
   total: '15000',
   underlyingNow: '95000',
   priceNow: null,
   side: 'Buy',
   duration: 'GoodTillCancel',
   expires: null,
   allowMarketable: false,
}

function service(api: FakeApi, ordersEnabled = true) {
   return new LadderService({ api, ordersEnabled, sleep: async () => {} })
}

describe('LadderService', () => {
   it('previews the ladder without sending anything to Saxo', async () => {
      // Given
      const api = new FakeApi()

      // When
      const preview = await service(api).preview(BASE)

      // Then
      expect(preview).toMatchObject({
         errors: [],
         accountId: '80000/1',
         instrument: { symbol: 'IB1T:xswx', currency: 'CHF' },
         reference: { priceNow: '5.245', source: 'saxo' },
      })
      expect(preview.planId).toEqual(expect.any(String))
      expect(preview.rungs).toHaveLength(10)
      expect(preview.warnings).toEqual([expect.stringContaining('exceeds your cash')])
      expect(api.posts).toEqual([])
   })

   it('places every order after a clean precheck and the typed confirmation', async () => {
      // Given
      const api = new FakeApi()
      const ladder = service(api)
      const { planId } = await ladder.preview(BASE)
      const precheck = await ladder.precheck(planId!)

      // When
      const result = await ladder.place(planId!, 'place 10')

      // Then
      expect(precheck.ok).toBe(true)
      expect(result.failure).toBeNull()
      expect(result.placed).toHaveLength(10)
      expect(api.placed()[0].body).toEqual({
         AccountKey: 'ak',
         Uic: 52705751,
         AssetType: 'Etn',
         BuySell: 'Buy',
         Amount: 494,
         OrderType: 'Limit',
         OrderPrice: 3.036,
         OrderDuration: { DurationType: 'GoodTillCancel' },
         ManualOrder: true,
         ExternalReference: `${result.batchId}-1`,
      })
   })

   it('places nothing without the exact confirmation', async () => {
      // Given
      const api = new FakeApi()
      const ladder = service(api)
      const { planId } = await ladder.preview(BASE)
      await ladder.precheck(planId!)

      // When
      const place = ladder.place(planId!, 'yes')

      // Then
      await expect(place).rejects.toThrow('Type "place 10" to confirm.')
      expect(api.placed()).toEqual([])
   })

   it('places nothing before a precheck', async () => {
      // Given
      const api = new FakeApi()
      const ladder = service(api)
      const { planId } = await ladder.preview(BASE)

      // When
      const place = ladder.place(planId!, 'place 10')

      // Then
      await expect(place).rejects.toThrow('Check the orders with Saxo again')
      expect(api.placed()).toEqual([])
   })

   it('reports a precheck error that Saxo returns with an Ok result', async () => {
      // Given
      const ladder = service(new FakeApi({ precheckErrorAt: 3 }))
      const { planId } = await ladder.preview(BASE)

      // When
      const precheck = await ladder.precheck(planId!)

      // Then
      expect(precheck.ok).toBe(false)
      expect(precheck.results[2].problem).toBe('InsufficientCash Not enough cash')
   })

   it('stops at the first failed order and never places the same plan twice', async () => {
      // Given
      const api = new FakeApi({ failPlaceAt: 4 })
      const ladder = service(api)
      const { planId } = await ladder.preview(BASE)
      await ladder.precheck(planId!)

      // When
      const result = await ladder.place(planId!, 'place 10')
      const again = ladder.place(planId!, 'place 10')

      // Then
      expect(result.placed).toHaveLength(3)
      expect(result.failure).toEqual({ number: 4, problem: 'HTTP 400: PriceNotInTickSizeIncrements Price not in tick size' })
      await expect(again).rejects.toThrow('expired or was already placed')
      expect(api.placed()).toHaveLength(4)
   })

   it('sends nothing to Saxo when orders are disabled', async () => {
      // Given
      const api = new FakeApi()
      const ladder = service(api, false)

      // When
      const preview = await ladder.preview(BASE)
      const precheck = ladder.precheck('any')

      // Then
      expect(preview).toMatchObject({ planId: null, ordersEnabled: false })
      await expect(precheck).rejects.toThrow('Orders are disabled')
      expect(api.posts).toEqual([])
   })

   it('sends the expiry date with good till date orders', async () => {
      // Given
      const api = new FakeApi()
      const ladder = service(api)
      const { planId } = await ladder.preview({ ...BASE, underlyingNow: null, low: '4', high: '5', orders: 2, total: '1000', duration: 'GoodTillDate', expires: '2026-12-31' })
      await ladder.precheck(planId!)

      // When
      await ladder.place(planId!, 'place 2')

      // Then
      expect(api.placed()[0].body.OrderDuration).toEqual({ DurationType: 'GoodTillDate', ExpirationDateTime: '2026-12-31', ExpirationDateContainsTime: false })
   })

   it('lists the candidates when a symbol matches several instruments', async () => {
      // When
      const preview = service(new FakeApi()).preview({ ...BASE, symbol: 'IB1T' })

      // Then
      await expect(preview).rejects.toMatchObject({
         message: expect.stringContaining('several instruments match'),
         candidates: [expect.objectContaining({ symbol: 'IB1T:xswx' }), expect.objectContaining({ symbol: 'IB1T:xetr' })],
      })
   })

   it('asks for the price now when Saxo has no quote in underlying mode', async () => {
      // When
      const preview = service(new FakeApi({ prices: NO_ACCESS })).preview(BASE)

      // Then
      await expect(preview).rejects.toThrow('Saxo returned no price for IB1T:xswx (NoAccess)')
   })

   it('uses the price entered by hand when Saxo has no quote', async () => {
      // When
      const preview = await service(new FakeApi({ prices: NO_ACCESS })).preview({ ...BASE, priceNow: '5.25' })

      // Then
      expect(preview.reference).toMatchObject({ priceNow: '5.25', source: 'manual' })
      expect(preview.errors).toEqual([])
   })
})

describe('parseLadderRequest', () => {
   it.each([
      [{ low: '5', high: '4' }, 'High must be above low.'],
      [{ orders: 1 }, 'Orders must be a whole number from 2 to 50.'],
      [{ total: '-3' }, 'Total must be a positive number.'],
      [{ duration: 'GoodTillDate', expires: null }, 'Good till date needs an expiry date.'],
      [{ side: 'Short' }, 'Side must be one of Buy, Sell.'],
   ])('refuses %o', (change, message) => {
      // When
      const parse = () => parseLadderRequest({ ...BASE, ...change })

      // Then
      expect(parse).toThrow(message)
   })
})
