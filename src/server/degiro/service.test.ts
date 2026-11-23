import { describe, expect, it, vi } from 'vitest'

import type { Optional } from '../../shared/dashboard.ts'
import type { Quote } from './quotes.ts'
import { DegiroInputError, DegiroService, toDegiroDashboard } from './service.ts'
import { STATEMENT } from './statement.fixture.ts'
import type { Statement } from './statement.ts'
import type { DegiroStore, Haircuts, SavedStatement } from './store.ts'

class MemoryStore implements DegiroStore {
   statement: SavedStatement | null
   haircuts: Haircuts

   constructor(csv: string | null, haircuts: Haircuts = {}) {
      this.statement = csv === null ? null : { csv, savedAt: new Date('2025-02-05T08:00:00Z') }
      this.haircuts = haircuts
   }

   async loadStatement() {
      return this.statement
   }

   async saveStatement(csv: string) {
      this.statement = { csv, savedAt: new Date() }
   }

   async loadHaircuts() {
      return { ...this.haircuts }
   }

   async saveHaircuts(haircuts: Haircuts) {
      this.haircuts = haircuts
   }
}

const STATEMENT_DATA: Statement = {
   currency: 'CHF',
   holdings: [
      { isin: 'CH1416135338', product: 'UBS CORE SPI', quantity: 100 },
      { isin: 'IE00B4K48X80', product: 'ISHARES CORE MSCI EUROPE', quantity: 10 },
   ],
   balances: [],
   newestBooking: '2025-02-04',
}

function quote(price: number): Optional<Quote> {
   return { ok: true, value: { price, date: '2025-02-05', venue: 'XETRA' } }
}

function service(store: MemoryStore, quotes = vi.fn(async (isin: string) => ({ price: isin === 'CH1416135338' ? 40 : 100, date: '2025-02-05', venue: 'XETRA' }))) {
   return new DegiroService({
      store,
      quotes,
      rates: async (from, to) => (from === 'EUR' && to === 'CHF' ? 0.9 : Promise.reject(new Error('no rate'))),
      now: () => new Date('2025-02-05T09:00:00Z'),
   })
}

describe('toDegiroDashboard', () => {
   it('divides the loan by the value DEGIRO lends against after haircuts', () => {
      // When
      const { margin, positions } = toDegiroDashboard(
         STATEMENT_DATA,
         { CH1416135338: 20, IE00B4K48X80: 50 },
         { quotes: new Map([['CH1416135338', quote(40)], ['IE00B4K48X80', quote(100)]]), cash: { ok: true, value: -2300 } },
         new Date(0),
         new Date(0),
      )

      // Then
      expect(positions.map(position => [position.value, position.collateralValue])).toEqual([[4000, 3200], [1000, 500]])
      expect(margin).toEqual({
         utilizationPct: 2300 / 3700 * 100,
         loan: 2300,
         positionsValue: 5000,
         collateralValue: 3700,
         freeSpace: 1400,
         positionsWithoutPrice: 0,
         positionsWithoutHaircut: 0,
      })
   })

   it('counts a position without a haircut or a price as no collateral, so the estimate errs high', () => {
      // When
      const { margin, positions } = toDegiroDashboard(
         STATEMENT_DATA,
         { IE00B4K48X80: 50 },
         { quotes: new Map([['CH1416135338', quote(40)], ['IE00B4K48X80', { ok: false, error: 'justETF answered HTTP 404' }]]), cash: { ok: true, value: -100 } },
         new Date(0),
         new Date(0),
      )

      // Then
      expect(positions[1]).toMatchObject({ value: null, collateralValue: 0, priceError: 'justETF answered HTTP 404' })
      expect(margin).toMatchObject({ utilizationPct: null, collateralValue: 0, positionsWithoutPrice: 1, positionsWithoutHaircut: 1 })
   })

   it('shows no utilisation without a loan', () => {
      // When
      const { margin } = toDegiroDashboard(STATEMENT_DATA, {}, { quotes: new Map(), cash: { ok: true, value: 250 } }, new Date(0), new Date(0))

      // Then
      expect(margin).toMatchObject({ utilizationPct: 0, loan: 0, freeSpace: 250 })
   })
})

describe('DegiroService', () => {
   it('shows nothing before a statement is uploaded', async () => {
      // When
      const dashboard = await service(new MemoryStore(null)).dashboard()

      // Then
      expect(dashboard).toBeNull()
   })

   it('prices the holdings in the account currency and converts cash held in other currencies', async () => {
      // Given
      const quotes = vi.fn(async (isin: string) => ({ price: isin === 'CH1416135338' ? 40 : 100, date: '2025-02-05', venue: 'XETRA' }))

      // When
      const dashboard = await service(new MemoryStore(STATEMENT, { CH1416135338: 20, IE00B4K48X80: 50 }), quotes).dashboard()

      // Then
      expect(quotes).toHaveBeenCalledWith('CH1416135338', 'CHF')
      expect(quotes).toHaveBeenCalledWith('IE00B4K48X80', 'CHF')
      expect(dashboard).toMatchObject({ currency: 'CHF', cash: -3000 + 5 * 0.9, statementSavedAt: '2025-02-05T08:00:00.000Z', newestBooking: '2025-02-04' })
      expect(dashboard?.margin.loan).toBeCloseTo(2995.5)
   })

   it('refuses a file that is not a statement and keeps the saved one', async () => {
      // Given
      const store = new MemoryStore(STATEMENT)

      // When
      const save = service(store).saveStatement('name,amount\nfoo,1\n')

      // Then
      await expect(save).rejects.toThrow(DegiroInputError)
      expect(store.statement?.csv).toBe(STATEMENT)
   })

   it('saves, changes and clears haircuts', async () => {
      // Given
      const store = new MemoryStore(STATEMENT, { CH1416135338: 20 })
      const degiro = service(store)

      // When
      await Promise.all([degiro.setHaircut('IE00B4K48X80', 50), degiro.setHaircut('CH1416135338', null)])

      // Then
      expect(store.haircuts).toEqual({ IE00B4K48X80: 50 })
   })

   it.each([[-1], [101], ['20'], [Number.NaN]])('refuses %s as a haircut', async haircutPct => {
      // When
      const set = service(new MemoryStore(STATEMENT)).setHaircut('IE00B4K48X80', haircutPct)

      // Then
      await expect(set).rejects.toThrow(DegiroInputError)
   })

   it('refuses a haircut for something that is not an ISIN', async () => {
      // When
      const set = service(new MemoryStore(STATEMENT)).setHaircut('../haircuts', 10)

      // Then
      await expect(set).rejects.toThrow(DegiroInputError)
   })
})
