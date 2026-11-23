import { DegiroError, type Movement, parseDegiroCsv, summarizePortfolio } from 'libdegiro'

export interface Holding {
   isin: string
   product: string
   quantity: number
}

export interface Balance {
   currency: string
   amount: number
}

export interface Statement {
   currency: string
   holdings: Holding[]
   balances: Balance[]
   newestBooking: string | null
}

export class StatementError extends Error {}

function parseMovements(csv: string) {
   try {
      return parseDegiroCsv(csv).movements
   } catch (error) {
      throw error instanceof DegiroError ? new StatementError(`This is not a DEGIRO Account.csv statement: ${error.message}`) : error
   }
}

export function readStatement(csv: string): Statement {
   const movements = parseMovements(csv)
   if (!movements.length) {
      throw new StatementError('The statement has no rows.')
   }
   const summary = summarizePortfolio(movements)
   return {
      currency: accountCurrency(movements),
      holdings: summary.positions
         .filter(position => position.quantity !== 0)
         .map(position => ({ isin: position.isin, product: position.product ?? position.isin, quantity: position.quantity })),
      balances: summary.cashByCurrency.map(balance => ({ currency: balance.currency, amount: balance.amount.toNumber() })),
      newestBooking: localDate(movements[0]?.record.bookingDate),
   }
}

// Deposits, fees and trades in the account currency all book in it, while a trade in another
// currency adds only the pair of rows that DEGIRO's automatic conversion cancels out.
function accountCurrency(movements: readonly Movement[]) {
   const rows = new Map<string, number>()
   for (const { record } of movements) {
      if (record.balance) {
         rows.set(record.balance.currency, (rows.get(record.balance.currency) ?? 0) + 1)
      }
   }
   return [...rows].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
}

function localDate(value: Date | undefined) {
   if (!value) {
      return null
   }
   const pad = (part: number) => String(part).padStart(2, '0')
   return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}
