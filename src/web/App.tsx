import { useEffect, useState } from 'react'

import { AppHeader } from '@/components/app-header'
import { Dashboard } from '@/components/dashboard'
import { DegiroPage } from '@/components/degiro/degiro-page'
import { LadderPage } from '@/components/ladder/ladder-page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePolling } from '@/hooks/use-polling'
import { fetchDashboard, fetchDegiro, fetchSession, logout, NotLoggedInError } from '@/lib/api'

const DASHBOARD_INTERVAL_MS = 60_000
const SESSION_INTERVAL_MS = 30_000

type Tab = 'saxo' | 'degiro' | 'ladder'

function tabFromHash(): Tab {
   const hash = window.location.hash.slice(1)
   return hash === 'degiro' || hash === 'ladder' ? hash : 'saxo'
}

function LoginCard({ error }: { error: string | null }) {
   return (
      <Card className="mx-auto mt-8 w-full max-w-lg">
         <CardHeader>
            <CardTitle>Log in to Saxo</CardTitle>
            <CardDescription>
               The server keeps the login alive in the background, so you only log in again when Saxo ends the session.
            </CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
            {error && (
               <Alert variant="destructive">
                  <AlertTitle>Not logged in</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
               </Alert>
            )}
            <Button asChild className="w-full">
               <a href="/api/login">Log in with Saxo</a>
            </Button>
         </CardContent>
      </Card>
   )
}

function Loading() {
   return (
      <div className="grid gap-4 lg:grid-cols-3">
         {[0, 1, 2].map(index => <Skeleton key={index} className="h-72 rounded-xl" />)}
      </div>
   )
}

export default function App() {
   const [tab, setTab] = useState(tabFromHash)
   const session = usePolling(fetchSession, SESSION_INTERVAL_MS)
   const loggedIn = session.data?.loggedIn ?? false
   const dashboard = usePolling(fetchDashboard, DASHBOARD_INTERVAL_MS, loggedIn)
   const degiro = usePolling(fetchDegiro, DASHBOARD_INTERVAL_MS, tab === 'degiro')
   const reloadSession = session.reload

   useEffect(() => {
      if (dashboard.error instanceof NotLoggedInError) {
         void reloadSession()
      }
   }, [dashboard.error, reloadSession])

   function reload() {
      void session.reload()
      if (loggedIn) {
         void dashboard.reload()
      }
      if (tab === 'degiro') {
         void degiro.reload()
      }
   }

   async function signOut() {
      await logout()
      await session.reload()
   }

   function selectTab(next: string) {
      setTab(next as Tab)
      window.history.replaceState(null, '', `#${next}`)
   }

   const data = loggedIn ? dashboard.data : null
   const loginCard = session.data && !loggedIn && <LoginCard error={session.data.error} />

   return (
      <main className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6">
         <AppHeader
            client={data?.client ?? null}
            session={session.data}
            fetchedAt={(tab === 'degiro' ? degiro.data?.dashboard?.fetchedAt : data?.fetchedAt) ?? null}
            onReload={reload}
            onLogout={loggedIn ? () => void signOut() : undefined}
         />
         {session.error && (
            <Alert variant="destructive">
               <AlertTitle>The dashboard server did not answer</AlertTitle>
               <AlertDescription>{session.error.message}</AlertDescription>
            </Alert>
         )}
         <Tabs value={tab} onValueChange={selectTab}>
            <TabsList>
               <TabsTrigger value="saxo">Saxo</TabsTrigger>
               <TabsTrigger value="degiro">DEGIRO</TabsTrigger>
               <TabsTrigger value="ladder">Ladder orders</TabsTrigger>
            </TabsList>
            <TabsContent value="saxo" className="grid gap-4">
               {loginCard}
               {dashboard.error && loggedIn && !(dashboard.error instanceof NotLoggedInError) && (
                  <Alert variant="destructive">
                     <AlertTitle>Could not load the portfolio{data ? ', showing the last data' : ''}</AlertTitle>
                     <AlertDescription>{dashboard.error.message}</AlertDescription>
                  </Alert>
               )}
               {loggedIn && (data ? <Dashboard data={data} /> : !dashboard.error && <Loading />)}
            </TabsContent>
            <TabsContent value="degiro">
               <DegiroPage state={degiro} />
            </TabsContent>
            <TabsContent value="ladder" forceMount className="data-[state=inactive]:hidden">
               {loginCard}
               {loggedIn && <LadderPage onOrdersPlaced={() => void dashboard.reload()} />}
            </TabsContent>
         </Tabs>
      </main>
   )
}
