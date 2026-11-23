import { describe, expect, it } from 'vitest'

import { type SaxoSnapshot, toDashboard } from './dashboard.ts'
import type { SaxoBalance } from './saxo-types.ts'

function snapshot(balance: SaxoBalance): SaxoSnapshot {
   return {
      user: { Name: 'Test Client' },
      client: { ClientId: '1', ClientKey: 'key', DefaultCurrency: 'CHF' },
      balance: { Currency: 'CHF', CurrencyDecimals: 2, ...balance },
      accounts: [],
      positions: [
         { NetPositionView: { ProfitLossOnTradeInBaseCurrency: 120.5 } },
         { NetPositionView: { ProfitLossOnTradeInBaseCurrency: -20.5 } },
         { NetPositionView: {} },
      ],
      marginOverview: { ok: false, error: 'unavailable (HTTP 404)' },
      performance: { ok: true, value: { AccumulatedProfitLoss: 900, InceptionDay: '2025-03-17T00:00:00Z', Thru: '2026-11-22T00:00:00Z' } },
      keyFigures: { ok: true, value: { KeyFigures: { ReturnFraction: -0.0424 } } },
      orders: [],
   }
}

describe('toDashboard', () => {
   it('uses the combined margin and loan utilisation Saxo returns', () => {
      // When
      const { margin } = toDashboard(snapshot({
         MarginAndCollateralUtilizationPct: 42,
         MarginUtilizationPct: 10,
         CollateralCreditValue: { Line: 29924.83, UtilizationPct: 42 },
         CollateralLoan: 5000,
      }), new Date(0))

      // Then
      expect(margin).toMatchObject({
         marginAndLoanUtilizationPct: 42,
         marginUtilizationPct: 10,
         collateralUtilizationPct: 42,
         collateralLoan: 5000,
         collateralCreditLine: 29924.83,
      })
   })

   it('shows transactions not booked only when Saxo returns them', () => {
      // When
      const withPending = toDashboard(snapshot({ TransactionsNotBooked: -5008.71 }), new Date(0))
      const without = toDashboard(snapshot({}), new Date(0))

      // Then
      expect(withPending.balance.transactionsNotBooked).toBe(-5008.71)
      expect(without.balance.transactionsNotBooked).toBeNull()
   })

   it('sums the base-currency P/L and counts positions without one', () => {
      // When
      const { profitLoss } = toDashboard(snapshot({}), new Date(0))

      // Then
      expect(profitLoss).toEqual({
         unrealized: 100,
         unrealizedPct: null,
         positionsWithoutBaseCurrencyProfitLoss: 1,
         allTime: { ok: true, value: { amount: 900, returnPct: -4.24, thru: '2026-11-22' } },
      })
   })

   it('lists what each position counts for as collateral', () => {
      // When
      const { collateral } = toDashboard(snapshot({
         MarginCollateralNotAvailableDetail: {
            InstrumentCollateralDetails: [{ Symbol: 'XNAS:xswx', Description: 'Xtrackers NASDAQ 100', MarketValue: 5549.25, MaintenanceCollateral: 5284.55 }],
         },
      }), new Date(0))

      // Then
      expect(collateral).toEqual([{ symbol: 'XNAS:xswx', description: 'Xtrackers NASDAQ 100', marketValue: 5549.25, collateralValue: 5284.55 }])
   })

   it('rebuilds the price and market value Saxo leaves out without a price feed', () => {
      // Given
      const data = snapshot({})
      data.positions = [{
         NetPositionBase: { Amount: 921 },
         NetPositionView: {
            AverageOpenPrice: 5.434,
            CurrentPrice: 0,
            MarketValueOpen: -5004.71,
            MarketValueOpenInBaseCurrency: -5004.71,
            ProfitLossOnTrade: -143.68,
            ProfitLossOnTradeInBaseCurrency: -143.68,
         },
      }]

      // When
      const { positions: [position], profitLoss } = toDashboard(data, new Date(0))

      // Then
      expect(position.currentPrice).toBeCloseTo(5.278, 3)
      expect(position.marketValue).toBeCloseTo(4861.03, 2)
      expect(position.profitLossPct).toBeCloseTo(-2.871, 3)
      expect(profitLoss.unrealizedPct).toBeCloseTo(-2.871, 3)
   })
})
