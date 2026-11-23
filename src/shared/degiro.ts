export type DegiroProfile = 'custody' | 'basic' | 'active' | 'trader' | 'custom'

// Share of the value of shares and funds DEGIRO Switzerland lends against, by account profile:
// https://www.degiro.ch/en/investing/margin-loans. Other DEGIRO entities may differ: pick 'custom'.
export const PROFILE_CREDIT_PCT: Record<Exclude<DegiroProfile, 'custom'>, number> = {
   custody: 0,
   basic: 70,
   active: 33,
   trader: 70,
}

export const DEGIRO_PROFILES: DegiroProfile[] = ['custody', 'basic', 'active', 'trader', 'custom']

export interface DegiroSettings {
   profile: DegiroProfile | null
   customCreditPct: number | null
   creditOverrides: Record<string, number>
   portfolioRiskPct: number | null
}

export function defaultCreditPct({ profile, customCreditPct }: Pick<DegiroSettings, 'profile' | 'customCreditPct'>) {
   if (profile === null) {
      return null
   }
   return profile === 'custom' ? customCreditPct : PROFILE_CREDIT_PCT[profile]
}

export interface DegiroPosition {
   isin: string
   product: string
   quantity: number
   price: number | null
   priceDate: string | null
   priceVenue: string | null
   priceError: string | null
   value: number | null
   creditPct: number | null
   creditOverridePct: number | null
   collateralValue: number
}

export interface DegiroMargin {
   utilizationPct: number | null
   creditUtilizationPct: number | null
   marginUtilizationPct: number | null
   loan: number | null
   positionsValue: number
   collateralValue: number
   creditSurplus: number | null
   portfolioRisk: number | null
   marginSurplus: number | null
   positionsWithoutPrice: number
   positionsWithoutCredit: number
}

export interface DegiroDashboard {
   fetchedAt: string
   currency: string
   statementSavedAt: string
   newestBooking: string | null
   profile: DegiroProfile | null
   customCreditPct: number | null
   defaultCreditPct: number | null
   portfolioRiskPct: number | null
   cash: number | null
   cashError: string | null
   positions: DegiroPosition[]
   margin: DegiroMargin
}
