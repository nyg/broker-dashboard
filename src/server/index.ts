import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import { serve } from '@hono/node-server'

import { createApp } from './app.ts'
import { cached, frankfurterRates, justEtfQuotes } from './degiro/quotes.ts'
import { DegiroService } from './degiro/service.ts'
import { fileDegiroStore } from './degiro/store.ts'
import { fetchSnapshot, toDashboard } from './saxo/dashboard.ts'
import { LadderService } from './saxo/ladder/service.ts'
import { tokenRequester } from './saxo/oauth.ts'
import { SaxoApi } from './saxo/saxo-api.ts'
import { Session } from './saxo/session.ts'
import { fileTokenStore } from './saxo/token-store.ts'
import { loadSettings } from './settings.ts'

const settings = loadSettings()
const session = new Session({
   settings,
   store: fileTokenStore(settings.tokenFile),
   requestTokens: tokenRequester(settings.tokenEndpoint),
})
await session.start()

const api = new SaxoApi(settings.apiUrl, session)
const QUOTE_TTL_MS = 5 * 60_000
const RATE_TTL_MS = 60 * 60_000

const degiro = new DegiroService({
   store: fileDegiroStore(settings.degiroFolder),
   quotes: cached(justEtfQuotes(), QUOTE_TTL_MS),
   rates: cached(frankfurterRates(), RATE_TTL_MS),
})

const distFolder = resolve(import.meta.dirname, '../../dist')

const app = createApp({
   allowedHosts: settings.allowedHosts,
   session,
   loadDashboard: async () => toDashboard(await fetchSnapshot(api), new Date()),
   ladder: new LadderService({ api, ordersEnabled: settings.ordersEnabled }),
   degiro,
   staticRoot: existsSync(distFolder) ? relative(process.cwd(), distFolder) || '.' : undefined,
})

const server = serve({ fetch: app.fetch, hostname: settings.host, port: settings.port }, info => {
   console.log(`Broker dashboard on http://${settings.host}:${info.port}, Saxo ${session.status().loggedIn ? 'logged in' : 'not logged in'}, orders ${settings.ordersEnabled ? 'enabled' : 'disabled'}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
   process.on(signal, () => {
      session.stop()
      server.close(() => process.exit(0))
   })
}
