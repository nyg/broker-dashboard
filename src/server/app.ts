import { serveStatic } from '@hono/node-server/serve-static'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { csrf } from 'hono/csrf'

import type { Dashboard } from '../shared/dashboard.ts'
import { LadderInputError, type LadderService, LadderStateError, parseLadderRequest } from './ladder/service.ts'
import { SaxoApiError } from './saxo-api.ts'
import { NotLoggedInError, type Session } from './session.ts'

export interface AppOptions {
   allowedHosts: string[]
   session: Session
   loadDashboard: () => Promise<Dashboard>
   ladder: LadderService
   staticRoot?: string
}

// Rejects any Host the server was not configured for, so a DNS-rebinding page cannot read the dashboard.
function allowedHostsOnly(allowedHosts: string[]): MiddlewareHandler {
   return async (c, next) => {
      if (!allowedHosts.includes(new URL(c.req.url).hostname)) {
         return c.text('Unknown host', 421)
      }
      await next()
   }
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']

// Saxo accepts any port in a PKCE redirect URL only on localhost; any other host must match the
// registered URL exactly, which has no port, so the server must also be reachable on port 80.
export function callbackUrl(requestUrl: string) {
   const url = new URL('/callback', requestUrl)
   if (!LOOPBACK_HOSTS.includes(url.hostname)) {
      url.port = ''
   }
   return url.toString()
}

// Requiring JSON makes a cross-site POST need a CORS preflight, which this server never grants.
async function jsonBody(c: Context): Promise<Record<string, unknown>> {
   if (!c.req.header('content-type')?.startsWith('application/json')) {
      throw new LadderInputError('Send the request as application/json.')
   }
   try {
      return await c.req.json()
   } catch {
      throw new LadderInputError('The request body is not valid JSON.')
   }
}

async function respond(c: Context, handle: () => Promise<unknown>) {
   try {
      return c.json(await handle())
   } catch (error) {
      if (error instanceof NotLoggedInError) {
         return c.json({ error: error.message }, 401)
      }
      if (error instanceof LadderInputError) {
         return c.json({ error: error.message, candidates: error.candidates }, 400)
      }
      if (error instanceof LadderStateError) {
         return c.json({ error: error.message }, 409)
      }
      console.error(error)
      return c.json({ error: errorMessage(error) }, error instanceof SaxoApiError ? 502 : 500)
   }
}

function errorMessage(error: unknown) {
   return error instanceof Error ? error.message : String(error)
}

export function createApp({ allowedHosts, session, loadDashboard, ladder, staticRoot }: AppOptions) {
   const app = new Hono()
   app.use(allowedHostsOnly(allowedHosts))
   app.use(csrf())

   app.get('/api/session', c => c.json(session.status()))

   app.get('/api/login', c => c.redirect(session.beginLogin(callbackUrl(c.req.url))))

   app.get('/callback', async c => {
      const { code, state, error, error_description: description } = c.req.query()
      if (error || !code || !state) {
         session.recordError(`Saxo login failed: ${description || error || 'no code returned'}`)
         return c.redirect('/')
      }
      try {
         await session.completeLogin(state, code)
      } catch (loginError) {
         session.recordError(errorMessage(loginError))
      }
      return c.redirect('/')
   })

   app.post('/api/logout', async c => {
      await session.logout()
      return c.body(null, 204)
   })

   app.get('/api/dashboard', c => respond(c, loadDashboard))

   app.post('/api/ladder/preview', async c => respond(c, async () => ladder.preview(parseLadderRequest(await jsonBody(c)))))

   app.post('/api/ladder/precheck', async c => respond(c, async () => ladder.precheck(String((await jsonBody(c)).planId))))

   app.post('/api/ladder/place', async c => respond(c, async () => {
      const body = await jsonBody(c)
      return ladder.place(String(body.planId), String(body.confirmation ?? ''))
   }))

   if (staticRoot) {
      app.use('/*', serveStatic({ root: staticRoot }))
   }

   return app
}
