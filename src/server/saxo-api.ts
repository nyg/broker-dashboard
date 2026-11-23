import type { Session } from './session.ts'

export class SaxoApiError extends Error {
   readonly status: number

   constructor(status: number, path: string, body: string) {
      super(`HTTP ${status} from Saxo ${path}: ${body.slice(0, 200)}`)
      this.status = status
   }
}

interface Page<T> {
   Data?: T[]
   __next?: string
}

export type Query = Record<string, string>

// Read-only on purpose: the dashboard never sends anything but GET requests to Saxo.
export class SaxoApi {
   readonly #apiUrl: string
   readonly #session: Session

   constructor(apiUrl: string, session: Session) {
      this.#apiUrl = apiUrl
      this.#session = session
   }

   get<T>(path: string, query: Query = {}) {
      return this.#getUrl<T>(this.#url(path, query))
   }

   async getAll<T>(path: string, query: Query = {}) {
      let page = await this.get<Page<T>>(path, query)
      const items = [...page.Data ?? []]
      while (page.__next) {
         page = await this.#getUrl<Page<T>>(page.__next)
         items.push(...page.Data ?? [])
      }
      return items
   }

   #url(path: string, query: Query) {
      const search = new URLSearchParams(query).toString().replaceAll('%2C', ',')
      return `${this.#apiUrl}${path}${search ? `?${search}` : ''}`
   }

   async #getUrl<T>(url: string, isRetry = false): Promise<T> {
      const response = await fetch(url, {
         headers: { Authorization: `Bearer ${await this.#session.accessToken()}` },
      })
      if (response.status === 401 && !isRetry) {
         await this.#session.refresh()
         return this.#getUrl(url, true)
      }
      if (!response.ok) {
         throw new SaxoApiError(response.status, new URL(url).pathname, await response.text())
      }
      return await response.json() as T
   }
}
