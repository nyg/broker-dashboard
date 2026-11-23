import { readFile, rm } from 'node:fs/promises'

import { writePrivateFile } from '../private-file.ts'

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
         await writePrivateFile(path, JSON.stringify(tokens))
      },
      async clear() {
         await rm(path, { force: true })
      },
   }
}
