import type { SessionStatus } from '../shared/dashboard.ts'
import { pkcePair, randomState, type TokenRequester, TokenRequestError, type TokenResponse } from './oauth.ts'
import type { Settings } from './settings.ts'
import type { StoredTokens, TokenStore } from './token-store.ts'

// Saxo access tokens last 20 minutes and refresh tokens 60, so refreshing 2 minutes early keeps the login alive.
export const REFRESH_LEAD_MS = 2 * 60_000
export const RETRY_DELAY_MS = 30_000
const ACCESS_MARGIN_MS = 30_000
const PENDING_LOGIN_TTL_MS = 10 * 60_000

interface PendingLogin {
   verifier: string
   redirectUri: string
   createdAt: number
}

export class NotLoggedInError extends Error {}

export interface SessionOptions {
   settings: Pick<Settings, 'appKey' | 'authEndpoint' | 'tokenEndpoint'>
   store: TokenStore
   requestTokens: TokenRequester
   now?: () => number
   log?: (message: string) => void
}

export class Session {
   readonly #settings: SessionOptions['settings']
   readonly #store: TokenStore
   readonly #requestTokens: TokenRequester
   readonly #now: () => number
   readonly #log: (message: string) => void
   readonly #pending = new Map<string, PendingLogin>()
   #tokens: StoredTokens | null = null
   #error: string | null = null
   #timer: NodeJS.Timeout | undefined
   #refreshing: Promise<void> | undefined

   constructor(options: SessionOptions) {
      this.#settings = options.settings
      this.#store = options.store
      this.#requestTokens = options.requestTokens
      this.#now = options.now ?? Date.now
      this.#log = options.log ?? console.log
   }

   async start() {
      const tokens = await this.#store.load()
      if (tokens?.appKey === this.#settings.appKey && tokens.tokenEndpoint === this.#settings.tokenEndpoint) {
         this.#tokens = tokens
         this.#schedule()
      }
   }

   stop() {
      clearTimeout(this.#timer)
   }

   status(): SessionStatus {
      return {
         loggedIn: this.#tokens !== null,
         accessExpiresAt: this.#tokens?.accessExpiresAt ?? null,
         refreshExpiresAt: this.#tokens?.refreshExpiresAt ?? null,
         refreshedAt: this.#tokens?.refreshedAt ?? null,
         error: this.#error,
      }
   }

   beginLogin(redirectUri: string) {
      this.#prunePendingLogins()
      const { verifier, challenge } = pkcePair()
      const state = randomState()
      this.#pending.set(state, { verifier, redirectUri, createdAt: this.#now() })
      const query = new URLSearchParams({
         response_type: 'code',
         client_id: this.#settings.appKey,
         state,
         redirect_uri: redirectUri,
         code_challenge: challenge,
         code_challenge_method: 'S256',
      })
      return `${this.#settings.authEndpoint}?${query}`
   }

   async completeLogin(state: string, code: string) {
      this.#prunePendingLogins()
      const pending = this.#pending.get(state)
      this.#pending.delete(state)
      if (!pending) {
         throw new Error('This login link expired or was already used. Log in again.')
      }
      const response = await this.#requestTokens({
         grant_type: 'authorization_code',
         client_id: this.#settings.appKey,
         code,
         redirect_uri: pending.redirectUri,
         code_verifier: pending.verifier,
      })
      await this.#accept(response, pending.verifier)
      this.#log('Logged in to Saxo.')
   }

   recordError(message: string) {
      this.#error = message
   }

   async logout() {
      clearTimeout(this.#timer)
      this.#tokens = null
      this.#error = null
      await this.#store.clear()
      this.#log('Logged out of Saxo.')
   }

   async accessToken() {
      const current = this.#tokens
      if (current && current.accessExpiresAt - ACCESS_MARGIN_MS <= this.#now()) {
         await this.refresh()
      }
      const tokens = this.#tokens
      if (!tokens) {
         throw new NotLoggedInError(this.#error ?? 'Not logged in to Saxo.')
      }
      if (tokens.accessExpiresAt <= this.#now()) {
         throw new Error(this.#error ?? 'The Saxo access token expired.')
      }
      return tokens.accessToken
   }

   refresh() {
      this.#refreshing ??= this.#refresh().finally(() => {
         this.#refreshing = undefined
      })
      return this.#refreshing
   }

   async #refresh() {
      const tokens = this.#tokens
      if (!tokens) {
         return
      }
      if (tokens.refreshExpiresAt <= this.#now()) {
         await this.#expire('The Saxo login expired. Log in again.')
         return
      }
      try {
         const response = await this.#requestTokens({
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken,
            code_verifier: tokens.codeVerifier,
         })
         if (this.#tokens === tokens) {
            await this.#accept(response, tokens.codeVerifier)
            this.#log(`Refreshed the Saxo login, next refresh at ${this.#nextRefreshTime()}.`)
         }
      } catch (error) {
         if (this.#tokens !== tokens) {
            return
         }
         if (error instanceof TokenRequestError && error.status >= 400 && error.status < 500) {
            await this.#expire(`Saxo refused to refresh the login (HTTP ${error.status}). Log in again.`)
            return
         }
         this.#error = `Refreshing the Saxo login failed, retrying: ${error instanceof Error ? error.message : String(error)}`
         this.#log(this.#error)
         this.#setTimer(RETRY_DELAY_MS)
      }
   }

   async #accept(response: TokenResponse, codeVerifier: string) {
      const now = this.#now()
      const tokens: StoredTokens = {
         appKey: this.#settings.appKey,
         tokenEndpoint: this.#settings.tokenEndpoint,
         codeVerifier,
         accessToken: response.access_token,
         accessExpiresAt: now + response.expires_in * 1000,
         refreshToken: response.refresh_token,
         refreshExpiresAt: now + response.refresh_token_expires_in * 1000,
         refreshedAt: now,
      }
      this.#tokens = tokens
      this.#error = null
      await this.#store.save(tokens)
      this.#schedule()
   }

   async #expire(message: string) {
      clearTimeout(this.#timer)
      this.#tokens = null
      this.#error = message
      await this.#store.clear()
      this.#log(message)
   }

   #schedule() {
      const tokens = this.#tokens
      if (tokens) {
         const refreshAt = Math.min(tokens.accessExpiresAt, tokens.refreshExpiresAt) - REFRESH_LEAD_MS
         this.#setTimer(refreshAt - this.#now())
      }
   }

   #setTimer(delay: number) {
      clearTimeout(this.#timer)
      this.#timer = setTimeout(() => void this.refresh(), Math.max(0, delay))
   }

   #nextRefreshTime() {
      const tokens = this.#tokens
      return tokens ? new Date(tokens.accessExpiresAt - REFRESH_LEAD_MS).toISOString() : 'never'
   }

   #prunePendingLogins() {
      const oldest = this.#now() - PENDING_LOGIN_TTL_MS
      for (const [state, pending] of this.#pending) {
         if (pending.createdAt < oldest) {
            this.#pending.delete(state)
         }
      }
   }
}
