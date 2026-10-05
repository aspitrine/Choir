import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAppForm } from '@/lib/form'
import { CreateGroupForm } from '@/domain/groups'
import { createPlaylistFn } from '@/server/playlists'
import { playlistKeys, playlistQueries } from '@/queries/playlists'
import { useIsManager } from '@/queries/session'

export const Route = createFileRoute('/_authed/playlists/')({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(playlistQueries.list()),
  component: PlaylistsPage,
})

function PlaylistsPage() {
  const { data: playlists } = useSuspenseQuery(playlistQueries.list())
  const isManager = useIsManager()
  const [open, setOpen] = useState(isManager && playlists.length === 0)

  return (
    <div className="w-full space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Playlists</h1>
          <p className="text-sm text-muted-foreground">{playlists.length} playlist(s)</p>
        </div>
        {isManager ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Nouvelle playlist</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouvelle playlist</DialogTitle>
                <DialogDescription>Ex: Messe de Noël, Répétition du 12 mars…</DialogDescription>
              </DialogHeader>
              <CreatePlaylistDialogForm onCreated={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        ) : null}
      </header>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {playlists.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="p-0">
                    <Link to="/playlists/$playlistId" params={{ playlistId: p.id }} className="block px-4 py-2 font-medium">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.description}</TableCell>
                </TableRow>
              ))}
              {playlists.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    Aucune playlist pour l'instant
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function CreatePlaylistDialogForm({ onCreated }: { onCreated: () => void }) {
  const createPlaylist = useMutation({
    mutationFn: (name: string) => createPlaylistFn({ data: { name, description: null } }),
    meta: { invalidates: [playlistKeys.all] },
  })

  const form = useAppForm({
    defaultValues: { name: '' },
    validators: { onChange: CreateGroupForm },
    onSubmit: async ({ value, formApi }) => {
      try {
        await createPlaylist.mutateAsync(value.name)
      } catch {
        return // shown inline below
      }
      formApi.reset()
      onCreated()
    },
  })

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField
        name="name"
        children={(field) => <field.TextField label="Nom" placeholder="Messe de Noël" autoFocus />}
      />
      {createPlaylist.isError ? <p className="text-sm text-destructive">Impossible de créer la playlist</p> : null}
      <form.AppForm>
        <form.SubmitButton label="Créer" pendingLabel="Création…" />
      </form.AppForm>
    </form>
  )
}
