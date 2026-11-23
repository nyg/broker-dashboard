import { LogOutIcon, RefreshCwIcon } from 'lucide-react'

import { SourceLink } from '@/components/source-link'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { time } from '@/lib/format'

import type { ClientSummary, SessionStatus } from '../../shared/dashboard.ts'

interface AppHeaderProps {
   client: ClientSummary | null
   session: SessionStatus | null
   fetchedAt: string | null
   onReload?: () => void
   onLogout?: () => void
}

export function AppHeader({ client, session, fetchedAt, onReload, onLogout }: AppHeaderProps) {
   return (
      <header className="flex flex-wrap items-center justify-between gap-3">
         <div>
            <h1 className="text-xl font-semibold">{client?.name || 'Saxo dashboard'}</h1>
            {client && (
               <p className="text-sm text-muted-foreground">
                  Client {client.clientId}, default currency {client.currency}
               </p>
            )}
         </div>
         <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {fetchedAt && <span>Updated {time(fetchedAt)}</span>}
            {session?.loggedIn && (
               <span title="The server refreshes the Saxo login in the background.">
                  Login refreshed {time(session.refreshedAt)}
               </span>
            )}
            {onReload && (
               <Button variant="ghost" size="icon" onClick={onReload} aria-label="Reload now">
                  <RefreshCwIcon />
               </Button>
            )}
            {onLogout && (
               <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Log out of Saxo">
                  <LogOutIcon />
               </Button>
            )}
            <SourceLink />
            <ThemeToggle />
         </div>
      </header>
   )
}
