import Big from 'big.js'
import { describe, expect, it } from 'vitest'

import { amountStep, buildLadder, checkLadder, type InstrumentDetails, priceOnTick, roundToTick, tickSize } from './ladder.ts'

const SIX: InstrumentDetails = {
   TickSizeScheme: {
      DefaultTickSize: 10,
      Elements: [
         { HighPrice: 1.9998, TickSize: 0.0002 },
         { HighPrice: 4.9995, TickSize: 0.0005 },
         { HighPrice: 9.999, TickSize: 0.001 },
         { HighPrice: 19.998, TickSize: 0.002 },
         { HighPrice: 49.995, TickSize: 0.005 },
      ],
   },
   AmountDecimals: 0,
   MinimumTradeSize: 1,
}

describe('tickSize', () => {
   it('picks the band of the price from an unsorted scheme', () => {
      // Given
      const details = { TickSizeScheme: { DefaultTickSize: 0.05, Elements: [{ HighPrice: 10, TickSize: 0.01 }, { HighPrice: 1, TickSize: 0.001 }] } }

      // When
      const ticks = ['0.5', '5', '50'].map(price => tickSize(details, new Big(price)).toString())

      // Then
      expect(ticks).toEqual(['0.001', '0.01', '0.05'])
   })

   it('falls back to the order decimals', () => {
      // When
      const tick = tickSize({ Format: { OrderDecimals: 3 } }, new Big(5))

      // Then
      expect(tick.toString()).toBe('0.001')
   })
})

describe('roundToTick', () => {
   it('rounds buys down and sells up', () => {
      // When
      const buy = roundToTick(new Big('2.20789'), new Big('0.001'), 'Buy')
      const sell = roundToTick(new Big('2.20711'), new Big('0.001'), 'Sell')

      // Then
      expect([buy.toString(), sell.toString()]).toEqual(['2.207', '2.208'])
   })
})

describe('priceOnTick', () => {
   it.each([
      ['19.999', 'Buy', '19.998'],
      ['19.9985', 'Sell', '20'],
      ['19.9979', 'Sell', '19.998'],
      ['4.99971', 'Buy', '4.999'],
      ['4.9996', 'Sell', '5'],
      ['2.20789', 'Buy', '2.2075'],
   ] as const)('puts %s (%s) on a SIX tick: %s', (raw, side, expected) => {
      // When
      const price = priceOnTick(new Big(raw), SIX, side)

      // Then
      expect(price.toString()).toBe(expected)
      expect(price.mod(tickSize(SIX, price)).eq(0)).toBe(true)
   })
})

describe('amountStep', () => {
   it('uses the lot size when lots are used, else the amount decimals', () => {
      // When
      const lot = amountStep({ LotSizeType: 'Fixed', LotSize: 10 })
      const decimals = amountStep({ AmountDecimals: 2 })

      // Then
      expect([lot.toString(), decimals.toString()]).toEqual(['10', '0.01'])
   })
})

describe('buildLadder', () => {
   it('splits a value over evenly spaced underlying levels, highest buy first', () => {
      // Given
      const ratio = new Big('5.25').div(95000)

      // When
      const rungs = buildLadder(new Big(40000), new Big(55000), 10, 'Buy', SIX, { totalValue: new Big(15000) }, ratio)

      // Then
      expect(rungs).toHaveLength(10)
      expect(rungs.map(rung => rung.level.toFixed(2))).toEqual([
         '55000.00', '53333.33', '51666.67', '50000.00', '48333.33', '46666.67', '45000.00', '43333.33', '41666.67', '40000.00',
      ])
      expect([rungs[0].price.toString(), rungs[0].amount.toString()]).toEqual(['3.039', '493'])
      expect([rungs[9].price.toString(), rungs[9].amount.toString()]).toEqual(['2.2105', '678'])
      expect(rungs.every(rung => rung.value.lte(1500))).toBe(true)
   })

   it('splits an amount and sorts sells from the lowest price', () => {
      // When
      const rungs = buildLadder(new Big(6), new Big(7), 4, 'Sell', SIX, { totalAmount: new Big(1003) })

      // Then
      expect(rungs.map(rung => [rung.price.toString(), rung.amount.toString()])).toEqual([
         ['6', '250'], ['6.334', '250'], ['6.667', '250'], ['7', '250'],
      ])
   })
})

describe('checkLadder', () => {
   it('refuses buys priced through the market unless allowed', () => {
      // Given
      const rungs = buildLadder(new Big(5), new Big(6), 5, 'Buy', SIX, { totalValue: new Big(5000) })

      // When
      const refused = checkLadder(rungs, SIX, new Big('5.25'), 'Buy', false)
      const allowed = checkLadder(rungs, SIX, new Big('5.25'), 'Buy', true)

      // Then
      expect(refused.errors).toEqual([expect.stringContaining('4 order(s) are priced through the market (5.25)')])
      expect(allowed).toEqual({ errors: [], warnings: [expect.stringContaining('would fill immediately')] })
   })

   it('refuses a range too narrow for distinct tick prices', () => {
      // Given
      const rungs = buildLadder(new Big('5.000'), new Big('5.004'), 10, 'Buy', SIX, { totalAmount: new Big(100) })

      // When
      const { errors } = checkLadder(rungs, SIX, null, 'Buy', false)

      // Then
      expect(errors).toEqual([expect.stringContaining('share the same price')])
   })

   it('warns when there is no market price to check against', () => {
      // Given
      const rungs = buildLadder(new Big(4), new Big(5), 2, 'Buy', SIX, { totalValue: new Big(1000) })

      // When
      const { warnings } = checkLadder(rungs, SIX, null, 'Buy', false)

      // Then
      expect(warnings).toEqual([expect.stringContaining('No current market price')])
   })
})
