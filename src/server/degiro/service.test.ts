import { describe, expect, it, vi } from 'vitest'

import type { Optional } from '../../shared/dashboard.ts'
import type { DegiroSettings } from '../../shared/degiro.ts'
import type { Quote } from './quotes.ts'
import { DegiroInputError, DegiroService, toDegiroDashboard } from './service.ts'
import { STATEMENT } from './statement.fixture.ts'
import type { Statement } from './statement.ts'
import { type DegiroStore, EMPTY_SETTINGS, type SavedStatement } from './store.ts'

class MemoryStore implements DegiroStore {
   statement: SavedStatement | null
   settings: DegiroSettings

   constructor(csv: string | null, settings: Partial<DegiroSettings> = {}) {
      this.statement = csv === null ? null : { csv, savedAt: new Date('2025-02-05T08:00:00Z') }
      this.settings = { ...EMPTY_SETTINGS, ...settings }
   }

   async loadStatement() {
      return this.statement
   }

   async saveStatement(csv: string) {
      this.statement = { csv, savedAt: new Date() }
   }

   async loadSettings() {
      return structuredClone(this.settings)
   }

   async saveSettings(settings: DegiroSettings) {
      this.settings = settings
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

function settings(changes: Partial<DegiroSettings>): DegiroSettings {
   return { ...EMPTY_SETTINGS, ...changes }
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
   it('divides the loan by the share of the positions DEGIRO lends against', () => {
      // When
      const { margin, positions, defaultCreditPct } = toDegiroDashboard(
         STATEMENT_DATA,
         settings({ profile: 'basic', creditOverrides: { IE00B4K48X80: 0 } }),
         { quotes: new Map([['CH1416135338', quote(40)], ['IE00B4K48X80', quote(100)]]), cash: { ok: true, value: -1400 } },
         new Date(0),
         new Date(0),
      )

      // Then
      expect(defaultCreditPct).toBe(70)
      expect(positions.map(position => [position.value, position.creditPct, position.creditOverridePct, position.collateralValue]))
         .toEqual([[4000, 70, null, 2800], [1000, 0, 0, 0]])
      expect(margin).toEqual({
         utilizationPct: 50,
         creditUtilizationPct: 50,
         marginUtilizationPct: null,
         loan: 1400,
         positionsValue: 5000,
         collateralValue: 2800,
         creditSurplus: 1400,
         portfolioRisk: null,
         marginSurplus: null,
         positionsWithoutPrice: 0,
         positionsWithoutCredit: 0,
      })
   })

   it('shows the tighter of the credit and the portfolio risk tests', () => {
      // When
      const { margin } = toDegiroDashboard(
         STATEMENT_DATA,
         settings({ profile: 'basic', portfolioRiskPct: 40 }),
         { quotes: new Map([['CH1416135338', quote(40)], ['IE00B4K48X80', quote(100)]]), cash: { ok: true, value: -1400 } },
         new Date(0),
         new Date(0),
      )

      // Then
      expect(margin).toMatchObject({
         creditUtilizationPct: 40,
         creditSurplus: 2100,
         portfolioRisk: 2000,
         marginSurplus: 1600,
      })
      expect(margin.marginUtilizationPct).toBeCloseTo(1400 / 3000 * 100)
      expect(margin.utilizationPct).toBe(margin.marginUtilizationPct)
   })

   it.each([
      ['active', null, 33],
      ['trader', null, 70],
      ['custody', null, 0],
      ['custom', 50, 50],
      ['custom', null, null],
      [null, 50, null],
   ] as const)('lends against %s profile positions with custom credit %s at %s%%', (profile, customCreditPct, expected) => {
      // When
      const { defaultCreditPct } = toDegiroDashboard(
         STATEMENT_DATA,
         settings({ profile, customCreditPct }),
         { quotes: new Map(), cash: { ok: true, value: 0 } },
         new Date(0),
         new Date(0),
      )

      // Then
      expect(defaultCreditPct).toBe(expected)
   })

   it('counts a position without a credit percentage or a price as no collateral, so the estimate errs high', () => {
      // When
      const { margin, positions } = toDegiroDashboard(
         STATEMENT_DATA,
         settings({ creditOverrides: { IE00B4K48X80: 70 } }),
         { quotes: new Map([['CH1416135338', quote(40)], ['IE00B4K48X80', { ok: false, error: 'justETF answered HTTP 404' }]]), cash: { ok: true, value: -100 } },
         new Date(0),
         new Date(0),
      )

      // Then
      expect(positions[1]).toMatchObject({ value: null, collateralValue: 0, priceError: 'justETF answered HTTP 404' })
      expect(margin).toMatchObject({ utilizationPct: null, collateralValue: 0, positionsWithoutPrice: 1, positionsWithoutCredit: 1 })
   })

   it('shows no utilisation without a loan', () => {
      // When
      const { margin } = toDegiroDashboard(STATEMENT_DATA, EMPTY_SETTINGS, { quotes: new Map(), cash: { ok: true, value: 250 } }, new Date(0), new Date(0))

      // Then
      expect(margin).toMatchObject({ utilizationPct: 0, loan: 0, creditSurplus: 250 })
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
      const dashboard = await service(new MemoryStore(STATEMENT, { profile: 'basic' }), quotes).dashboard()

      // Then
      expect(quotes).toHaveBeenCalledWith('CH1416135338', 'CHF')
      expect(quotes).toHaveBeenCalledWith('IE00B4K48X80', 'CHF')
      expect(dashboard).toMatchObject({
         currency: 'CHF',
         profile: 'basic',
         cash: -3000 + 5 * 0.9,
         statementSavedAt: '2025-02-05T08:00:00.000Z',
         newestBooking: '2025-02-04',
      })
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

   it('saves the profile and the custom credit percentage', async () => {
      // Given
      const store = new MemoryStore(STATEMENT, { profile: 'basic', creditOverrides: { IE00B4K48X80: 0 } })

      // When
      await service(store).updateSettings({ profile: 'custom', customCreditPct: 60, portfolioRiskPct: 150 })

      // Then
      expect(store.settings).toEqual({ profile: 'custom', customCreditPct: 60, creditOverrides: { IE00B4K48X80: 0 }, portfolioRiskPct: 150 })
   })

   it('sets and clears credit overrides', async () => {
      // Given
      const store = new MemoryStore(STATEMENT, { profile: 'basic', creditOverrides: { CH1416135338: 50 } })
      const degiro = service(store)

      // When
      await Promise.all([degiro.setCreditOverride('IE00B4K48X80', 0), degiro.setCreditOverride('CH1416135338', null)])

      // Then
      expect(store.settings).toEqual({ profile: 'basic', customCreditPct: null, creditOverrides: { IE00B4K48X80: 0 }, portfolioRiskPct: null })
   })

   it.each([[-1], [101], ['20'], [Number.NaN]])('refuses %s as a credit percentage', async creditPct => {
      // When
      const set = service(new MemoryStore(STATEMENT)).setCreditOverride('IE00B4K48X80', creditPct)
      const update = service(new MemoryStore(STATEMENT)).updateSettings({ customCreditPct: creditPct })

      // Then
      await expect(set).rejects.toThrow(DegiroInputError)
      await expect(update).rejects.toThrow(DegiroInputError)
   })

   it.each([[-1], [1001], ['36.7']])('refuses %s as a portfolio risk percentage', async portfolioRiskPct => {
      // When
      const update = service(new MemoryStore(STATEMENT)).updateSettings({ portfolioRiskPct })

      // Then
      await expect(update).rejects.toThrow(DegiroInputError)
   })

   it('refuses an unknown profile', async () => {
      // When
      const update = service(new MemoryStore(STATEMENT)).updateSettings({ profile: 'daytrader' })

      // Then
      await expect(update).rejects.toThrow(DegiroInputError)
   })

   it('refuses a credit override for something that is not an ISIN', async () => {
      // When
      const set = service(new MemoryStore(STATEMENT)).setCreditOverride('../settings', 10)

      // Then
      await expect(set).rejects.toThrow(DegiroInputError)
   })
})
