import { homedir } from 'node:os'
import { resolve } from 'node:path'

export interface Settings {
   appKey: string
   authEndpoint: string
   tokenEndpoint: string
   apiUrl: string
   host: string
   port: number
   allowedHosts: string[]
   tokenFile: string
   ordersEnabled: boolean
   degiroFolder: string
}

const DEFAULTS = {
   SAXO_AUTH_ENDPOINT: 'https://live.logonvalidation.net/authorize',
   SAXO_TOKEN_ENDPOINT: 'https://live.logonvalidation.net/token',
   SAXO_API_URL: 'https://gateway.saxobank.com/openapi',
   HOST: '127.0.0.1',
   PORT: '8766',
   ALLOWED_HOSTS: 'localhost,127.0.0.1',
   TOKEN_FILE: '~/.broker-dashboard/saxo-tokens.json',
   ORDERS_ENABLED: 'false',
   DEGIRO_FOLDER: '~/.broker-dashboard/degiro',
}

type Name = keyof typeof DEFAULTS | 'SAXO_APP_KEY'

function expandHome(path: string) {
   return resolve(path.replace(/^~(?=$|\/)/, homedir()))
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
   const value = (name: Name) => env[name]?.trim() || (name === 'SAXO_APP_KEY' ? '' : DEFAULTS[name])
   const appKey = value('SAXO_APP_KEY')
   if (!appKey) {
      throw new Error('SAXO_APP_KEY is not set')
   }
   return {
      appKey,
      authEndpoint: value('SAXO_AUTH_ENDPOINT'),
      tokenEndpoint: value('SAXO_TOKEN_ENDPOINT'),
      apiUrl: value('SAXO_API_URL').replace(/\/$/, ''),
      host: value('HOST'),
      port: Number(value('PORT')),
      allowedHosts: value('ALLOWED_HOSTS').split(',').map(host => host.trim().toLowerCase()).filter(Boolean),
      tokenFile: expandHome(value('TOKEN_FILE')),
      ordersEnabled: value('ORDERS_ENABLED') === 'true',
      degiroFolder: expandHome(value('DEGIRO_FOLDER')),
   }
}
