import { MarginGauge } from '@/components/margin-gauge'
import { type Column, TableCard } from '@/components/table-card'
import { ValueListCard, type ValueRow } from '@/components/value-list-card'
import { date, money, moneyAndPercent, percent, quantity, signClass } from '@/lib/format'

import type { AccountRow, CollateralRow, Dashboard as DashboardData, MarginRow, OrderRow, PositionRow } from '../../shared/dashboard.ts'

const DESCRIPTION_WIDTH = 32

function short(text: string) {
   return text.length > DESCRIPTION_WIDTH ? `${text.slice(0, DESCRIPTION_WIDTH - 1)}…` : text
}

function balanceRows({ balance, client }: DashboardData): ValueRow[] {
   const amount = (value: number | null) => money(value, client.decimals)
   return [
      { label: 'Total value', value: amount(balance.totalValue), className: 'font-medium' },
      { label: 'Cash', value: amount(balance.cash) },
      ...(balance.transactionsNotBooked === null ? [] : [{ label: 'Transactions not booked', value: amount(balance.transactionsNotBooked) }]),
      { label: 'Cash available for trading', value: amount(balance.cashAvailableForTrading) },
      { label: 'Positions value', value: amount(balance.positionsValue) },
      { label: 'Cost to close positions', value: amount(balance.costToClosePositions) },
   ]
}

function profitLossRows({ profitLoss, client }: DashboardData): ValueRow[] {
   const { allTime } = profitLoss
   return [
      {
         label: 'Open positions, unrealized',
         hint: 'At current prices, before trading costs. The percentage is of what the positions cost.',
         value: moneyAndPercent(profitLoss.unrealized, profitLoss.unrealizedPct, client.decimals),
         className: signClass(profitLoss.unrealized),
      },
      ...(profitLoss.positionsWithoutBaseCurrencyProfitLoss
         ? [{ label: 'Positions without base-currency P/L', value: String(profitLoss.positionsWithoutBaseCurrencyProfitLoss) }]
         : []),
      allTime.ok
         ? {
            label: `All time to ${date(allTime.value.thru)} close`,
            hint: 'After trading costs. The percentage is Saxo\'s time-weighted return.',
            value: moneyAndPercent(allTime.value.amount, allTime.value.returnPct, client.decimals),
            className: signClass(allTime.value.amount),
         }
         : { label: 'All time', value: allTime.error },
   ]
}

function marginRows({ margin, client }: DashboardData): ValueRow[] {
   const amount = (value: number | null) => money(value, client.decimals)
   return [
      { label: 'Margin available for trading', value: amount(margin.marginAvailableForTrading) },
      { label: 'Margin used by positions', value: amount(margin.marginUsedByCurrentPositions) },
      { label: 'Margin utilization', value: percent(margin.marginUtilizationPct, 2) },
      { label: 'Net exposure', value: amount(margin.marginNetExposure) },
      { label: 'Exposure coverage', value: percent(margin.marginExposureCoveragePct, 2) },
      { label: 'Net equity for margin', value: amount(margin.netEquityForMargin) },
      { label: 'Collateral available', value: amount(margin.collateralAvailable) },
      { label: 'Initial margin available', value: amount(margin.initialMarginAvailable) },
      { label: 'Unrealized margin P/L', value: amount(margin.unrealizedMarginProfitLoss) },
   ]
}

function collateralColumns(decimals: number): Column<CollateralRow>[] {
   return [
      { header: 'Symbol', cell: row => <span title={row.description}>{row.symbol}</span> },
      { header: 'Market value', cell: row => money(row.marketValue, decimals), numeric: true },
      { header: 'Collateral value', cell: row => money(row.collateralValue, decimals), numeric: true },
      {
         header: 'Counts for',
         cell: row => row.marketValue && row.collateralValue !== null ? percent(100 * row.collateralValue / row.marketValue, 0) : '–',
         numeric: true,
      },
   ]
}

function marginByInstrumentColumns(decimals: number): Column<MarginRow>[] {
   return [
      { header: 'Group', cell: row => row.group },
      { header: 'Instrument', cell: row => row.instrument },
      { header: 'Asset type', cell: row => row.assetTypes },
      { header: 'Margin', cell: row => money(row.margin, decimals), numeric: true },
   ]
}

const POSITION_COLUMNS: Column<PositionRow>[] = [
   { header: 'Symbol', cell: row => row.symbol, className: () => 'font-medium' },
   { header: 'Description', cell: row => short(row.description) },
   { header: 'Type', cell: row => row.assetType },
   { header: 'Amount', cell: row => quantity(row.amount), numeric: true },
   { header: 'Currency', cell: row => row.currency },
   { header: 'Avg open', cell: row => money(row.averageOpenPrice, row.decimals), numeric: true },
   { header: 'Current', cell: row => money(row.currentPrice, row.decimals), numeric: true },
   { header: 'Market value', cell: row => money(row.marketValue), numeric: true },
   { header: 'P/L', cell: row => money(row.profitLoss), numeric: true, className: row => signClass(row.profitLoss) },
   { header: 'P/L %', cell: row => percent(row.profitLossPct, 2), numeric: true, className: row => signClass(row.profitLossPct) },
]

const ORDER_COLUMNS: Column<OrderRow>[] = [
   { header: 'Order', cell: row => row.orderId },
   { header: 'Side', cell: row => row.side },
   { header: 'Amount', cell: row => quantity(row.amount), numeric: true },
   { header: 'Symbol', cell: row => row.symbol, className: () => 'font-medium' },
   { header: 'Type', cell: row => row.type },
   { header: 'Price', cell: row => row.price === null ? 'market' : money(row.price, row.decimals), numeric: true },
   { header: 'Duration', cell: row => row.duration },
   { header: 'Status', cell: row => row.status },
]

const ACCOUNT_COLUMNS: Column<AccountRow>[] = [
   { header: 'Account', cell: row => row.accountId },
   { header: 'Name', cell: row => row.name },
   { header: 'Type', cell: row => row.type },
   { header: 'Currency', cell: row => row.currency },
   { header: 'Cash', cell: row => money(row.cash, row.decimals), numeric: true },
   { header: 'Total value', cell: row => money(row.totalValue, row.decimals), numeric: true },
]

export function Dashboard({ data }: { data: DashboardData }) {
   const { client, marginByInstrument } = data
   return (
      <div className="grid gap-4">
         <div className="grid gap-4 lg:grid-cols-3">
            <MarginGauge margin={data.margin} currency={client.currency} decimals={client.decimals} />
            <ValueListCard title={`Balance, all accounts (${client.currency})`} rows={balanceRows(data)} />
            <ValueListCard title={`P/L (${client.currency})`} rows={profitLossRows(data)} />
         </div>
         <TableCard
            title="Positions"
            rows={data.positions}
            columns={POSITION_COLUMNS}
            rowKey={(row, index) => `${row.symbol}-${row.assetType}-${index}`}
         />
         <div className="grid gap-4 lg:grid-cols-2">
            <ValueListCard title={`Margin (${client.currency})`} rows={marginRows(data)} />
            <TableCard
               title="Collateral by instrument"
               description="What each position counts for when Saxo values your collateral."
               rows={data.collateral}
               columns={collateralColumns(client.decimals)}
               rowKey={(row, index) => `${row.symbol}-${index}`}
            />
         </div>
         <TableCard
            title="Margin by instrument"
            rows={marginByInstrument.ok ? marginByInstrument.value : []}
            columns={marginByInstrumentColumns(client.decimals)}
            rowKey={(row, index) => `${row.group}-${row.instrument}-${index}`}
            rowClassName={row => row.isTotal ? 'font-medium' : ''}
            empty={marginByInstrument.ok ? 'None' : marginByInstrument.error}
         />
         <TableCard title="Open orders" rows={data.orders} columns={ORDER_COLUMNS} rowKey={(row, index) => row.orderId || String(index)} />
         <TableCard title="Accounts" rows={data.accounts} columns={ACCOUNT_COLUMNS} rowKey={(row, index) => row.accountId || String(index)} />
      </div>
   )
}
