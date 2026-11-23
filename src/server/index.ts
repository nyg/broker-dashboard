import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import { serve } from '@hono/node-server'

import { createApp } from './app.ts'
import { fetchSnapshot, toDashboard } from './dashboard.ts'
import { tokenRequester } from './oauth.ts'
import { SaxoApi } from './saxo-api.ts'
import { Session } from './session.ts'
import { loadSettings } from './settings.ts'
import { fileTokenStore } from './token-store.ts'

const settings = loadSettings()
const session = new Session({
   settings,
   store: fileTokenStore(settings.tokenFile),
   requestTokens: tokenRequester(settings.tokenEndpoint),
})
await session.start()

const api = new SaxoApi(settings.apiUrl, session)
const distFolder = resolve(import.meta.dirname, '../../dist')

const app = createApp({
   allowedHosts: settings.allowedHosts,
   session,
   loadDashboard: async () => toDashboard(await fetchSnapshot(api), new Date()),
   staticRoot: existsSync(distFolder) ? relative(process.cwd(), distFolder) || '.' : undefined,
})

const server = serve({ fetch: app.fetch, hostname: settings.host, port: settings.port }, info => {
   console.log(`Saxo dashboard on http://${settings.host}:${info.port}, ${session.status().loggedIn ? 'logged in' : 'not logged in'}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
   process.on(signal, () => {
      session.stop()
      server.close(() => process.exit(0))
   })
}
