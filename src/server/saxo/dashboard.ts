import type { Dashboard, MarginRow, Optional } from '../../shared/dashboard.ts'
import { marginAndLoanUtilization } from '../../shared/margin.ts'
import { type Query, type SaxoApi,SaxoApiError } from './saxo-api.ts'
import type {
   SaxoAccount,
   SaxoBalance,
   SaxoClient,
   SaxoMarginOverview,
   SaxoNetPosition,
   SaxoOrder,
   SaxoPerformanceKeyFigures,
   SaxoPerformanceSummary,
   SaxoUser,
} from './saxo-types.ts'

const POSITION_FIELD_GROUPS = 'NetPositionBase,NetPositionView,DisplayAndFormat'

export interface SaxoSnapshot {
   user: SaxoUser
   client: SaxoClient
   balance: SaxoBalance
   accounts: { account: SaxoAccount, balance: SaxoBalance }[]
   positions: SaxoNetPosition[]
   marginOverview: Optional<SaxoMarginOverview>
   performance: Optional<SaxoPerformanceSummary>
   keyFigures: Optional<SaxoPerformanceKeyFigures>
   orders: SaxoOrder[]
}

async function optional<T>(request: Promise<T>): Promise<Optional<T>> {
   try {
      return { ok: true, value: await request }
   } catch (error) {
      if (error instanceof SaxoApiError) {
         return { ok: false, error: `unavailable (HTTP ${error.status})` }
      }
      throw error
   }
}

export async function fetchSnapshot(api: SaxoApi): Promise<SaxoSnapshot> {
   const [user, client] = await Promise.all([
      api.get<SaxoUser>('/port/v1/users/me'),
      api.get<SaxoClient>('/port/v1/clients/me'),
   ])
   const byClient: Query = { ClientKey: client.ClientKey }
   const [balance, accounts, positions, marginOverview, performance, keyFigures, orders] = await Promise.all([
      api.get<SaxoBalance>('/port/v1/balances/me'),
      api.getAll<SaxoAccount>('/port/v1/accounts/me'),
      api.getAll<SaxoNetPosition>('/port/v1/netpositions/me', { FieldGroups: POSITION_FIELD_GROUPS }),
      optional(api.get<SaxoMarginOverview>('/port/v1/balances/marginoverview', byClient)),
      optional(api.get<SaxoPerformanceSummary>('/hist/v4/performance/summary', { ...byClient, StandardPeriod: 'AllTime' })),
      optional(api.get<SaxoPerformanceKeyFigures>('/hist/v4/performance/timeseries', { ...byClient, StandardPeriod: 'AllTime', FieldGroups: 'KeyFigures' })),
      api.getAll<SaxoOrder>('/port/v1/orders/me', { FieldGroups: 'DisplayAndFormat' }),
   ])
   const accountBalances = await Promise.all(accounts.map(async account => ({
      account,
      balance: await api.get<SaxoBalance>('/port/v1/balances', { ...byClient, AccountKey: account.AccountKey }),
   })))
   return { user, client, balance, accounts: accountBalances, positions, marginOverview, performance, keyFigures, orders }
}

function number(value: unknown) {
   return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function marginRows(overview: SaxoMarginOverview): MarginRow[] {
   return (overview.Groups ?? []).flatMap(group => [
      ...(group.Contributors ?? []).map(contributor => ({
         group: group.GroupType ?? '',
         instrument: contributor.InstrumentSpecifier || contributor.InstrumentDescription || '',
         assetTypes: (contributor.AssetTypes ?? []).join(', '),
         margin: number(contributor.Margin),
         isTotal: false,
      })),
      { group: group.GroupType ?? '', instrument: 'Total', assetTypes: '', margin: number(group.TotalMargin), isTotal: true },
   ])
}

function sum(values: number[]) {
   return values.reduce((total, value) => total + value, 0)
}

function percentOf(fraction: number | null) {
   return fraction === null ? null : fraction * 100
}

// Saxo returns CurrentPrice 0 and no market value when the account has no price feed for the
// instrument, yet still values the position: rebuild both from the opening value and the P/L.
function positionValues(position: SaxoNetPosition) {
   const view = position.NetPositionView ?? {}
   const amount = number(position.NetPositionBase?.Amount)
   const averageOpenPrice = number(view.AverageOpenPrice)
   const profitLoss = number(view.ProfitLossOnTrade)
   const openValue = number(view.MarketValueOpen)
   const costBasis = openValue === null ? null : -openValue
   const quotedPrice = number(view.CurrentPrice)
   const derivedPrice = amount && averageOpenPrice !== null && profitLoss !== null ? averageOpenPrice + profitLoss / amount : null
   return {
      averageOpenPrice,
      currentPrice: quotedPrice ? quotedPrice : derivedPrice,
      marketValue: costBasis !== null && profitLoss !== null ? costBasis + profitLoss : null,
      profitLoss,
      profitLossPct: costBasis && profitLoss !== null ? 100 * profitLoss / Math.abs(costBasis) : null,
   }
}

function unrealizedPct(positions: SaxoNetPosition[]) {
   const valued = positions.flatMap(position => {
      const profitLoss = number(position.NetPositionView?.ProfitLossOnTradeInBaseCurrency)
      const openValue = number(position.NetPositionView?.MarketValueOpenInBaseCurrency)
      return profitLoss === null || openValue === null ? [] : [{ profitLoss, cost: Math.abs(openValue) }]
   })
   const cost = sum(valued.map(item => item.cost))
   return cost ? 100 * sum(valued.map(item => item.profitLoss)) / cost : null
}

export function toDashboard(snapshot: SaxoSnapshot, fetchedAt: Date): Dashboard {
   const { balance, performance, keyFigures, marginOverview } = snapshot
   const positionsBasePnl = snapshot.positions.map(position => number(position.NetPositionView?.ProfitLossOnTradeInBaseCurrency))
   const knownBasePnl = positionsBasePnl.filter(value => value !== null)
   const marginUtilizationPct = number(balance.MarginUtilizationPct)
   const collateralUtilizationPct = number(balance.CollateralCreditValue?.UtilizationPct)

   return {
      fetchedAt: fetchedAt.toISOString(),
      client: {
         name: snapshot.user.Name ?? '',
         clientId: snapshot.client.ClientId ?? '',
         currency: balance.Currency ?? snapshot.client.DefaultCurrency ?? '',
         decimals: balance.CurrencyDecimals ?? 2,
      },
      balance: {
         totalValue: number(balance.TotalValue),
         cash: number(balance.CashBalance),
         transactionsNotBooked: number(balance.TransactionsNotBooked),
         cashAvailableForTrading: number(balance.CashAvailableForTrading),
         positionsValue: number(balance.NonMarginPositionsValue),
         costToClosePositions: number(balance.CostToClosePositions),
      },
      margin: {
         marginAndLoanUtilizationPct: marginAndLoanUtilization(
            number(balance.MarginAndCollateralUtilizationPct), marginUtilizationPct, collateralUtilizationPct),
         marginUtilizationPct,
         collateralUtilizationPct,
         collateralLoan: number(balance.CollateralLoan),
         collateralCreditLine: number(balance.CollateralCreditValue?.Line),
         marginAvailableForTrading: number(balance.MarginAvailableForTrading),
         marginUsedByCurrentPositions: number(balance.MarginUsedByCurrentPositions),
         marginNetExposure: number(balance.MarginNetExposure),
         marginExposureCoveragePct: number(balance.MarginExposureCoveragePct),
         netEquityForMargin: number(balance.NetEquityForMargin),
         collateralAvailable: number(balance.CollateralAvailable),
         initialMarginAvailable: number(balance.InitialMargin?.MarginAvailable),
         unrealizedMarginProfitLoss: number(balance.UnrealizedMarginProfitLoss),
      },
      collateral: (balance.MarginCollateralNotAvailableDetail?.InstrumentCollateralDetails ?? []).map(detail => ({
         symbol: detail.Symbol ?? '',
         description: detail.Description ?? '',
         marketValue: number(detail.MarketValue),
         collateralValue: number(detail.MaintenanceCollateral),
      })),
      marginByInstrument: marginOverview.ok ? { ok: true, value: marginRows(marginOverview.value) } : marginOverview,
      accounts: snapshot.accounts.map(({ account, balance: accountBalance }) => ({
         accountId: account.AccountId ?? '',
         name: account.DisplayName ?? '',
         type: account.AccountType ?? '',
         currency: account.Currency ?? '',
         decimals: accountBalance.CurrencyDecimals ?? 2,
         cash: number(accountBalance.CashBalance),
         totalValue: number(accountBalance.TotalValue),
      })),
      positions: snapshot.positions.map(position => ({
         symbol: position.DisplayAndFormat?.Symbol ?? '',
         description: position.DisplayAndFormat?.Description ?? '',
         assetType: position.NetPositionBase?.AssetType ?? '',
         amount: number(position.NetPositionBase?.Amount),
         currency: position.DisplayAndFormat?.Currency ?? '',
         decimals: position.DisplayAndFormat?.Decimals ?? 2,
         ...positionValues(position),
         profitLossInBaseCurrency: number(position.NetPositionView?.ProfitLossOnTradeInBaseCurrency),
      })),
      profitLoss: {
         unrealized: knownBasePnl.length ? sum(knownBasePnl) : null,
         unrealizedPct: unrealizedPct(snapshot.positions),
         positionsWithoutBaseCurrencyProfitLoss: positionsBasePnl.length - knownBasePnl.length,
         allTime: performance.ok
            ? {
               ok: true,
               value: {
                  amount: number(performance.value.AccumulatedProfitLoss),
                  returnPct: keyFigures.ok ? percentOf(number(keyFigures.value.KeyFigures?.ReturnFraction)) : null,
                  thru: (performance.value.Thru ?? '').slice(0, 10),
               },
            }
            : performance,
      },
      orders: snapshot.orders.map(order => ({
         orderId: order.OrderId ?? '',
         side: order.BuySell ?? '',
         amount: number(order.Amount),
         symbol: order.DisplayAndFormat?.Symbol ?? '',
         type: order.OpenOrderType ?? '',
         price: number(order.Price),
         decimals: order.DisplayAndFormat?.Decimals ?? 2,
         duration: order.Duration?.DurationType ?? '',
         status: order.Status ?? '',
      })),
   }
}
