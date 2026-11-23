import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { writePrivateFile } from '../private-file.ts'

export type Haircuts = Record<string, number>

export interface SavedStatement {
   csv: string
   savedAt: Date
}

export interface DegiroStore {
   loadStatement(): Promise<SavedStatement | null>
   saveStatement(csv: string): Promise<void>
   loadHaircuts(): Promise<Haircuts>
   saveHaircuts(haircuts: Haircuts): Promise<void>
}

function isMissing(error: unknown) {
   return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

export function fileDegiroStore(folder: string): DegiroStore {
   const statementFile = join(folder, 'Account.csv')
   const haircutsFile = join(folder, 'haircuts.json')
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
      async loadHaircuts() {
         try {
            return JSON.parse(await readFile(haircutsFile, 'utf8')) as Haircuts
         } catch (error) {
            if (isMissing(error)) {
               return {}
            }
            throw error
         }
      },
      async saveHaircuts(haircuts) {
         await writePrivateFile(haircutsFile, JSON.stringify(haircuts, null, 2))
      },
   }
}
