import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSuspenseQuery } from '@tanstack/react-query'
import { playlistQueries } from '@/queries/playlists'
import { sessionQueries, useRole } from '@/queries/session'
import { formatEventDate } from '@/lib/dates'

export const Route = createFileRoute('/_authed/dashboard')({
  // No active choir → nothing to load; the page offers the choir picker instead.
  loader: async ({ context: { queryClient } }) => {
    const role = await queryClient.ensureQueryData(sessionQueries.role())
    if (role !== null) await queryClient.ensureQueryData(playlistQueries.upcoming())
  },
  component: Dashboard,
})

function Dashboard() {
  const role = useRole()

  return (
    <div className="w-full space-y-6 p-8">
      <header>
        <h1 className="text-xl font-bold">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">Playlists à venir</p>
      </header>

      {role === null ? (
        <Card>
          <CardHeader>
            <CardTitle>Aucune chorale active</CardTitle>
            <CardDescription>
              Choisissez ou créez une chorale via le menu en haut à droite
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <UpcomingPlaylists />
      )}
    </div>
  )
}

function UpcomingPlaylists() {
  const { data: upcoming } = useSuspenseQuery(playlistQueries.upcoming())

  return (
    <Card>
      <CardContent className="space-y-2">
        {upcoming.map(({ playlist, nextEventDate, eventDateCount }) => (
          <Link
            key={playlist.id}
            to="/playlists/$playlistId"
            params={{ playlistId: playlist.id }}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="font-medium">{playlist.name}</span>
            <span className="text-muted-foreground">
              {nextEventDate ? formatEventDate(nextEventDate) : eventDateCount === 0 ? 'Pas de date' : null}
            </span>
          </Link>
        ))}
        {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Aucune playlist à venir</p> : null}
      </CardContent>
    </Card>
  )
}
