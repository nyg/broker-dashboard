import { describe, expect, it } from 'vitest'

import { marginAndLoanUtilization, marginLevel } from './margin.ts'

describe('marginLevel', () => {
   it.each([
      [0, 'safe'],
      [49.9, 'safe'],
      [50, 'watch'],
      [74.9, 'watch'],
      [75, 'margin-call'],
      [99.9, 'margin-call'],
      [100, 'close-out'],
      [null, 'unknown'],
   ] as const)('rates %s%% as %s', (utilization, level) => {
      // When
      const result = marginLevel(utilization)

      // Then
      expect(result).toBe(level)
   })
})

describe('marginAndLoanUtilization', () => {
   it('prefers the combined figure Saxo returns', () => {
      // When
      const result = marginAndLoanUtilization(12, 40, 30)

      // Then
      expect(result).toBe(12)
   })

   it('falls back to the higher of margin and collateral utilisation', () => {
      // When
      const result = marginAndLoanUtilization(null, 20, null, 35)

      // Then
      expect(result).toBe(35)
   })
})
