import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TablePager } from '@/components/table-pager'
import {
  getPlaylistFn,
  deletePlaylistFn,
  addSongToPlaylistFn,
  removePlaylistItemFn,
  reorderPlaylistFn,
  addEventDateFn,
  removeEventDateFn,
} from '@/server/playlists'
import { listShareLinksFn, createShareLinkFn, revokeShareLinkFn } from '@/server/shareLinks'
import { listSongsFn, updateSongFn, getSongFn } from '@/server/songs'
import { listGroupsFn } from '@/server/groups'
import { getMyRoleFn } from '@/server/members'
import { useConfirm } from '@/components/confirm-dialog'
import { useAppForm } from '@/lib/form'
import { CreateSongForm } from '@/domain/songs'
import { PdfViewer } from '@/components/pdf-viewer'
import { AudioPlayer } from '@/components/audio-player'

export const Route = createFileRoute('/_authed/playlists/$playlistId')({
  loader: async ({ params }) => {
    try {
      const [data, shareLinks, allGroups, role] = await Promise.all([
        getPlaylistFn({ data: { playlistId: params.playlistId } }),
        listShareLinksFn({ data: { playlistId: params.playlistId } }),
        listGroupsFn(),
        getMyRoleFn(),
      ])
      return { ...data, shareLinks, allGroups, role }
    } catch {
      throw redirect({ to: '/playlists' })
    }
  },
  component: PlaylistDetailPage,
})

function PlaylistDetailPage() {
  const { playlist, items, shareLinks, allGroups, eventDates, role } = Route.useLoaderData()
  const isManager = role === 'owner' || role === 'admin'
  const router = useRouter()
  const navigate = Route.useNavigate()
  const confirm = useConfirm()

  const songIdsInPlaylist = new Set(items.map((i) => i.song.id))

  return (
    <div className="w-full space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{playlist.name}</h1>
          {playlist.description ? (
            <p className="text-sm text-muted-foreground">{playlist.description}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Link to="/playlists">
            <Button variant="outline">Retour</Button>
          </Link>
          {isManager ? (
            <Button
              variant="destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Supprimer cette playlist',
                  description: `"${playlist.name}" et ses liens de partage seront supprimés définitivement.`,
                  confirmLabel: 'Supprimer',
                })
                if (!ok) return
                await deletePlaylistFn({ data: { playlistId: playlist.id } })
                navigate({ to: '/playlists' })
              }}
            >
              Supprimer
            </Button>
          ) : null}
        </div>
      </header>

      <EventDatesCard
        playlistId={playlist.id}
        eventDates={eventDates}
        isManager={isManager}
        onChanged={() => router.invalidate()}
      />

      <SongList
        playlistId={playlist.id}
        items={items}
        excludeSongIds={songIdsInPlaylist}
        isManager={isManager}
        onChanged={() => router.invalidate()}
      />

      <ShareLinksCard
        playlistId={playlist.id}
        shareLinks={shareLinks}
        allGroups={allGroups}
        isManager={isManager}
        onChanged={() => router.invalidate()}
      />
    </div>
  )
}

function SongList({
  playlistId,
  items,
  excludeSongIds,
  isManager,
  onChanged,
}: {
  playlistId: string
  items: Array<{
    itemId: string
    position: number
    song: {
      id: string
      title: string
      composer: string | null
      arranger: string | null
      key: string | null
      tempo: string | null
    }
  }>
  excludeSongIds: Set<string>
  isManager: boolean
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [order, setOrder] = useState(items.map((i) => i.itemId))
  if (order.length !== items.length || order.some((id) => !items.some((i) => i.itemId === id))) {
    setOrder(items.map((i) => i.itemId))
  }
  const [addOpen, setAddOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    if (!isManager) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(String(active.id))
    const newIndex = order.indexOf(String(over.id))
    const next = arrayMove(order, oldIndex, newIndex)
    setOrder(next)
    await reorderPlaylistFn({ data: { playlistId, itemIdsInOrder: next } })
    onChanged()
  }

  const byId = new Map(items.map((i) => [i.itemId, i]))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Chants</CardTitle>
            <CardDescription>
              {items.length} chant(s){isManager ? ' — glissez pour réordonner' : ''}
            </CardDescription>
          </div>
          {isManager ? (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>Ajouter un chant</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Ajouter un chant</DialogTitle>
                  <DialogDescription>Recherchez un chant à ajouter à la playlist</DialogDescription>
                </DialogHeader>
                <AddSongTable
                  excludeSongIds={excludeSongIds}
                  onAdd={async (songId) => {
                    await addSongToPlaylistFn({ data: { playlistId, songId } })
                    onChanged()
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((itemId) => {
              const item = byId.get(itemId)
              if (!item) return null
              return (
                <SortableSongRow
                  key={itemId}
                  itemId={itemId}
                  song={item.song}
                  isManager={isManager}
                  onChanged={onChanged}
                  onRemove={async () => {
                    const ok = await confirm({
                      title: 'Retirer ce chant',
                      description: `"${item.song.title}" sera retiré de la playlist.`,
                      confirmLabel: 'Retirer',
                    })
                    if (!ok) return
                    await removePlaylistItemFn({ data: { playlistId, itemId } })
                    onChanged()
                  }}
                />
              )
            })}
          </SortableContext>
        </DndContext>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun chant pour l'instant</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SortableSongRow({
  itemId,
  song,
  isManager,
  onChanged,
  onRemove,
}: {
  itemId: string
  song: {
    id: string
    title: string
    composer: string | null
    arranger: string | null
    key: string | null
    tempo: string | null
  }
  isManager: boolean
  onChanged: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
    disabled: !isManager,
  })
  const [editOpen, setEditOpen] = useState(false)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 rounded-md border bg-background px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-2">
        {isManager ? (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label="Réordonner"
          >
            ⠿
          </button>
        ) : null}
        <div>
          <div className="font-medium">{song.title}</div>
          {song.composer ? <div className="text-xs text-muted-foreground">{song.composer}</div> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SongDetailsDialog songId={song.id} />
        {isManager ? (
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <button className="text-xs text-muted-foreground hover:underline">Modifier</button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Modifier le chant</DialogTitle>
              </DialogHeader>
              <EditSongForm
                song={song}
                onSaved={async () => {
                  setEditOpen(false)
                  onChanged()
                }}
              />
            </DialogContent>
          </Dialog>
        ) : null}
        <Link
          to="/songs/$songId"
          params={{ songId: song.id }}
          className="text-xs text-muted-foreground hover:underline"
        >
          Gérer les fichiers
        </Link>
        {isManager ? (
          <button className="text-xs text-destructive hover:underline" onClick={onRemove}>
            Retirer
          </button>
        ) : null}
      </div>
    </div>
  )
}

function SongDetailsDialog({ songId }: { songId: string }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Awaited<ReturnType<typeof getSongFn>> | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next && !data) getSongFn({ data: { songId } }).then(setData)
      }}
    >
      <DialogTrigger asChild>
        <button className="text-xs text-muted-foreground hover:underline">Détails</button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        {!data ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{data.song.title}</DialogTitle>
              <DialogDescription>
                {[data.song.composer, data.song.arranger].filter(Boolean).join(' · ') || undefined}
              </DialogDescription>
            </DialogHeader>
            {data.song.key || data.song.tempo ? (
              <div className="flex gap-4 text-sm text-muted-foreground">
                {data.song.key ? <span>Tonalité : {data.song.key}</span> : null}
                {data.song.tempo ? <span>Tempo : {data.song.tempo}</span> : null}
              </div>
            ) : null}
            <div className="max-h-[70vh] space-y-4 overflow-y-auto">
              {data.assets.map((a) => (
                <div key={a.id} className="space-y-1">
                  <p className="text-sm font-medium">
                    {a.kind === 'score' ? 'Partition' : 'Audio'}
                    {a.label ? ` — ${a.label}` : ''}
                  </p>
                  {a.url ? (
                    a.kind === 'score' ? <PdfViewer url={a.url} /> : <AudioPlayer url={a.url} />
                  ) : (
                    <p className="text-xs text-muted-foreground">Fichier en cours de traitement</p>
                  )}
                </div>
              ))}
              {data.assets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun fichier pour l'instant</p>
              ) : null}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditSongForm({
  song,
  onSaved,
}: {
  song: {
    id: string
    title: string
    composer: string | null
    arranger: string | null
    key: string | null
    tempo: string | null
  }
  onSaved: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useAppForm({
    defaultValues: {
      title: song.title,
      composer: song.composer ?? '',
      arranger: song.arranger ?? '',
      key: song.key ?? '',
      tempo: song.tempo ?? '',
    },
    validators: { onChange: CreateSongForm },
    onSubmit: async ({ value }) => {
      setServerError(null)
      try {
        await updateSongFn({
          data: {
            songId: song.id,
            title: value.title,
            composer: value.composer || null,
            arranger: value.arranger || null,
            key: value.key || null,
            tempo: value.tempo || null,
            notes: null,
          },
        })
        onSaved()
      } catch {
        setServerError('Impossible de modifier le chant')
      }
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
        children={(field) => <field.TextField label="Titre" autoFocus />}
      />
      <form.AppField name="composer" children={(field) => <field.TextField label="Compositeur" />} />
      <form.AppField name="arranger" children={(field) => <field.TextField label="Arrangeur" />} />
      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="key" children={(field) => <field.TextField label="Tonalité" placeholder="Ré majeur" />} />
        <form.AppField name="tempo" children={(field) => <field.TextField label="Tempo" placeholder="90 BPM" />} />
      </div>
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <form.AppForm>
        <form.SubmitButton label="Enregistrer" pendingLabel="Enregistrement…" />
      </form.AppForm>
    </form>
  )
}

function AddSongTable({
  excludeSongIds,
  onAdd,
}: {
  excludeSongIds: Set<string>
  onAdd: (songId: string) => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<{
    rows: Array<{ id: string; title: string; composer: string | null }>
    total: number
    pageSize: number
  } | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    listSongsFn({ data: { q, page } }).then((res) => {
      if (!cancelled) setResult(res)
    })
    return () => {
      cancelled = true
    }
  }, [q, page])

  const rows = (result?.rows ?? []).filter((s) => !excludeSongIds.has(s.id))
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 1)))

  return (
    <div className="space-y-3">
      <Input
        value={searchInput}
        placeholder="Rechercher un titre ou compositeur…"
        onChange={(e) => setSearchInput(e.target.value)}
        autoFocus
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Titre</TableHead>
            <TableHead>Compositeur</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((song) => (
            <TableRow
              key={song.id}
              className="cursor-pointer"
              onClick={async () => {
                setAddingId(song.id)
                await onAdd(song.id)
                setAddingId(null)
              }}
            >
              <TableCell className="font-medium">
                {song.title}
                {addingId === song.id ? (
                  <span className="ml-2 text-xs text-muted-foreground">ajout…</span>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground">{song.composer}</TableCell>
            </TableRow>
          ))}
          {result && rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground">
                Aucun résultat
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <TablePager page={page} totalPages={totalPages} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
    </div>
  )
}

const eventDateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

function EventDatesCard({
  playlistId,
  eventDates,
  isManager,
  onChanged,
}: {
  playlistId: string
  eventDates: Array<{ id: string; eventDate: string | Date }>
  isManager: boolean
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [value, setValue] = useState('')
  const [adding, setAdding] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dates d'événement</CardTitle>
        <CardDescription>
          Optionnel — sans date, la playlist reste toujours affichée dans le tableau de bord
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {eventDates.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{eventDateFormatter.format(new Date(d.eventDate))}</span>
              {isManager ? (
                <button
                  className="text-xs text-destructive hover:underline"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Supprimer cette date',
                      description: eventDateFormatter.format(new Date(d.eventDate)),
                      confirmLabel: 'Supprimer',
                    })
                    if (!ok) return
                    await removeEventDateFn({ data: { playlistId, eventDateId: d.id } })
                    onChanged()
                  }}
                >
                  Supprimer
                </button>
              ) : null}
            </div>
          ))}
          {eventDates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune date planifiée</p>
          ) : null}
        </div>
        {isManager ? (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label htmlFor="event-date" className="text-sm font-medium">
                Ajouter une date
              </label>
              <Input
                id="event-date"
                type="datetime-local"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <Button
              disabled={adding || !value}
              onClick={async () => {
                setAdding(true)
                await addEventDateFn({ data: { playlistId, eventDate: new Date(value).toISOString() } })
                setValue('')
                setAdding(false)
                onChanged()
              }}
            >
              {adding ? 'Ajout…' : 'Ajouter'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
      onClick={async () => {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copié' : 'Copier'}
    </button>
  )
}

function ShareLinksCard({
  playlistId,
  shareLinks,
  allGroups,
  isManager,
  onChanged,
}: {
  playlistId: string
  shareLinks: Array<{
    link: { id: string; token: string; revokedAt: string | Date | null }
    groups: Array<{ id: string; name: string }>
  }>
  allGroups: Array<{ id: string; name: string }>
  isManager: boolean
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  // Read after mount only — window.location during SSR would mismatch the client render.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const active = shareLinks.filter((s) => !s.link.revokedAt)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liens de partage</CardTitle>
        <CardDescription>
          Aucun groupe sélectionné = tous les fichiers sont visibles
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isManager ? (
          <>
            {allGroups.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Groupes</p>
                <div className="flex flex-wrap gap-3">
                  {allGroups.map((grp) => (
                    <label key={grp.id} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={groupIds.has(grp.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(groupIds)
                          if (checked === true) next.add(grp.id)
                          else next.delete(grp.id)
                          setGroupIds(next)
                        }}
                      />
                      {grp.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <Button
              disabled={creating}
              onClick={async () => {
                setCreating(true)
                await createShareLinkFn({ data: { playlistId, groupIds: [...groupIds] } })
                setGroupIds(new Set())
                setCreating(false)
                onChanged()
              }}
            >
              {creating ? 'Création…' : 'Créer un lien'}
            </Button>
          </>
        ) : null}

        <div className="space-y-2">
          {active.map(({ link, groups }) => (
            <div key={link.id} className="space-y-1 rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <code className="truncate text-xs">{origin}/s/{link.token}</code>
                <div className="flex shrink-0 items-center gap-3">
                  <CopyLinkButton url={`${origin}/s/${link.token}`} />
                  {isManager ? (
                    <button
                      className="text-xs text-destructive hover:underline"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Révoquer ce lien',
                          description: 'Le lien cessera de fonctionner immédiatement. Cette action est irréversible.',
                          confirmLabel: 'Révoquer',
                        })
                        if (!ok) return
                        await revokeShareLinkFn({ data: { shareLinkId: link.id } })
                        onChanged()
                      }}
                    >
                      Révoquer
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {groups.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Tout le monde</span>
                ) : (
                  groups.map((g) => (
                    <Badge key={g.id} variant="secondary">
                      {g.name}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          ))}
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun lien actif</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
