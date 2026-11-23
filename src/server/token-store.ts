import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface StoredTokens {
   appKey: string
   tokenEndpoint: string
   codeVerifier: string
   accessToken: string
   accessExpiresAt: number
   refreshToken: string
   refreshExpiresAt: number
   refreshedAt: number
}

export interface TokenStore {
   load(): Promise<StoredTokens | null>
   save(tokens: StoredTokens): Promise<void>
   clear(): Promise<void>
}

export function fileTokenStore(path: string): TokenStore {
   return {
      async load() {
         try {
            return JSON.parse(await readFile(path, 'utf8')) as StoredTokens
         } catch {
            return null
         }
      },
      async save(tokens) {
         await mkdir(dirname(path), { recursive: true, mode: 0o700 })
         const temporary = `${path}.tmp`
         const file = await open(temporary, 'w', 0o600)
         try {
            await file.writeFile(JSON.stringify(tokens))
         } finally {
            await file.close()
         }
         await rename(temporary, path)
      },
      async clear() {
         await rm(path, { force: true })
      },
   }
}
