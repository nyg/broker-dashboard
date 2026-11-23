# Saxo dashboard

A single-page dashboard for a Saxo Bank account: balance, margin, positions, open orders, accounts and P/L, with a gauge that shows how close the account is to a margin call.

A small Hono server logs in to the Saxo OpenAPI with OAuth PKCE and refreshes the login in the background, so you only log in again when Saxo ends the session. The server only reads from Saxo: it never sends an order.

## Margin gauge

The gauge shows Saxo's "margin and loan utilisation" (`MarginAndCollateralUtilizationPct`, or the higher of margin and collateral utilisation when Saxo does not return it).

| Utilisation | Shown as | Meaning |
|---|---|---|
| below 50% | Safe | |
| 50% to 75% | Watch | |
| 75% to 100% | Margin call | Saxo Switzerland sends margin calls from 75% |
| 100% or more | Close-out | Saxo may close positions and cancel open orders |

The levels come from [Saxo's Lombard loan page](https://www.home.saxo/en-ch/accounts/lombard-loan). Other Saxo entities may use other levels.

## Saxo app

Create a live app on the [Saxo developer portal](https://www.developer.saxo/openapi/appmanagement) with the PKCE grant type. Register one redirect URL per address you open the dashboard on, without a port, for example `http://localhost/callback` and `http://192.168.1.10/callback`. Saxo accepts any port at login time.

## Development

```bash
cp .env.example .env
```

Set `SAXO_APP_KEY` in `.env`, then:

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and log in.

## Running it on a server

The server runs the TypeScript sources directly, so it needs Node.js 24 or later. It serves the built page from `dist/`.

```bash
git clone https://github.com/nyg/saxo-dashboard.git ~/.local/opt/saxo-dashboard
cd ~/.local/opt/saxo-dashboard
pnpm install
pnpm build
mkdir -m 700 ~/.saxo-dashboard ~/.config/saxo-dashboard
cp .env.example ~/.config/saxo-dashboard/env
chmod 600 ~/.config/saxo-dashboard/env
```

In `~/.config/saxo-dashboard/env`, set `SAXO_APP_KEY`, `HOST=0.0.0.0` and the addresses you open the dashboard on in `ALLOWED_HOSTS`. Then install the systemd user service:

```bash
mkdir -p ~/.config/systemd/user
cp deploy/saxo-dashboard.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now saxo-dashboard
```

`deploy/start` finds Node.js through nvm; change it if Node.js is installed another way. Run `loginctl enable-linger` once so the service keeps running when you are logged out.

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
| `TOKEN_FILE` | `~/.saxo-dashboard/tokens.json` | Saved login, readable only by its owner |

## Security

The saved login gives full access to the Saxo account for as long as it keeps being refreshed, including trading if the app allows it. Keep the server on a private network, and prefer a Saxo app without trading permission.
