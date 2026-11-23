export interface DegiroPosition {
   isin: string
   product: string
   quantity: number
   price: number | null
   priceDate: string | null
   priceVenue: string | null
   priceError: string | null
   value: number | null
   haircutPct: number | null
   collateralValue: number
}

export interface DegiroMargin {
   utilizationPct: number | null
   loan: number | null
   positionsValue: number
   collateralValue: number
   freeSpace: number | null
   positionsWithoutPrice: number
   positionsWithoutHaircut: number
}

export interface DegiroDashboard {
   fetchedAt: string
   currency: string
   statementSavedAt: string
   newestBooking: string | null
   cash: number | null
   cashError: string | null
   positions: DegiroPosition[]
   margin: DegiroMargin
}
