import { randomUUID } from 'node:crypto'

import Big from 'big.js'

import {
   DURATIONS,
   type InstrumentCandidate,
   type LadderPreview,
   type LadderRequest,
   type LadderRung,
   type PlaceResponse,
   type PrecheckResponse,
   type PrecheckResult,
   SIDES,
   SIZE_KINDS,
} from '../../../shared/ladder.ts'
import { type SaxoApi,SaxoApiError } from '../saxo-api.ts'
import type { SaxoAccount, SaxoBalance } from '../saxo-types.ts'
import {
   buildLadder,
   checkLadder,
   decimalPlaces,
   type InstrumentDetails,
   marketPrice,
   type OrderBody,
   orderBody,
   orderSettingsErrors,
   type PriceInfoDetails,
   type Quote,
   referencePrice,
   type Rung,
   tickSize,
} from './ladder.ts'

const ASSET_TYPES = 'Stock,Etf,Etc,Etn'
export const MAX_ORDERS = 50
// Saxo allows one order request per second per session.
export const ORDER_INTERVAL_MS = 1100
const PLAN_TTL_MS = 15 * 60_000
const PRECHECK_TTL_MS = 5 * 60_000
const DECIMAL = /^\d+(\.\d+)?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export class LadderInputError extends Error {
   readonly candidates: InstrumentCandidate[] | undefined

   constructor(message: string, candidates?: InstrumentCandidate[]) {
      super(message)
      this.candidates = candidates
   }
}

export class LadderStateError extends Error {}

interface SaxoInstrument {
   Identifier: number
   AssetType: string
   Symbol?: string
   Description?: string
   CurrencyCode?: string
}

interface SaxoClientKeys {
   ClientKey: string
   DefaultAccountKey: string
}

interface SaxoInfoPrice {
   Quote?: Quote & { PriceTypeAsk?: string }
   PriceInfoDetails?: PriceInfoDetails | null
}

interface SaxoErrorInfo {
   ErrorCode?: string
   Message?: string
}

interface SaxoPrecheck {
   PreCheckResult?: string
   ErrorInfo?: SaxoErrorInfo
   Cost?: { Commission?: number }
   EstimatedTotalCost?: number
}

interface SaxoPlacedOrder {
   OrderId?: string
   ErrorInfo?: SaxoErrorInfo
}

interface Plan {
   bodies: OrderBody[]
   rungs: LadderRung[]
   createdAt: number
   precheckedAt: number | null
   busy: boolean
}

export type LadderApi = Pick<SaxoApi, 'get' | 'getAll' | 'post'>

export interface LadderServiceOptions {
   api: LadderApi
   ordersEnabled: boolean
   now?: () => number
   sleep?: (ms: number) => Promise<void>
}

function decimal(value: unknown, name: string) {
   const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
   if (!DECIMAL.test(text) || new Big(text).lte(0)) {
      throw new LadderInputError(`${name} must be a positive number.`)
   }
   return text
}

function optionalDecimal(value: unknown, name: string) {
   return value === null || value === undefined || value === '' ? null : decimal(value, name)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string) {
   if (!allowed.includes(value as T)) {
      throw new LadderInputError(`${name} must be one of ${allowed.join(', ')}.`)
   }
   return value as T
}

export function parseLadderRequest(input: unknown): LadderRequest {
   const body = (input ?? {}) as Record<string, unknown>
   const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : ''
   if (!symbol) {
      throw new LadderInputError('Enter a symbol, e.g. IB1T:xswx.')
   }
   const low = decimal(body.low, 'Low')
   const high = decimal(body.high, 'High')
   if (new Big(high).lte(low)) {
      throw new LadderInputError('High must be above low.')
   }
   const orders = Number(body.orders)
   if (!Number.isInteger(orders) || orders < 2 || orders > MAX_ORDERS) {
      throw new LadderInputError(`Orders must be a whole number from 2 to ${MAX_ORDERS}.`)
   }
   const duration = oneOf(body.duration, DURATIONS, 'Duration')
   const expires = typeof body.expires === 'string' && body.expires ? body.expires : null
   if (duration === 'GoodTillDate' && (!expires || !DATE.test(expires))) {
      throw new LadderInputError('Good till date needs an expiry date.')
   }
   return {
      symbol,
      low,
      high,
      orders,
      sizeKind: oneOf(body.sizeKind, SIZE_KINDS, 'Size'),
      total: decimal(body.total, 'Total'),
      underlyingNow: optionalDecimal(body.underlyingNow, 'Underlying now'),
      priceNow: optionalDecimal(body.priceNow, 'Price now'),
      side: oneOf(body.side, SIDES, 'Side'),
      duration,
      expires: duration === 'GoodTillDate' ? expires : null,
      allowMarketable: body.allowMarketable === true,
   }
}

function errorInfoText(info: SaxoErrorInfo) {
   return `${info.ErrorCode ?? ''} ${info.Message ?? ''}`.trim() || 'Saxo returned an error'
}

function failureText(error: unknown) {
   if (error instanceof SaxoApiError) {
      try {
         const details = JSON.parse(error.body) as SaxoErrorInfo & { ErrorInfo?: SaxoErrorInfo }
         return `HTTP ${error.status}: ${errorInfoText(details.ErrorInfo ?? details)}`
      } catch {
         return `HTTP ${error.status}: ${error.body.slice(0, 300)}`
      }
   }
   return error instanceof Error ? error.message : String(error)
}

function candidate(instrument: SaxoInstrument): InstrumentCandidate {
   return { symbol: instrument.Symbol ?? '', assetType: instrument.AssetType, description: instrument.Description ?? '' }
}

function finite(value: unknown) {
   return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function batchId(now: number) {
   return `ladder-${new Date(now).toISOString().replace(/[-:T]/g, '').slice(0, 14)}`
}

export class LadderService {
   readonly #api: LadderApi
   readonly #ordersEnabled: boolean
   readonly #now: () => number
   readonly #sleep: (ms: number) => Promise<void>
   readonly #plans = new Map<string, Plan>()

   constructor(options: LadderServiceOptions) {
      this.#api = options.api
      this.#ordersEnabled = options.ordersEnabled
      this.#now = options.now ?? Date.now
      this.#sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
   }

   async preview(request: LadderRequest): Promise<LadderPreview> {
      const client = await this.#api.get<SaxoClientKeys>('/port/v1/clients/me')
      const accountKey = client.DefaultAccountKey
      const [accounts, instrument] = await Promise.all([
         this.#api.getAll<SaxoAccount>('/port/v1/accounts/me'),
         this.#findInstrument(request.symbol),
      ])
      const accountId = accounts.find(account => account.AccountKey === accountKey)?.AccountId ?? accountKey
      const { Identifier: uic, AssetType: assetType } = instrument
      const [details, prices, balance] = await Promise.all([
         this.#api.get<InstrumentDetails>(`/ref/v1/instruments/details/${uic}/${assetType}`, {
            AccountKey: accountKey,
            FieldGroups: 'SupportedOrderTypeSettings',
         }),
         this.#api.get<SaxoInfoPrice>('/trade/v1/infoprices', {
            Uic: String(uic),
            AssetType: assetType,
            AccountKey: accountKey,
            FieldGroups: 'Quote,PriceInfoDetails',
         }),
         this.#api.get<SaxoBalance>('/port/v1/balances', { ClientKey: client.ClientKey, AccountKey: accountKey }),
      ])
      const settingsErrors = orderSettingsErrors(details, request.duration)
      if (settingsErrors.length) {
         throw new LadderInputError(settingsErrors.join(' '))
      }

      const quote = prices.Quote ?? {}
      const priceNow = request.priceNow ? new Big(request.priceNow) : referencePrice(quote, prices.PriceInfoDetails ?? {})
      let ratio = new Big(1)
      if (request.underlyingNow) {
         if (!priceNow) {
            throw new LadderInputError(`Saxo returned no price for ${instrument.Symbol} (${quote.PriceTypeAsk ?? 'no quote'}). Enter its price now.`)
         }
         ratio = priceNow.div(request.underlyingNow)
      }

      const size = request.sizeKind === 'value' ? { totalValue: new Big(request.total) } : { totalAmount: new Big(request.total) }
      const rungs = buildLadder(new Big(request.low), new Big(request.high), request.orders, request.side, details, size, ratio)
      const market = marketPrice(quote, request.side) ?? (request.priceNow ? new Big(request.priceNow) : null)
      const { errors, warnings } = checkLadder(rungs, details, market, request.side, request.allowMarketable)
      const totalValue = rungs.reduce((sum, rung) => sum.plus(rung.value), new Big(0))
      warnings.push(...this.#cashWarnings(balance, totalValue, request))

      const ladderRungs = rungs.map(rung => this.#rung(rung, details))
      const planId = errors.length || !this.#ordersEnabled
         ? null
         : this.#savePlan(rungs.map(rung => orderBody(accountKey, { uic, assetType }, rung, request.side, request.duration, request.expires)), ladderRungs)

      return {
         planId,
         ordersEnabled: this.#ordersEnabled,
         instrument: { ...candidate(instrument), currency: instrument.CurrencyCode ?? '' },
         accountId,
         side: request.side,
         duration: request.duration,
         expires: request.expires,
         quote: { bid: finite(quote.Bid), ask: finite(quote.Ask), priceType: quote.PriceTypeAsk ?? null },
         reference: request.underlyingNow && priceNow
            ? { underlyingNow: request.underlyingNow, priceNow: priceNow.toString(), source: request.priceNow ? 'manual' : 'saxo', ratio: ratio.toFixed(10) }
            : null,
         rungs: ladderRungs,
         totalAmount: rungs.reduce((sum, rung) => sum.plus(rung.amount), new Big(0)).toString(),
         totalValue: totalValue.toNumber(),
         cash: {
            currency: balance.Currency ?? '',
            cash: finite(balance.CashBalance),
            transactionsNotBooked: finite(balance.TransactionsNotBooked),
            cashAvailableForTrading: finite(balance.CashAvailableForTrading),
         },
         errors,
         warnings,
      }
   }

   async precheck(planId: string): Promise<PrecheckResponse> {
      const plan = this.#takePlan(planId)
      try {
         const results: PrecheckResult[] = []
         for (const [index, body] of plan.bodies.entries()) {
            if (index > 0) {
               await this.#sleep(ORDER_INTERVAL_MS)
            }
            results.push(await this.#precheckOne(index + 1, body))
         }
         const ok = results.every(result => result.problem === null)
         plan.precheckedAt = ok ? this.#now() : null
         return { ok, results }
      } finally {
         plan.busy = false
      }
   }

   async place(planId: string, confirmation: string): Promise<PlaceResponse> {
      const plan = this.#takePlan(planId)
      const total = plan.bodies.length
      if (plan.precheckedAt === null || plan.precheckedAt + PRECHECK_TTL_MS < this.#now()) {
         plan.busy = false
         throw new LadderStateError('Check the orders with Saxo again before placing them.')
      }
      if (confirmation.trim() !== `place ${total}`) {
         plan.busy = false
         throw new LadderStateError(`Type "place ${total}" to confirm.`)
      }
      // A plan is placed at most once, even when a later order fails.
      this.#plans.delete(planId)

      const id = batchId(this.#now())
      const placed: PlaceResponse['placed'] = []
      for (const [index, body] of plan.bodies.entries()) {
         const orderNumber = index + 1
         if (index > 0) {
            await this.#sleep(ORDER_INTERVAL_MS)
         }
         const problem = await this.#placeOne(body, `${id}-${orderNumber}`).then(
            orderId => {
               placed.push({ number: orderNumber, orderId, amount: plan.rungs[index].amount, price: plan.rungs[index].price })
               return null
            },
            (error: unknown) => failureText(error),
         )
         if (problem) {
            return { batchId: id, total, placed, failure: { number: orderNumber, problem } }
         }
      }
      return { batchId: id, total, placed, failure: null }
   }

   async #findInstrument(symbol: string) {
      const candidates = await this.#api.getAll<SaxoInstrument>('/ref/v1/instruments', {
         Keywords: symbol.split(':')[0],
         AssetTypes: ASSET_TYPES,
         IncludeNonTradable: 'false',
      })
      const wanted = symbol.toLowerCase()
      let matches = candidates.filter(item => item.Symbol?.toLowerCase() === wanted)
      if (!matches.length && !symbol.includes(':')) {
         matches = candidates.filter(item => item.Symbol?.toLowerCase().split(':')[0] === wanted)
      }
      if (matches.length === 1) {
         return matches[0]
      }
      const problem = matches.length ? 'several instruments match' : 'no instrument matches'
      throw new LadderInputError(`${symbol}: ${problem}. Pick the full symbol.`, candidates.slice(0, 20).map(candidate))
   }

   #rung(rung: Rung, details: InstrumentDetails): LadderRung {
      return {
         level: rung.level.toString(),
         price: rung.price.toFixed(decimalPlaces(tickSize(details, rung.price))),
         amount: rung.amount.toString(),
         value: rung.value.toNumber(),
      }
   }

   #cashWarnings(balance: SaxoBalance, totalValue: Big, request: LadderRequest) {
      const cash = finite(balance.CashBalance)
      if (request.side !== 'Buy' || cash === null) {
         return []
      }
      const afterSettlement = new Big(cash).plus(finite(balance.TransactionsNotBooked) ?? 0)
      return totalValue.gt(afterSettlement)
         ? [`The total exceeds your cash after pending settlements (${afterSettlement.toFixed(2)} ${balance.Currency ?? ''}): if every order fills, cash goes negative, which is borrowing when margin lending is on.`]
         : []
   }

   #savePlan(bodies: OrderBody[], rungs: LadderRung[]) {
      const now = this.#now()
      for (const [id, plan] of this.#plans) {
         if (plan.createdAt + PLAN_TTL_MS < now) {
            this.#plans.delete(id)
         }
      }
      const id = randomUUID()
      this.#plans.set(id, { bodies, rungs, createdAt: now, precheckedAt: null, busy: false })
      return id
   }

   #takePlan(planId: string) {
      if (!this.#ordersEnabled) {
         throw new LadderStateError('Orders are disabled on this server. Set ORDERS_ENABLED=true to allow them.')
      }
      const plan = this.#plans.get(planId)
      if (!plan || plan.createdAt + PLAN_TTL_MS < this.#now()) {
         throw new LadderStateError('This preview expired or was already placed. Preview the ladder again.')
      }
      if (plan.busy) {
         throw new LadderStateError('These orders are already being sent to Saxo.')
      }
      plan.busy = true
      return plan
   }

   async #precheckOne(orderNumber: number, body: OrderBody): Promise<PrecheckResult> {
      try {
         const response = await this.#api.post<SaxoPrecheck>('/trade/v2/orders/precheck', { ...body, FieldGroups: ['Costs'] })
         const problem = response.ErrorInfo
            ? errorInfoText(response.ErrorInfo)
            : response.PreCheckResult === 'Ok' ? null : response.PreCheckResult ?? 'no precheck result'
         return { number: orderNumber, problem, commission: finite(response.Cost?.Commission), estimatedTotalCost: finite(response.EstimatedTotalCost) }
      } catch (error) {
         return { number: orderNumber, problem: failureText(error), commission: null, estimatedTotalCost: null }
      }
   }

   async #placeOne(body: OrderBody, externalReference: string) {
      let response: SaxoPlacedOrder
      try {
         response = await this.#api.post<SaxoPlacedOrder>('/trade/v2/orders', { ...body, ExternalReference: externalReference })
      } catch (error) {
         if (error instanceof SaxoApiError) {
            throw error
         }
         throw new Error(`No answer from Saxo (${failureText(error)}): check the open orders before trying again.`, { cause: error })
      }
      if (response.ErrorInfo) {
         throw new Error(errorInfoText(response.ErrorInfo))
      }
      if (!response.OrderId) {
         throw new Error('No OrderId in the response: check the open orders before trying again.')
      }
      return response.OrderId
   }
}
