import type { Dashboard, SessionStatus } from '../../shared/dashboard.ts'

export class NotLoggedInError extends Error {}

async function errorText(response: Response) {
   try {
      const body = await response.json() as { error?: string }
      return body.error ?? `HTTP ${response.status}`
   } catch {
      return `HTTP ${response.status}`
   }
}

export async function fetchSession() {
   const response = await fetch('/api/session')
   if (!response.ok) {
      throw new Error(await errorText(response))
   }
   return await response.json() as SessionStatus
}

export async function fetchDashboard() {
   const response = await fetch('/api/dashboard')
   if (response.status === 401) {
      throw new NotLoggedInError(await errorText(response))
   }
   if (!response.ok) {
      throw new Error(await errorText(response))
   }
   return await response.json() as Dashboard
}

export async function logout() {
   await fetch('/api/logout', { method: 'POST' })
}
