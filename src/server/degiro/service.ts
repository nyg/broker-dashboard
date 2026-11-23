import type { Optional } from '../../shared/dashboard.ts'
import {
   defaultCreditPct,
   DEGIRO_PROFILES,
   type DegiroDashboard,
   type DegiroMargin,
   type DegiroPosition,
   type DegiroProfile,
   type DegiroSettings,
} from '../../shared/degiro.ts'
import type { Quote, QuoteSource, RateSource } from './quotes.ts'
import { type Balance, type Holding, readStatement, type Statement, StatementError } from './statement.ts'
import type { DegiroStore } from './store.ts'

export class DegiroInputError extends Error {}

export interface DegiroPrices {
   quotes: Map<string, Optional<Quote>>
   cash: Optional<number>
}

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/

// Short positions can make DEGIRO's portfolio risk several times the portfolio value.
const MAX_PORTFOLIO_RISK_PCT = 1000

function errorMessage(error: unknown) {
   return error instanceof Error ? error.message : String(error)
}

function sum(values: number[]) {
   return values.reduce((total, value) => total + value, 0)
}

function toPosition(holding: Holding, creditPct: number | null, creditOverridePct: number | null, quote: Optional<Quote> | undefined): DegiroPosition {
   const price = quote?.ok ? quote.value : null
   const value = price ? holding.quantity * price.price : null
   return {
      ...holding,
      price: price?.price ?? null,
      priceDate: price?.date ?? null,
      priceVenue: price?.venue ?? null,
      priceError: quote && !quote.ok ? quote.error : null,
      value,
      creditPct,
      creditOverridePct,
      // A position without a price or a credit percentage counts for no collateral, so the estimate errs high.
      collateralValue: value !== null && creditPct !== null ? value * creditPct / 100 : 0,
   }
}

function usedPct(loan: number | null, lendable: number) {
   if (loan === 0) {
      return 0
   }
   return loan !== null && lendable > 0 ? 100 * loan / lendable : null
}

function higher(...values: (number | null)[]) {
   const known = values.filter(value => value !== null)
   return known.length ? Math.max(...known) : null
}

// DEGIRO runs two tests and calls a margin call when either fails: the credit test lends a share of
// each position's value, and the margin test needs the positions plus cash to cover its portfolio risk.
function toMargin(positions: DegiroPosition[], cash: number | null, portfolioRiskPct: number | null): DegiroMargin {
   const positionsValue = sum(positions.map(position => position.value ?? 0))
   const collateralValue = sum(positions.map(position => position.collateralValue))
   const portfolioRisk = portfolioRiskPct === null ? null : positionsValue * portfolioRiskPct / 100
   const loan = cash === null ? null : Math.max(0, -cash)
   const creditUtilizationPct = usedPct(loan, collateralValue)
   const marginUtilizationPct = portfolioRisk === null ? null : usedPct(loan, positionsValue - portfolioRisk)
   return {
      utilizationPct: higher(creditUtilizationPct, marginUtilizationPct),
      creditUtilizationPct,
      marginUtilizationPct,
      loan,
      positionsValue,
      collateralValue,
      creditSurplus: cash === null ? null : collateralValue + cash,
      portfolioRisk,
      marginSurplus: cash === null || portfolioRisk === null ? null : positionsValue + cash - portfolioRisk,
      positionsWithoutPrice: positions.filter(position => position.value === null).length,
      positionsWithoutCredit: positions.filter(position => position.creditPct === null).length,
   }
}

export function toDegiroDashboard(statement: Statement, settings: DegiroSettings, prices: DegiroPrices, savedAt: Date, now: Date): DegiroDashboard {
   const fallbackPct = defaultCreditPct(settings)
   const positions = statement.holdings.map(holding => {
      const overridePct = settings.creditOverrides[holding.isin] ?? null
      return toPosition(holding, overridePct ?? fallbackPct, overridePct, prices.quotes.get(holding.isin))
   })
   const cash = prices.cash.ok ? prices.cash.value : null
   return {
      fetchedAt: now.toISOString(),
      currency: statement.currency,
      statementSavedAt: savedAt.toISOString(),
      newestBooking: statement.newestBooking,
      profile: settings.profile,
      customCreditPct: settings.customCreditPct,
      defaultCreditPct: fallbackPct,
      portfolioRiskPct: settings.portfolioRiskPct,
      cash,
      cashError: prices.cash.ok ? null : prices.cash.error,
      positions,
      margin: toMargin(positions, cash, settings.portfolioRiskPct),
   }
}

function percentOrNull(value: unknown, name: string, max = 100) {
   if (value === null) {
      return null
   }
   if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
      throw new DegiroInputError(`${name} must be a percentage from 0 to ${max}.`)
   }
   return value
}

function profileOrNull(value: unknown) {
   if (value !== null && !DEGIRO_PROFILES.includes(value as DegiroProfile)) {
      throw new DegiroInputError(`The profile must be one of ${DEGIRO_PROFILES.join(', ')}.`)
   }
   return value as DegiroProfile | null
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
   #settingsWrites: Promise<unknown> = Promise.resolve()

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
      const [settings, quotes, cash] = await Promise.all([
         this.#store.loadSettings(),
         Promise.all(statement.holdings.map(async ({ isin }) => [isin, await optional(() => this.#quotes(isin, statement.currency))] as const)),
         optional(() => netCash(statement.balances, statement.currency, this.#rates)),
      ])
      return toDegiroDashboard(statement, settings, { quotes: new Map(quotes), cash }, saved.savedAt, this.#now())
   }

   async saveStatement(csv: string) {
      try {
         readStatement(csv)
      } catch (error) {
         throw error instanceof StatementError ? new DegiroInputError(error.message) : error
      }
      await this.#store.saveStatement(csv)
   }

   async updateSettings(changes: Record<string, unknown>) {
      const update: Partial<DegiroSettings> = {}
      if ('profile' in changes) {
         update.profile = profileOrNull(changes.profile)
      }
      if ('customCreditPct' in changes) {
         update.customCreditPct = percentOrNull(changes.customCreditPct, 'The credit')
      }
      if ('portfolioRiskPct' in changes) {
         update.portfolioRiskPct = percentOrNull(changes.portfolioRiskPct, 'The portfolio risk', MAX_PORTFOLIO_RISK_PCT)
      }
      await this.#changeSettings(settings => ({ ...settings, ...update }))
   }

   async setCreditOverride(isin: string, creditPct: unknown) {
      if (!ISIN.test(isin)) {
         throw new DegiroInputError(`${isin} is not an ISIN.`)
      }
      const overridePct = percentOrNull(creditPct, 'The credit')
      await this.#changeSettings(settings => {
         const others = Object.entries(settings.creditOverrides).filter(([key]) => key !== isin)
         return { ...settings, creditOverrides: Object.fromEntries(overridePct === null ? others : [...others, [isin, overridePct]]) }
      })
   }

   async #changeSettings(change: (settings: DegiroSettings) => DegiroSettings) {
      const write = this.#settingsWrites.then(async () => this.#store.saveSettings(change(await this.#store.loadSettings())))
      this.#settingsWrites = write.catch(() => {})
      await write
   }
}
