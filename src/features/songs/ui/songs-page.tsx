import { Link, getRouteApi } from '@tanstack/react-router'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/primitives/button'
import { Card, CardContent } from '@/shared/ui/primitives/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/shared/ui/primitives/dialog'
import { Input } from '@/shared/ui/primitives/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/primitives/table'
import { TablePager } from '@/shared/ui/table-pager'
import { useAppForm } from '@/shared/ui/form/form'
import { CreateSongForm, type CreateSongInput } from '@/features/songs/domain/song'
import { createSongFn } from '@/features/songs/server/songs.functions'
import { songKeys, songQueries } from '@/features/songs/ui/queries'
import { useIsManager } from '@/features/auth/ui/queries'

const routeApi = getRouteApi('/_authed/songs/')

export function SongsPage() {
  const deps = routeApi.useLoaderDeps()
  const {
    data: { rows: songs, total, page, pageSize },
  } = useSuspenseQuery(songQueries.list(deps))
  const isManager = useIsManager()
  const { q } = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const [open, setOpen] = useState(isManager && total === 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const [searchInput, setSearchInput] = useState(q ?? '')
  useEffect(() => setSearchInput(q ?? ''), [q])
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== (q ?? '')) {
        navigate({ search: (prev) => ({ ...prev, q: searchInput || undefined, page: undefined }) })
      }
    }, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  return (
    <div className="w-full space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Chants</h1>
          <p className="text-sm text-muted-foreground">{total} chant(s)</p>
        </div>
        {isManager ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Nouveau chant</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouveau chant</DialogTitle>
                <DialogDescription>Titre requis, le reste est optionnel</DialogDescription>
              </DialogHeader>
              <CreateSongDialogForm onCreated={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        ) : null}
      </header>

      <Card>
        <CardContent className="space-y-3">
          <Input
            value={searchInput}
            placeholder="Rechercher un titre ou compositeur…"
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Compositeur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {songs.map((song) => (
                <TableRow key={song.id} className="cursor-pointer">
                  <TableCell className="p-0">
                    <Link
                      to="/songs/$songId"
                      params={{ songId: song.id }}
                      className="block px-4 py-2 font-medium"
                    >
                      {song.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{song.composer}</TableCell>
                </TableRow>
              ))}
              {songs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    Aucun résultat
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <TablePager
            page={page}
            totalPages={totalPages}
            onPrev={() => navigate({ search: (prev) => ({ ...prev, page: page - 1 }) })}
            onNext={() => navigate({ search: (prev) => ({ ...prev, page: page + 1 }) })}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function CreateSongDialogForm({ onCreated }: { onCreated: () => void }) {
  const createSong = useMutation({
    mutationFn: (data: CreateSongInput) => createSongFn({ data }),
    meta: { invalidates: [songKeys.all] },
  })

  const form = useAppForm({
    defaultValues: {
      title: '',
      composer: '',
      arranger: '',
      key: '',
      tempo: '',
    },
    validators: { onChange: CreateSongForm },
    onSubmit: async ({ value, formApi }) => {
      try {
        await createSong.mutateAsync({
          title: value.title,
          composer: value.composer || null,
          arranger: value.arranger || null,
          key: value.key || null,
          tempo: value.tempo || null,
          notes: null,
        })
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
        name="title"
        children={(field) => <field.TextField label="Titre" placeholder="Amazing Grace" autoFocus />}
      />
      <form.AppField name="composer" children={(field) => <field.TextField label="Compositeur" />} />
      <form.AppField name="arranger" children={(field) => <field.TextField label="Arrangeur" />} />
      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="key" children={(field) => <field.TextField label="Tonalité" placeholder="Ré majeur" />} />
        <form.AppField name="tempo" children={(field) => <field.TextField label="Tempo" placeholder="90 BPM" />} />
      </div>
      {createSong.isError ? <p className="text-sm text-destructive">Impossible de créer le chant</p> : null}
      <form.AppForm>
        <form.SubmitButton label="Créer" pendingLabel="Création…" />
      </form.AppForm>
    </form>
  )
}
