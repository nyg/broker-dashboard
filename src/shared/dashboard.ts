export type Optional<T> = { ok: true, value: T } | { ok: false, error: string }

export interface SessionStatus {
   loggedIn: boolean
   accessExpiresAt: number | null
   refreshExpiresAt: number | null
   refreshedAt: number | null
   error: string | null
}

export interface ClientSummary {
   name: string
   clientId: string
   currency: string
   decimals: number
}

export interface BalanceSummary {
   totalValue: number | null
   cash: number | null
   transactionsNotBooked: number | null
   cashAvailableForTrading: number | null
   positionsValue: number | null
   costToClosePositions: number | null
}

export interface MarginSummary {
   marginAndLoanUtilizationPct: number | null
   marginUtilizationPct: number | null
   collateralUtilizationPct: number | null
   collateralLoan: number | null
   collateralCreditLine: number | null
   marginAvailableForTrading: number | null
   marginUsedByCurrentPositions: number | null
   marginNetExposure: number | null
   marginExposureCoveragePct: number | null
   netEquityForMargin: number | null
   collateralAvailable: number | null
   initialMarginAvailable: number | null
   unrealizedMarginProfitLoss: number | null
}

export interface CollateralRow {
   symbol: string
   description: string
   marketValue: number | null
   collateralValue: number | null
}

export interface MarginRow {
   group: string
   instrument: string
   assetTypes: string
   margin: number | null
   isTotal: boolean
}

export interface AccountRow {
   accountId: string
   name: string
   type: string
   currency: string
   decimals: number
   cash: number | null
   totalValue: number | null
}

export interface PositionRow {
   symbol: string
   description: string
   assetType: string
   amount: number | null
   currency: string
   decimals: number
   averageOpenPrice: number | null
   currentPrice: number | null
   marketValue: number | null
   profitLoss: number | null
   profitLossInBaseCurrency: number | null
}

export interface OrderRow {
   orderId: string
   side: string
   amount: number | null
   symbol: string
   type: string
   price: number | null
   decimals: number
   duration: string
   status: string
}

export interface AllTimeProfitLoss {
   amount: number | null
   from: string
   thru: string
}

export interface ProfitLossSummary {
   unrealized: number | null
   positionsWithoutBaseCurrencyProfitLoss: number
   allTime: Optional<AllTimeProfitLoss>
}

export interface Dashboard {
   fetchedAt: string
   client: ClientSummary
   balance: BalanceSummary
   margin: MarginSummary
   collateral: CollateralRow[]
   marginByInstrument: Optional<MarginRow[]>
   accounts: AccountRow[]
   positions: PositionRow[]
   profitLoss: ProfitLossSummary
   orders: OrderRow[]
}
