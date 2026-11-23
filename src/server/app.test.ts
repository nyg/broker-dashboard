import { describe, expect, it, vi } from 'vitest'

import { callbackUrl, createApp } from './app.ts'
import type { LadderService } from './ladder/service.ts'
import type { Session } from './session.ts'

function app() {
   const session = {
      status: () => ({ loggedIn: false, accessExpiresAt: null, refreshExpiresAt: null, refreshedAt: null, error: null }),
      logout: vi.fn(async () => {}),
      beginLogin: vi.fn((redirectUri: string) => `https://saxo.test/authorize?redirect_uri=${redirectUri}`),
   } as unknown as Session
   return { session, app: createApp({ allowedHosts: ['192.168.1.133'], session, loadDashboard: vi.fn(), ladder: {} as LadderService }) }
}

describe('callbackUrl', () => {
   it.each([
      ['http://192.168.1.133:8766/api/login', 'http://192.168.1.133/callback'],
      ['http://192.168.1.133/api/login', 'http://192.168.1.133/callback'],
      ['http://localhost:5173/api/login', 'http://localhost:5173/callback'],
   ])('turns %s into %s', (requestUrl, expected) => {
      // When
      const result = callbackUrl(requestUrl)

      // Then
      expect(result).toBe(expected)
   })
})

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

   it('sends the login to Saxo with the registered callback URL', async () => {
      // When
      const response = await app().app.request('http://192.168.1.133:8766/api/login')

      // Then
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('https://saxo.test/authorize?redirect_uri=http://192.168.1.133/callback')
   })
})
