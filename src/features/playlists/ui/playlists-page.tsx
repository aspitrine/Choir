import { Link } from '@tanstack/react-router'
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
import { CreateGroupForm } from '@/features/groups/domain/group'
import { createPlaylistFn } from '@/features/playlists/server/playlists.functions'
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
