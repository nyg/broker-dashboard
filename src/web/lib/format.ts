function decimalFormat(decimals: number) {
   return new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function money(value: number | null, decimals = 2) {
   return value === null ? '–' : decimalFormat(decimals).format(value)
}

export function percent(value: number | null, decimals = 1) {
   return value === null ? '–' : `${decimalFormat(decimals).format(value)}%`
}

export function moneyAndPercent(value: number | null, pct: number | null, decimals = 2) {
   return pct === null ? money(value, decimals) : `${money(value, decimals)} (${percent(pct, 2)})`
}

export function date(isoDate: string) {
   return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function quantity(value: number | null) {
   return value === null ? '–' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value)
}

export function time(value: number | string | null) {
   return value === null ? '–' : new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function signClass(value: number | null) {
   if (value === null || value === 0) {
      return ''
   }
   return value > 0 ? 'text-safe' : 'text-danger'
}
