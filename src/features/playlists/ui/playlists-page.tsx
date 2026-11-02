import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/shared/ui/primitives/button'
import { Card, CardContent } from '@/shared/ui/primitives/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/shared/ui/primitives/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/primitives/table'
import { useAppForm } from '@/shared/ui/form/form'
import { PlaylistForm } from '@/features/playlists/domain/playlist'
import { createPlaylistFn, duplicatePlaylistFn } from '@/features/playlists/server/playlists.functions'
import { playlistKeys, playlistQueries } from '@/features/playlists/ui/queries'
import { useIsManager } from '@/features/auth/ui/queries'
export function PlaylistsPage() {
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
                {isManager ? <TableHead className="w-0" /> : null}
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
                  {isManager ? (
                    <TableCell>
                      <DuplicatePlaylistDialog playlist={p} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {playlists.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isManager ? 3 : 2} className="text-center text-muted-foreground">
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

/** Copies the songs and their order into a new playlist, e.g. to prepare next year's event from this one. */
function DuplicatePlaylistDialog({ playlist }: { playlist: { id: string; name: string } }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const duplicate = useMutation({
    mutationFn: (name: string) => duplicatePlaylistFn({ data: { playlistId: playlist.id, name } }),
    meta: { invalidates: [playlistKeys.all] },
  })

  const form = useAppForm({
    defaultValues: { name: `${playlist.name} (copie)` },
    validators: { onChange: PlaylistForm },
    onSubmit: async ({ value }) => {
      let copy
      try {
        copy = await duplicate.mutateAsync(value.name)
      } catch {
        return // shown inline below
      }
      setOpen(false)
      await navigate({ to: '/playlists/$playlistId', params: { playlistId: copy.id } })
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset()
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Dupliquer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dupliquer la playlist</DialogTitle>
          <DialogDescription>
            Les chants de "{playlist.name}" sont copiés dans le même ordre. Les dates et liens de partage ne
            sont pas copiés.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField
            name="name"
            children={(field) => <field.TextField label="Nom de la nouvelle playlist" autoFocus />}
          />
          {duplicate.isError ? <p className="text-sm text-destructive">Impossible de dupliquer la playlist</p> : null}
          <form.AppForm>
            <form.SubmitButton label="Dupliquer" pendingLabel="Duplication…" />
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CreatePlaylistDialogForm({ onCreated }: { onCreated: () => void }) {
  const createPlaylist = useMutation({
    mutationFn: (name: string) => createPlaylistFn({ data: { name, description: null } }),
    meta: { invalidates: [playlistKeys.all] },
  })

  const form = useAppForm({
    defaultValues: { name: '' },
    validators: { onChange: PlaylistForm },
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
