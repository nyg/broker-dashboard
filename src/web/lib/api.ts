import type { Dashboard, SessionStatus } from '../../shared/dashboard.ts'
import type { DegiroDashboard, DegiroSettings } from '../../shared/degiro.ts'
import type {
   InstrumentCandidate,
   LadderError,
   LadderPreview,
   LadderRequest,
   PlaceResponse,
   PrecheckResponse,
} from '../../shared/ladder.ts'

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

export class ApiError extends Error {
   readonly candidates: InstrumentCandidate[]

   constructor(message: string, candidates: InstrumentCandidate[] = []) {
      super(message)
      this.candidates = candidates
   }
}

async function postJson<T>(path: string, body: unknown) {
   const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
   })
   if (!response.ok) {
      const error = await response.json().catch(() => ({})) as Partial<LadderError>
      throw new ApiError(error.error ?? `HTTP ${response.status}`, error.candidates)
   }
   return await response.json() as T
}

export function previewLadder(request: LadderRequest) {
   return postJson<LadderPreview>('/api/ladder/preview', request)
}

export function precheckLadder(planId: string) {
   return postJson<PrecheckResponse>('/api/ladder/precheck', { planId })
}

export function placeLadder(planId: string, confirmation: string) {
   return postJson<PlaceResponse>('/api/ladder/place', { planId, confirmation })
}

export async function fetchDegiro() {
   const response = await fetch('/api/degiro')
   if (!response.ok) {
      throw new Error(await errorText(response))
   }
   return { dashboard: await response.json() as DegiroDashboard | null }
}

async function put(path: string, contentType: string, body: BodyInit) {
   const response = await fetch(path, { method: 'PUT', headers: { 'Content-Type': contentType }, body })
   if (!response.ok) {
      throw new Error(await errorText(response))
   }
}

export function uploadStatement(file: File) {
   return put('/api/degiro/statement', 'text/csv', file)
}

export type DegiroSettingsChange = Partial<Pick<DegiroSettings, 'profile' | 'customCreditPct' | 'portfolioRiskPct'>>

export function saveDegiroSettings(changes: DegiroSettingsChange) {
   return put('/api/degiro/settings', 'application/json', JSON.stringify(changes))
}

export function setCreditOverride(isin: string, creditPct: number | null) {
   return put(`/api/degiro/credit/${encodeURIComponent(isin)}`, 'application/json', JSON.stringify({ creditPct }))
}
