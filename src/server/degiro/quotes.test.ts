import { describe, expect, it, vi } from 'vitest'

import { cached, frankfurterRates, justEtfQuotes } from './quotes.ts'

describe('justEtfQuotes', () => {
   it('reads the latest quote in the requested currency', async () => {
      // Given
      const fetchJson = vi.fn(async () => ({ latestQuote: { raw: 52.54 }, latestQuoteDate: '2026-11-23', quoteTradingVenue: 'XETRA' }))

      // When
      const quote = await justEtfQuotes(fetchJson)('IE00BMFKG444', 'CHF')

      // Then
      expect(fetchJson).toHaveBeenCalledWith('https://www.justetf.com/api/etfs/IE00BMFKG444/quote?locale=en&currency=CHF')
      expect(quote).toEqual({ price: 52.54, date: '2026-11-23', venue: 'XETRA' })
   })

   it('fails when justETF returns no price', async () => {
      // When
      const quote = justEtfQuotes(async () => ({}))('IE00BMFKG444', 'CHF')

      // Then
      await expect(quote).rejects.toThrow('justETF returned no price')
   })
})

describe('frankfurterRates', () => {
   it('reads the latest rate between two currencies', async () => {
      // Given
      const fetchJson = vi.fn(async () => ({ amount: 1, base: 'EUR', rates: { CHF: 0.93 } }))

      // When
      const rate = await frankfurterRates(fetchJson)('EUR', 'CHF')

      // Then
      expect(fetchJson).toHaveBeenCalledWith('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=CHF')
      expect(rate).toBe(0.93)
   })
})

describe('cached', () => {
   it('reuses a value until it expires', async () => {
      // Given
      let now = 0
      const load = vi.fn(async (isin: string) => `${isin}@${now}`)
      const get = cached(load, 1000, () => now)

      // When
      const first = await get('A')
      now = 999
      const second = await get('A')
      now = 1000
      const third = await get('A')

      // Then
      expect([first, second, third]).toEqual(['A@0', 'A@0', 'A@1000'])
      expect(load).toHaveBeenCalledTimes(2)
   })

   it('forgets a failure, so the next call tries again', async () => {
      // Given
      const load = vi.fn<(isin: string) => Promise<string>>()
         .mockRejectedValueOnce(new Error('HTTP 503'))
         .mockResolvedValueOnce('ok')
      const get = cached(load, 1000, () => 0)

      // When
      await expect(get('A')).rejects.toThrow('HTTP 503')
      const second = await get('A')

      // Then
      expect(second).toBe('ok')
   })
})
