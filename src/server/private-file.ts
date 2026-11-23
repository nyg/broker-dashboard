import { mkdir, open, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function writePrivateFile(path: string, content: string) {
   await mkdir(dirname(path), { recursive: true, mode: 0o700 })
   const temporary = `${path}.tmp`
   const file = await open(temporary, 'w', 0o600)
   try {
      await file.writeFile(content)
   } finally {
      await file.close()
   }
   await rename(temporary, path)
}
