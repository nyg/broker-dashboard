import { describe, expect, it, vi } from 'vitest'

import { callbackUrl, createApp } from './app.ts'
import { DegiroInputError, type DegiroService } from './degiro/service.ts'
import type { LadderService } from './saxo/ladder/service.ts'
import type { Session } from './saxo/session.ts'

function app(degiro: Partial<DegiroService> = {}) {
   const session = {
      status: () => ({ loggedIn: false, accessExpiresAt: null, refreshExpiresAt: null, refreshedAt: null, error: null }),
      logout: vi.fn(async () => {}),
      beginLogin: vi.fn((redirectUri: string) => `https://saxo.test/authorize?redirect_uri=${redirectUri}`),
   } as unknown as Session
   return { session, app: createApp({ allowedHosts: ['192.168.1.133'], session, loadDashboard: vi.fn(), ladder: {} as LadderService, degiro: degiro as DegiroService }) }
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

describe('DEGIRO routes', () => {
   const statementUrl = 'http://192.168.1.133:8766/api/degiro/statement'

   it('saves a statement sent as CSV', async () => {
      // Given
      const saveStatement = vi.fn(async () => {})

      // When
      const response = await app({ saveStatement }).app.request(statementUrl, {
         method: 'PUT',
         headers: { 'Content-Type': 'text/csv' },
         body: 'Date,Time',
      })

      // Then
      expect(response.status).toBe(200)
      expect(saveStatement).toHaveBeenCalledWith('Date,Time')
   })

   it('refuses a statement sent as plain text, which a cross-site form could send', async () => {
      // Given
      const saveStatement = vi.fn(async () => {})

      // When
      const response = await app({ saveStatement }).app.request(statementUrl, {
         method: 'PUT',
         headers: { 'Content-Type': 'text/plain', 'Origin': 'http://192.168.1.133:8766' },
         body: 'Date,Time',
      })

      // Then
      expect(response.status).toBe(400)
      expect(saveStatement).not.toHaveBeenCalled()
   })

   it('refuses a statement over 5 MB', async () => {
      // Given
      const saveStatement = vi.fn(async () => {})

      // When
      const response = await app({ saveStatement }).app.request(statementUrl, {
         method: 'PUT',
         headers: { 'Content-Type': 'text/csv' },
         body: 'x'.repeat(5 * 1024 * 1024 + 1),
      })

      // Then
      expect(response.status).toBe(413)
      expect(saveStatement).not.toHaveBeenCalled()
   })

   it('answers 400 with the reason when the service refuses the input', async () => {
      // Given
      const setCreditOverride = vi.fn(async () => {
         throw new DegiroInputError('The credit must be a percentage from 0 to 100.')
      })

      // When
      const response = await app({ setCreditOverride }).app.request('http://192.168.1.133:8766/api/degiro/credit/IE00B4K48X80', {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ creditPct: 120 }),
      })

      // Then
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'The credit must be a percentage from 0 to 100.' })
      expect(setCreditOverride).toHaveBeenCalledWith('IE00B4K48X80', 120)
   })

   it('passes the settings sent as JSON to the service', async () => {
      // Given
      const updateSettings = vi.fn(async () => {})

      // When
      const response = await app({ updateSettings }).app.request('http://192.168.1.133:8766/api/degiro/settings', {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ profile: 'basic' }),
      })

      // Then
      expect(response.status).toBe(200)
      expect(updateSettings).toHaveBeenCalledWith({ profile: 'basic' })
   })
})
