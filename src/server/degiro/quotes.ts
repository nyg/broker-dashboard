export interface Quote {
   price: number
   date: string | null
   venue: string | null
}

export type QuoteSource = (isin: string, currency: string) => Promise<Quote>

export type RateSource = (from: string, to: string) => Promise<number>

const TIMEOUT_MS = 10_000

interface JustEtfQuote {
   latestQuote?: { raw?: number }
   latestQuoteDate?: string
   quoteTradingVenue?: string
}

// justETF quotes ETFs and ETPs by ISIN in any currency, with no key. A fund that trades only
// where justETF has no feed comes back as its last published NAV, with venue "NAV".
export function justEtfQuotes(fetchJson = getJson): QuoteSource {
   return async (isin, currency) => {
      const query = new URLSearchParams({ locale: 'en', currency })
      const body = await fetchJson(`https://www.justetf.com/api/etfs/${encodeURIComponent(isin)}/quote?${query}`) as JustEtfQuote
      const price = body.latestQuote?.raw
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
         throw new Error('justETF returned no price')
      }
      return { price, date: body.latestQuoteDate ?? null, venue: body.quoteTradingVenue ?? null }
   }
}

interface FrankfurterRates {
   rates?: Record<string, number>
}

export function frankfurterRates(fetchJson = getJson): RateSource {
   return async (from, to) => {
      const query = new URLSearchParams({ base: from, symbols: to })
      const body = await fetchJson(`https://api.frankfurter.dev/v1/latest?${query}`) as FrankfurterRates
      const rate = body.rates?.[to]
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
         throw new Error(`Frankfurter returned no ${from}/${to} rate`)
      }
      return rate
   }
}

export function cached<Args extends string[], T>(load: (...args: Args) => Promise<T>, ttlMs: number, now = Date.now) {
   const entries = new Map<string, { at: number, value: Promise<T> }>()
   return (...args: Args) => {
      const key = args.join('\u0000')
      const entry = entries.get(key)
      if (entry && now() - entry.at < ttlMs) {
         return entry.value
      }
      const value = load(...args)
      const fresh = { at: now(), value }
      entries.set(key, fresh)
      value.catch(() => {
         if (entries.get(key) === fresh) {
            entries.delete(key)
         }
      })
      return value
   }
}

async function getJson(url: string): Promise<unknown> {
   const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
   if (!response.ok) {
      throw new Error(`${new URL(url).host} answered HTTP ${response.status}`)
   }
   return await response.json()
}
