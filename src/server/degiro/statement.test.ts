import { describe, expect, it } from 'vitest'

import { STATEMENT } from './statement.fixture.ts'
import { readStatement, StatementError } from './statement.ts'

describe('readStatement', () => {
   it('reads the holdings, the balances and the account currency', () => {
      // When
      const statement = readStatement(STATEMENT)

      // Then
      expect(statement).toEqual({
         currency: 'CHF',
         holdings: expect.arrayContaining([
            { isin: 'CH1416135338', product: 'UBS CORE SPI', quantity: 100 },
            { isin: 'IE00B4K48X80', product: 'ISHARES CORE MSCI EUROPE', quantity: 10 },
         ]) as unknown,
         balances: [{ currency: 'CHF', amount: -3000 }, { currency: 'EUR', amount: 5 }],
         newestBooking: '2025-02-04',
      })
   })

   it('refuses a file that is not a statement', () => {
      // When
      const read = () => readStatement('name,amount\nfoo,1\n')

      // Then
      expect(read).toThrow(StatementError)
   })
})
