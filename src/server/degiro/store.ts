import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { DegiroSettings } from '../../shared/degiro.ts'
import { writePrivateFile } from '../private-file.ts'

export const EMPTY_SETTINGS: DegiroSettings = { profile: null, customCreditPct: null, creditOverrides: {}, portfolioRiskPct: null }

export interface SavedStatement {
   csv: string
   savedAt: Date
}

export interface DegiroStore {
   loadStatement(): Promise<SavedStatement | null>
   saveStatement(csv: string): Promise<void>
   loadSettings(): Promise<DegiroSettings>
   saveSettings(settings: DegiroSettings): Promise<void>
}

function isMissing(error: unknown) {
   return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

export function fileDegiroStore(folder: string): DegiroStore {
   const statementFile = join(folder, 'Account.csv')
   const settingsFile = join(folder, 'settings.json')
   return {
      async loadStatement() {
         try {
            const [csv, info] = await Promise.all([readFile(statementFile, 'utf8'), stat(statementFile)])
            return { csv, savedAt: info.mtime }
         } catch (error) {
            if (isMissing(error)) {
               return null
            }
            throw error
         }
      },
      async saveStatement(csv) {
         await writePrivateFile(statementFile, csv)
      },
      async loadSettings() {
         try {
            return { ...EMPTY_SETTINGS, ...JSON.parse(await readFile(settingsFile, 'utf8')) as Partial<DegiroSettings> }
         } catch (error) {
            if (isMissing(error)) {
               return EMPTY_SETTINGS
            }
            throw error
         }
      },
      async saveSettings(settings) {
         await writePrivateFile(settingsFile, JSON.stringify(settings, null, 2))
      },
   }
}
