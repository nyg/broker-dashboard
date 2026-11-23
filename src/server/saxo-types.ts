export interface SaxoUser {
   Name?: string
}

export interface SaxoClient {
   ClientId?: string
   ClientKey: string
   DefaultCurrency?: string
}

export interface SaxoLineStatus {
   Line?: number
   UtilizationPct?: number
}

export interface SaxoInstrumentCollateral {
   Symbol?: string
   Description?: string
   MarketValue?: number
   MaintenanceCollateral?: number
}

export interface SaxoBalance {
   Currency?: string
   CurrencyDecimals?: number
   TotalValue?: number
   CashBalance?: number
   TransactionsNotBooked?: number | null
   CashAvailableForTrading?: number
   NonMarginPositionsValue?: number
   CostToClosePositions?: number
   MarginAndCollateralUtilizationPct?: number
   MarginUtilizationPct?: number
   CollateralCreditValue?: SaxoLineStatus
   CollateralLoan?: number
   MarginAvailableForTrading?: number
   MarginUsedByCurrentPositions?: number
   MarginNetExposure?: number
   MarginExposureCoveragePct?: number
   NetEquityForMargin?: number
   CollateralAvailable?: number
   InitialMargin?: { MarginAvailable?: number }
   UnrealizedMarginProfitLoss?: number
   MarginCollateralNotAvailableDetail?: {
      InstrumentCollateralDetails?: SaxoInstrumentCollateral[]
   }
}

export interface SaxoAccount {
   AccountId?: string
   AccountKey: string
   DisplayName?: string | null
   AccountType?: string
   Currency?: string
}

export interface SaxoDisplayAndFormat {
   Symbol?: string
   Description?: string
   Currency?: string
   Decimals?: number
}

export interface SaxoNetPosition {
   NetPositionBase?: { AssetType?: string, Amount?: number }
   NetPositionView?: {
      AverageOpenPrice?: number
      CurrentPrice?: number
      MarketValue?: number
      ProfitLossOnTrade?: number
      ProfitLossOnTradeInBaseCurrency?: number
   }
   DisplayAndFormat?: SaxoDisplayAndFormat
}

export interface SaxoMarginOverview {
   Groups?: {
      GroupType?: string
      TotalMargin?: number
      Contributors?: {
         InstrumentSpecifier?: string
         InstrumentDescription?: string
         AssetTypes?: string[]
         Margin?: number
      }[]
   }[]
}

export interface SaxoPerformanceSummary {
   AccumulatedProfitLoss?: number
   InceptionDay?: string
   From?: string
   Thru?: string
}

export interface SaxoOrder {
   OrderId?: string
   BuySell?: string
   Amount?: number
   OpenOrderType?: string
   Price?: number
   Duration?: { DurationType?: string }
   Status?: string
   DisplayAndFormat?: SaxoDisplayAndFormat
}
