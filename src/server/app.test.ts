import { describe, expect, it, vi } from 'vitest'

import { createApp } from './app.ts'
import type { Session } from './session.ts'

function app() {
   const session = {
      status: () => ({ loggedIn: false, accessExpiresAt: null, refreshExpiresAt: null, refreshedAt: null, error: null }),
      logout: vi.fn(async () => {}),
   } as unknown as Session
   return { session, app: createApp({ allowedHosts: ['192.168.1.133'], session, loadDashboard: vi.fn() }) }
}

describe('createApp', () => {
   it('answers on an allowed host', async () => {
      // When
      const response = await app().app.request('http://192.168.1.133:8766/api/session')

      // Then
      expect(response.status).toBe(200)
   })

   it('answers on an allowed host whatever the port', async () => {
      // When
      const response = await app().app.request('http://192.168.1.133:5173/api/session')

      // Then
      expect(response.status).toBe(200)
   })

   it('refuses an unknown host, as a DNS-rebinding page would send', async () => {
      // When
      const response = await app().app.request('http://evil.example:8766/api/session')

      // Then
      expect(response.status).toBe(421)
   })

   it('refuses a logout posted from another site', async () => {
      // Given
      const { app: server, session } = app()

      // When
      const response = await server.request('http://192.168.1.133:8766/api/logout', {
         method: 'POST',
         headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
      })

      // Then
      expect(response.status).toBe(403)
      expect(session.logout).not.toHaveBeenCalled()
   })
})
