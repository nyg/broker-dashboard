import { createHash, randomBytes } from 'node:crypto'

export interface TokenResponse {
   access_token: string
   expires_in: number
   refresh_token: string
   refresh_token_expires_in: number
}

export type TokenRequester = (fields: Record<string, string>) => Promise<TokenResponse>

export class TokenRequestError extends Error {
   readonly status: number

   constructor(status: number, body: string) {
      super(`HTTP ${status} from the Saxo token endpoint: ${body.slice(0, 200)}`)
      this.status = status
   }
}

export function tokenRequester(endpoint: string): TokenRequester {
   return async fields => {
      const response = await fetch(endpoint, {
         method: 'POST',
         headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
         body: new URLSearchParams(fields),
      })
      const body = await response.text()
      if (!response.ok) {
         throw new TokenRequestError(response.status, body)
      }
      return JSON.parse(body) as TokenResponse
   }
}

export function pkcePair() {
   const verifier = randomBytes(32).toString('base64url')
   const challenge = createHash('sha256').update(verifier).digest('base64url')
   return { verifier, challenge }
}

export function randomState() {
   return randomBytes(16).toString('base64url')
}
