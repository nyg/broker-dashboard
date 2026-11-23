import { randomUUID } from 'node:crypto'

import type { Session } from './session.ts'

export class SaxoApiError extends Error {
   readonly status: number
   readonly body: string

   constructor(status: number, path: string, body: string) {
      super(`HTTP ${status} from Saxo ${path}: ${body.slice(0, 200)}`)
      this.status = status
      this.body = body
   }
}

interface Page<T> {
   Data?: T[]
   __next?: string
}

export type Query = Record<string, string>

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

   async post<T>(path: string, body: unknown, isRetry = false): Promise<T> {
      const response = await fetch(`${this.#apiUrl}${path}`, {
         method: 'POST',
         headers: {
            'Authorization': `Bearer ${await this.#session.accessToken()}`,
            'Content-Type': 'application/json; charset=utf-8',
            // Saxo rejects an identical request sent within 15 seconds unless its request ID differs.
            'X-Request-ID': randomUUID(),
         },
         body: JSON.stringify(body),
      })
      if (response.status === 401 && !isRetry) {
         await this.#session.refresh()
         return this.post(path, body, true)
      }
      if (!response.ok) {
         throw new SaxoApiError(response.status, path, await response.text())
      }
      return await response.json() as T
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
