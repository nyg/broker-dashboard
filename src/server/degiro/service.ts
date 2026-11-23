import type { Optional } from '../../shared/dashboard.ts'
import type { DegiroDashboard, DegiroMargin, DegiroPosition } from '../../shared/degiro.ts'
import type { Quote, QuoteSource, RateSource } from './quotes.ts'
import { type Balance, type Holding, readStatement, type Statement, StatementError } from './statement.ts'
import type { DegiroStore, Haircuts } from './store.ts'

export class DegiroInputError extends Error {}

export interface DegiroPrices {
   quotes: Map<string, Optional<Quote>>
   cash: Optional<number>
}

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/

function errorMessage(error: unknown) {
   return error instanceof Error ? error.message : String(error)
}

function sum(values: number[]) {
   return values.reduce((total, value) => total + value, 0)
}

function toPosition(holding: Holding, haircutPct: number | null, quote: Optional<Quote> | undefined): DegiroPosition {
   const price = quote?.ok ? quote.value : null
   const value = price ? holding.quantity * price.price : null
   return {
      ...holding,
      price: price?.price ?? null,
      priceDate: price?.date ?? null,
      priceVenue: price?.venue ?? null,
      priceError: quote && !quote.ok ? quote.error : null,
      value,
      haircutPct,
      // A position without a price or a haircut counts for no collateral, so the estimate errs high.
      collateralValue: value !== null && haircutPct !== null ? value * (1 - haircutPct / 100) : 0,
   }
}

function toMargin(positions: DegiroPosition[], cash: number | null): DegiroMargin {
   const collateralValue = sum(positions.map(position => position.collateralValue))
   const loan = cash === null ? null : Math.max(0, -cash)
   let utilizationPct: number | null = null
   if (loan === 0) {
      utilizationPct = 0
   } else if (loan !== null && collateralValue > 0) {
      utilizationPct = 100 * loan / collateralValue
   }
   return {
      utilizationPct,
      loan,
      positionsValue: sum(positions.map(position => position.value ?? 0)),
      collateralValue,
      freeSpace: cash === null ? null : collateralValue + cash,
      positionsWithoutPrice: positions.filter(position => position.value === null).length,
      positionsWithoutHaircut: positions.filter(position => position.haircutPct === null).length,
   }
}

export function toDegiroDashboard(statement: Statement, haircuts: Haircuts, prices: DegiroPrices, savedAt: Date, now: Date): DegiroDashboard {
   const positions = statement.holdings.map(holding => toPosition(holding, haircuts[holding.isin] ?? null, prices.quotes.get(holding.isin)))
   const cash = prices.cash.ok ? prices.cash.value : null
   return {
      fetchedAt: now.toISOString(),
      currency: statement.currency,
      statementSavedAt: savedAt.toISOString(),
      newestBooking: statement.newestBooking,
      cash,
      cashError: prices.cash.ok ? null : prices.cash.error,
      positions,
      margin: toMargin(positions, cash),
   }
}

async function optional<T>(load: () => Promise<T>): Promise<Optional<T>> {
   try {
      return { ok: true, value: await load() }
   } catch (error) {
      return { ok: false, error: errorMessage(error) }
   }
}

async function netCash(balances: Balance[], currency: string, rates: RateSource) {
   const amounts = await Promise.all(balances
      .filter(balance => balance.amount !== 0)
      .map(async balance => (balance.currency === currency ? balance.amount : balance.amount * await rates(balance.currency, currency))))
   return sum(amounts)
}

export interface DegiroServiceOptions {
   store: DegiroStore
   quotes: QuoteSource
   rates: RateSource
   now?: () => Date
}

export class DegiroService {
   readonly #store: DegiroStore
   readonly #quotes: QuoteSource
   readonly #rates: RateSource
   readonly #now: () => Date
   #haircutWrites: Promise<unknown> = Promise.resolve()

   constructor(options: DegiroServiceOptions) {
      this.#store = options.store
      this.#quotes = options.quotes
      this.#rates = options.rates
      this.#now = options.now ?? (() => new Date())
   }

   async dashboard(): Promise<DegiroDashboard | null> {
      const saved = await this.#store.loadStatement()
      if (!saved) {
         return null
      }
      const statement = readStatement(saved.csv)
      const [haircuts, quotes, cash] = await Promise.all([
         this.#store.loadHaircuts(),
         Promise.all(statement.holdings.map(async ({ isin }) => [isin, await optional(() => this.#quotes(isin, statement.currency))] as const)),
         optional(() => netCash(statement.balances, statement.currency, this.#rates)),
      ])
      return toDegiroDashboard(statement, haircuts, { quotes: new Map(quotes), cash }, saved.savedAt, this.#now())
   }

   async saveStatement(csv: string) {
      try {
         readStatement(csv)
      } catch (error) {
         throw error instanceof StatementError ? new DegiroInputError(error.message) : error
      }
      await this.#store.saveStatement(csv)
   }

   async setHaircut(isin: string, haircutPct: unknown) {
      if (!ISIN.test(isin)) {
         throw new DegiroInputError(`${isin} is not an ISIN.`)
      }
      if (haircutPct !== null && (typeof haircutPct !== 'number' || !Number.isFinite(haircutPct) || haircutPct < 0 || haircutPct > 100)) {
         throw new DegiroInputError('The haircut must be a percentage from 0 to 100.')
      }
      const write = this.#haircutWrites.then(async () => {
         const others = Object.entries(await this.#store.loadHaircuts()).filter(([key]) => key !== isin)
         await this.#store.saveHaircuts(Object.fromEntries(haircutPct === null ? others : [...others, [isin, haircutPct]]))
      })
      this.#haircutWrites = write.catch(() => {})
      await write
   }
}
