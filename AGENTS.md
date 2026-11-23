# Agent instructions

Run `pnpm lint`, `pnpm typecheck` and `pnpm test` after a change. Setup, deployment and settings are in the README.

`master` takes changes only through squash-merged pull requests, with titles in Conventional Commits form.

## Layout

- `src/server`: Hono server, run by Node.js straight from the TypeScript sources (type stripping), so relative imports end in `.ts`, path aliases do not resolve, and only erasable syntax works. `saxo/` talks to the Saxo OpenAPI; `degiro/` reads an uploaded `Account.csv` with `libdegiro` and prices it from justETF, since DEGIRO has no API.
- `src/web`: React page built by Vite; `@/` points here.
- `src/shared`: types and pure logic used by both, imported by relative path from each side.

## Real money

The server holds a live Saxo login that can trade. Keep every precheck and order on fakes: the tests' `FakeApi`, or a local server built with `createApp` and a fake `LadderApi` for checking the page in a browser. Reading from live Saxo (GET) is fine.

Orders pass three gates, each kept on purpose: `ORDERS_ENABLED`, a clean Saxo precheck less than 5 minutes old, and the typed `place N`. A previewed plan is placed at most once.

## Saxo quirks

- A PKCE redirect URL may change its port only on `localhost`; any other host must match the registered URL exactly, which is why `callbackUrl` drops the port.
- Every refresh rotates the refresh token, and the refresh request carries the PKCE `code_verifier` again.
- Saxo refuses an identical POST within 15 seconds unless `X-Request-ID` differs, and allows one order request per second per session (`ORDER_INTERVAL_MS`).
- Errors can arrive in `ErrorInfo` with HTTP 200, even with `PreCheckResult: Ok`.
- Without a price feed for an instrument, a net position comes back with `CurrentPrice: 0` and no market value, while its P/L is still filled in: `positionValues` rebuilds both.
- Prices go through `priceOnTick` with big.js: a tick scheme's bands differ, and a price rounded with one band's tick can land in a lower band.
- The margin gauge's 50 / 75 / 100% levels come from Saxo Switzerland's Lombard loan page, linked in `src/shared/margin.ts`.

## DEGIRO

DEGIRO's terms forbid scripts that connect to an account, so the server never logs in to DEGIRO and reads no DEGIRO endpoint: positions and cash come from the uploaded statement, prices from justETF. The margin is an estimate: collateral is each position's value times the credit percentage of the account profile (`PROFILE_CREDIT_PCT` in `src/shared/degiro.ts`), or a per-position override; a position without a credit percentage or a price counts for no collateral.
