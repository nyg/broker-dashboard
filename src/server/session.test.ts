import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TokenRequestError, type TokenResponse } from './oauth.ts'
import { REFRESH_LEAD_MS, RETRY_DELAY_MS, Session } from './session.ts'
import type { StoredTokens, TokenStore } from './token-store.ts'

const MINUTE = 60_000
const settings = { appKey: 'app', authEndpoint: 'https://saxo.test/authorize', tokenEndpoint: 'https://saxo.test/token' }

class MemoryStore implements TokenStore {
   tokens: StoredTokens | null

   constructor(tokens: StoredTokens | null = null) {
      this.tokens = tokens
   }

   async load() {
      return this.tokens
   }

   async save(tokens: StoredTokens) {
      this.tokens = tokens
   }

   async clear() {
      this.tokens = null
   }
}

function storedTokens(overrides: Partial<StoredTokens> = {}): StoredTokens {
   return {
      appKey: 'app',
      tokenEndpoint: settings.tokenEndpoint,
      codeVerifier: 'verifier',
      accessToken: 'access-1',
      accessExpiresAt: 20 * MINUTE,
      refreshToken: 'refresh-1',
      refreshExpiresAt: 60 * MINUTE,
      refreshedAt: 0,
      ...overrides,
   }
}

function tokenResponse(suffix: string): TokenResponse {
   return { access_token: `access-${suffix}`, expires_in: 1200, refresh_token: `refresh-${suffix}`, refresh_token_expires_in: 3600 }
}

describe('Session', () => {
   beforeEach(() => {
      vi.useFakeTimers({ now: 0 })
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('refreshes before the access token expires and keeps the rotated refresh token', async () => {
      // Given
      const store = new MemoryStore(storedTokens())
      const requestTokens = vi.fn(async () => tokenResponse('2'))
      const session = new Session({ settings, store, requestTokens, log: () => {} })
      await session.start()

      // When
      await vi.advanceTimersByTimeAsync(20 * MINUTE - REFRESH_LEAD_MS)

      // Then
      expect(requestTokens).toHaveBeenCalledExactlyOnceWith({
         grant_type: 'refresh_token',
         refresh_token: 'refresh-1',
         code_verifier: 'verifier',
      })
      expect(store.tokens?.refreshToken).toBe('refresh-2')
      expect(await session.accessToken()).toBe('access-2')
   })

   it('keeps the login alive for hours by refreshing again and again', async () => {
      // Given
      const store = new MemoryStore(storedTokens())
      let count = 1
      const requestTokens = vi.fn(async () => tokenResponse(String(++count)))
      const session = new Session({ settings, store, requestTokens, log: () => {} })
      await session.start()

      // When
      await vi.advanceTimersByTimeAsync(5 * 60 * MINUTE)

      // Then
      expect(requestTokens.mock.calls.length).toBeGreaterThanOrEqual(16)
      expect(session.status().loggedIn).toBe(true)
   })

   it('logs out when Saxo rejects the refresh token', async () => {
      // Given
      const store = new MemoryStore(storedTokens())
      const requestTokens = vi.fn(async () => {
         throw new TokenRequestError(400, 'invalid_grant')
      })
      const session = new Session({ settings, store, requestTokens, log: () => {} })
      await session.start()

      // When
      await vi.advanceTimersByTimeAsync(20 * MINUTE)

      // Then
      expect(session.status()).toMatchObject({ loggedIn: false, error: expect.stringContaining('HTTP 400') })
      expect(store.tokens).toBeNull()
   })

   it('retries a refresh that failed on the network', async () => {
      // Given
      const store = new MemoryStore(storedTokens())
      const requestTokens = vi.fn()
         .mockRejectedValueOnce(new Error('ECONNRESET'))
         .mockResolvedValueOnce(tokenResponse('2'))
      const session = new Session({ settings, store, requestTokens, log: () => {} })
      await session.start()
      await vi.advanceTimersByTimeAsync(20 * MINUTE - REFRESH_LEAD_MS)

      // When
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)

      // Then
      expect(requestTokens).toHaveBeenCalledTimes(2)
      expect(session.status()).toMatchObject({ loggedIn: true, error: null })
   })

   it('ignores saved tokens of another app', async () => {
      // Given
      const store = new MemoryStore(storedTokens({ appKey: 'other' }))
      const session = new Session({ settings, store, requestTokens: vi.fn(), log: () => {} })

      // When
      await session.start()

      // Then
      expect(session.status().loggedIn).toBe(false)
   })

   it('exchanges the code with the verifier and redirect URL of its login', async () => {
      // Given
      const store = new MemoryStore()
      const requestTokens = vi.fn(async () => tokenResponse('1'))
      const session = new Session({ settings, store, requestTokens, log: () => {} })
      const authorize = new URL(session.beginLogin('http://192.168.1.133:8766/callback'))

      // When
      await session.completeLogin(authorize.searchParams.get('state')!, 'code-1')

      // Then
      expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
      expect(requestTokens).toHaveBeenCalledWith(expect.objectContaining({
         grant_type: 'authorization_code',
         code: 'code-1',
         redirect_uri: 'http://192.168.1.133:8766/callback',
      }))
      expect(store.tokens?.accessToken).toBe('access-1')
   })

   it('rejects a callback whose state it did not issue', async () => {
      // Given
      const session = new Session({ settings, store: new MemoryStore(), requestTokens: vi.fn(), log: () => {} })

      // When
      const login = session.completeLogin('forged', 'code-1')

      // Then
      await expect(login).rejects.toThrow('expired or was already used')
   })
})
