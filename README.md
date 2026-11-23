# Broker dashboard

A dashboard for a Saxo Bank account and a DEGIRO account, each with a gauge that shows how close the account is to a margin call.

- **Saxo**: balance, margin, positions, open orders, accounts and P/L, and a page that places a ladder of limit orders. A small Hono server logs in to the Saxo OpenAPI with OAuth PKCE and refreshes the login in the background, so you only log in again when Saxo ends the session.
- **DEGIRO**: DEGIRO has no API, so the server reads the `Account.csv` statement you upload, with [libdegiro](https://github.com/nyg/libdegiro), and prices the positions with justETF. It never logs in to DEGIRO.

## Saxo margin gauge

The gauge shows Saxo's "margin and loan utilisation" (`MarginAndCollateralUtilizationPct`, or the higher of margin and collateral utilisation when Saxo does not return it).

| Utilisation | Shown as | Meaning |
|---|---|---|
| below 50% | Safe | |
| 50% to 75% | Watch | |
| 75% to 100% | Margin call | Saxo Switzerland sends margin calls from 75% |
| 100% or more | Close-out | Saxo may close positions and cancel open orders |

The levels come from [Saxo's Lombard loan page](https://www.home.saxo/en-ch/accounts/lombard-loan). Other Saxo entities may use other levels.

## DEGIRO margin gauge

The gauge estimates the loan as a share of the collateral value. The loan is the negative cash balance in the statement. The collateral value is the share of each position's value DEGIRO lends against, its credit percentage, which depends on the account profile you choose in the Credit card:

| Profile | Credit |
|---|---|
| Custody | 0% |
| Basic | 70% |
| Active | 33% |
| Trader | 70% |
| Custom | the percentage you enter |

The percentages are DEGIRO Switzerland's, from its [margin loans page](https://www.degiro.ch/en/investing/margin-loans); choose Custom where your DEGIRO entity differs. A position can override its profile's percentage in the Positions table, for example 0% for a product DEGIRO does not lend against. A position without a credit percentage or a price counts for no collateral, so the estimate errs high. Compare the result with DEGIRO's own collateral value under Available to trade.

| Loan to collateral | Shown as | Meaning |
|---|---|---|
| below 50% | Safe | |
| 50% to 75% | Watch | |
| 75% to 100% | Near a call | |
| 100% or more | Margin call | Free space is negative: DEGIRO asks you to add money or sell, and may sell positions itself |

Free space is the collateral value plus the cash balance. The cash comes from the statement, so upload a newer one after you trade, deposit or withdraw.

Prices come from [justETF](https://www.justetf.com) in the account currency: an exchange quote, or the fund's last published NAV where justETF has none. They are kept for 5 minutes. Cash in other currencies is converted with the ECB rates from [Frankfurter](https://frankfurter.dev).

## Ladder orders

The Ladder orders tab spreads limit orders evenly between a low and a high price and splits a total value or number of units equally between them. The low and high can also be levels of an underlying, such as Bitcoin for a Bitcoin ETN: each limit price is then the level times the instrument's current price divided by the underlying's.

Prices are rounded to the instrument's tick size, down for buys and up for sells. The preview refuses orders that would fill immediately unless you allow them. Placing takes three steps: preview, a Saxo precheck of every order, and typing `place N` to confirm. Orders go out one per second, and placing stops at the first one Saxo refuses.

The server sends no precheck and no order unless `ORDERS_ENABLED=true`.

## Saxo app

Create a live app on the [Saxo developer portal](https://www.developer.saxo/openapi/appmanagement) with the PKCE grant type. Register one redirect URL per address you open the dashboard on, without a port, for example `http://localhost/callback` and `http://192.168.1.10/callback`.

Saxo accepts any port at login time only on `localhost`. Any other address must match exactly, so the server sends Saxo its callback URL without a port, and it must also be reachable on port 80. See [Port 80](#port-80).

## Development

```bash
cp .env.example .env
```

Set `SAXO_APP_KEY` in `.env`, then:

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and log in to Saxo, or upload a DEGIRO `Account.csv` in the DEGIRO tab.

## Running it on a server

The server runs the TypeScript sources directly, so it needs Node.js 24 or later. It serves the built page from `dist/`.

```bash
git clone https://github.com/nyg/broker-dashboard.git ~/.local/opt/broker-dashboard
cd ~/.local/opt/broker-dashboard
pnpm install
pnpm build
mkdir -m 700 ~/.broker-dashboard ~/.config/broker-dashboard
cp .env.example ~/.config/broker-dashboard/env
chmod 600 ~/.config/broker-dashboard/env
```

In `~/.config/broker-dashboard/env`, set `SAXO_APP_KEY`, `HOST=0.0.0.0` and the addresses you open the dashboard on in `ALLOWED_HOSTS`. Then install the systemd user service:

```bash
mkdir -p ~/.config/systemd/user
cp deploy/broker-dashboard.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now broker-dashboard
```

`deploy/start` finds Node.js through nvm; change it if Node.js is installed another way. Run `loginctl enable-linger` once so the service keeps running when you are logged out.

### Port 80

The login callback arrives on port 80. A user service cannot listen on it, so forward port 80 to the server's port with nftables, for example in `/etc/nftables.conf`:

```
table ip broker_dashboard
flush table ip broker_dashboard

table ip broker_dashboard {
	chain prerouting {
		type nat hook prerouting priority dstnat; policy accept;
		tcp dport 80 redirect to :8766
	}
}
```

Then run `sudo nft -f /etc/nftables.conf`.

## Configuration

| Variable | Default | |
|---|---|---|
| `SAXO_APP_KEY` | | App key of the Saxo app |
| `SAXO_AUTH_ENDPOINT` | `https://live.logonvalidation.net/authorize` | |
| `SAXO_TOKEN_ENDPOINT` | `https://live.logonvalidation.net/token` | |
| `SAXO_API_URL` | `https://gateway.saxobank.com/openapi` | `https://gateway.saxobank.com/sim/openapi` for the simulation environment |
| `HOST` | `127.0.0.1` | Address the server listens on |
| `PORT` | `8766` | |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Host names the server answers to, which blocks DNS rebinding |
| `TOKEN_FILE` | `~/.broker-dashboard/saxo-tokens.json` | Saved Saxo login, readable only by its owner |
| `ORDERS_ENABLED` | `false` | `true` lets the Ladder orders tab precheck and place orders |
| `DEGIRO_FOLDER` | `~/.broker-dashboard/degiro` | Uploaded DEGIRO statement and credit settings, readable only by their owner |

## Security

The saved login gives full access to the Saxo account for as long as it keeps being refreshed, including trading if the app allows it. With `ORDERS_ENABLED=true`, anyone who can open the page can place orders. Keep the server on a private network that only your devices reach.

The DEGIRO statement lists every movement of the account. The server sends justETF only the ISINs of the positions, and Frankfurter only currency codes.
