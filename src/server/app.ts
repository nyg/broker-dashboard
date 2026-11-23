import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type MiddlewareHandler } from 'hono'
import { csrf } from 'hono/csrf'

import type { Dashboard } from '../shared/dashboard.ts'
import { SaxoApiError } from './saxo-api.ts'
import { NotLoggedInError, type Session } from './session.ts'

export interface AppOptions {
   allowedHosts: string[]
   session: Session
   loadDashboard: () => Promise<Dashboard>
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

function errorMessage(error: unknown) {
   return error instanceof Error ? error.message : String(error)
}

export function createApp({ allowedHosts, session, loadDashboard, staticRoot }: AppOptions) {
   const app = new Hono()
   app.use(allowedHostsOnly(allowedHosts))
   app.use(csrf())

   app.get('/api/session', c => c.json(session.status()))

   app.get('/api/login', c => c.redirect(session.beginLogin(`${new URL(c.req.url).origin}/callback`)))

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

   app.get('/api/dashboard', async c => {
      try {
         return c.json(await loadDashboard())
      } catch (error) {
         if (error instanceof NotLoggedInError) {
            return c.json({ error: error.message }, 401)
         }
         console.error(error)
         return c.json({ error: errorMessage(error) }, error instanceof SaxoApiError ? 502 : 500)
      }
   })

   if (staticRoot) {
      app.use('/*', serveStatic({ root: staticRoot }))
   }

   return app
}
