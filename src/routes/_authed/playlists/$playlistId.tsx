import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
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
  deletePlaylistFn,
  addSongToPlaylistFn,
  removePlaylistItemFn,
  reorderPlaylistFn,
  addEventDateFn,
  removeEventDateFn,
} from '@/server/playlists'
import { createShareLinkFn, revokeShareLinkFn } from '@/server/shareLinks'
import { updateSongFn } from '@/server/songs'
import { playlistKeys, playlistQueries } from '@/queries/playlists'
import { songKeys, songQueries } from '@/queries/songs'
import { groupQueries } from '@/queries/groups'
import { useIsManager } from '@/queries/session'
import { useConfirm } from '@/components/confirm-dialog'
import { useAppForm } from '@/lib/form'
import { CreateSongForm, type UpdateSongInput } from '@/domain/songs'
import { PdfViewer } from '@/components/pdf-viewer'
import { AudioPlayer } from '@/components/audio-player'
import { formatEventDate } from '@/lib/dates'
import { useSearchPaging } from '@/hooks/use-search-paging'

export const Route = createFileRoute('/_authed/playlists/$playlistId')({
  loader: async ({ params: { playlistId }, context: { queryClient } }) => {
    try {
      await Promise.all([
        queryClient.ensureQueryData(playlistQueries.detail(playlistId)),
        queryClient.ensureQueryData(playlistQueries.shareLinks(playlistId)),
        queryClient.ensureQueryData(groupQueries.options()),
      ])
    } catch {
      throw redirect({ to: '/playlists' })
    }
  },
  component: PlaylistDetailPage,
})

function PlaylistDetailPage() {
  const { playlistId } = Route.useParams()
  const {
    data: { playlist, items, eventDates },
  } = useSuspenseQuery(playlistQueries.detail(playlistId))
  const { data: shareLinks } = useSuspenseQuery(playlistQueries.shareLinks(playlistId))
  const { data: allGroups } = useSuspenseQuery(groupQueries.options())
  const isManager = useIsManager()
  const navigate = Route.useNavigate()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const deletePlaylist = useMutation({
    mutationFn: () => deletePlaylistFn({ data: { playlistId } }),
    meta: { errorMessage: 'Suppression impossible' },
    onSuccess: async () => {
      await navigate({ to: '/playlists' })
      queryClient.removeQueries({ queryKey: playlistKeys.detail(playlistId) })
      await queryClient.invalidateQueries({ queryKey: playlistKeys.all })
    },
  })

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
                deletePlaylist.mutate()
              }}
            >
              Supprimer
            </Button>
          ) : null}
        </div>
      </header>

      <EventDatesCard playlistId={playlist.id} eventDates={eventDates} isManager={isManager} />

      <SongList playlistId={playlist.id} items={items} excludeSongIds={songIdsInPlaylist} isManager={isManager} />

      <ShareLinksCard playlistId={playlist.id} shareLinks={shareLinks} allGroups={allGroups} isManager={isManager} />
    </div>
  )
}

function SongList({
  playlistId,
  items,
  excludeSongIds,
  isManager,
}: {
  playlistId: string
  items: Array<{
    itemId: string
    position: number
    song: EditableSong
  }>
  excludeSongIds: Set<string>
  isManager: boolean
}) {
  const confirm = useConfirm()
  // dnd-kit otherwise numbers its aria ids with a module counter, which differs
  // between the SSR render and hydration.
  const dndId = useId()
  const [addOpen, setAddOpen] = useState(false)
  const queryClient = useQueryClient()
  const detailKey = playlistQueries.detail(playlistId).queryKey
  // Ordering, membership and dates also drive the dashboard and share pages.
  const invalidates = [playlistKeys.all]

  const reorder = useMutation({
    mutationFn: (itemIdsInOrder: Array<string>) => reorderPlaylistFn({ data: { playlistId, itemIdsInOrder } }),
    // Optimistic: the dropped row stays where it was dropped while saving.
    onMutate: async (itemIdsInOrder) => {
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previous = queryClient.getQueryData(detailKey)
      queryClient.setQueryData(detailKey, (old) =>
        old
          ? {
              ...old,
              items: itemIdsInOrder.flatMap((id, position) => {
                const item = old.items.find((i) => i.itemId === id)
                return item ? [{ ...item, position }] : []
              }),
            }
          : old,
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: playlistKeys.all }),
    meta: { errorMessage: "L'ordre n'a pas pu être enregistré, la playlist a été rechargée" },
  })
  const addSong = useMutation({
    mutationFn: (songId: string) => addSongToPlaylistFn({ data: { playlistId, songId } }),
    meta: { errorMessage: 'Ajout impossible', invalidates },
  })
  const removeItem = useMutation({
    mutationFn: (itemId: string) => removePlaylistItemFn({ data: { playlistId, itemId } }),
    meta: { errorMessage: 'Retrait impossible', invalidates },
  })
  const order = items.map((i) => i.itemId)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    if (!isManager) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(String(active.id))
    const newIndex = order.indexOf(String(over.id))
    reorder.mutate(arrayMove(order, oldIndex, newIndex))
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
                  onAdd={(songId) => addSong.mutateAsync(songId).then(() => undefined, () => undefined)}
                />
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                  onRemove={async () => {
                    const ok = await confirm({
                      title: 'Retirer ce chant',
                      description: `"${item.song.title}" sera retiré de la playlist.`,
                      confirmLabel: 'Retirer',
                    })
                    if (!ok) return
                    removeItem.mutate(itemId)
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

type EditableSong = {
  id: string
  title: string
  composer: string | null
  arranger: string | null
  key: string | null
  tempo: string | null
  notes: string | null
}

function SortableSongRow({
  itemId,
  song,
  isManager,
  onRemove,
}: {
  itemId: string
  song: EditableSong
  isManager: boolean
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
              <EditSongForm song={song} onSaved={() => setEditOpen(false)} />
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
  // Only fetched once the dialog is opened; shared with the song page cache.
  const { data } = useQuery({ ...songQueries.detail(songId), enabled: open })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
  song: EditableSong
  onSaved: () => void
}) {
  const updateSong = useMutation({
    mutationFn: (data: UpdateSongInput) => updateSongFn({ data }),
    meta: { invalidates: [songKeys.all, playlistKeys.all] },
  })

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
      try {
        await updateSong.mutateAsync({
          songId: song.id,
          title: value.title,
          composer: value.composer || null,
          arranger: value.arranger || null,
          key: value.key || null,
          tempo: value.tempo || null,
          // Not editable here: keep it instead of wiping it.
          notes: song.notes,
        })
      } catch {
        return // shown inline below
      }
      onSaved()
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
      {updateSong.isError ? <p className="text-sm text-destructive">Impossible de modifier le chant</p> : null}
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
  const { searchInput, setSearchInput, params, setPage } = useSearchPaging()
  const page = params.page
  const { data: result } = useQuery(songQueries.list(params))
  const [addingId, setAddingId] = useState<string | null>(null)

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


function EventDatesCard({
  playlistId,
  eventDates,
  isManager,
}: {
  playlistId: string
  eventDates: Array<{ id: string; eventDate: string | Date }>
  isManager: boolean
}) {
  const confirm = useConfirm()
  const [value, setValue] = useState('')
  const invalidates = [playlistKeys.all]
  const addDate = useMutation({
    mutationFn: (eventDate: string) => addEventDateFn({ data: { playlistId, eventDate } }),
    meta: { errorMessage: 'Ajout de la date impossible', invalidates },
    onSuccess: () => setValue(''),
  })
  const removeDate = useMutation({
    mutationFn: (eventDateId: string) => removeEventDateFn({ data: { playlistId, eventDateId } }),
    meta: { errorMessage: 'Suppression impossible', invalidates },
  })

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
              <span>{formatEventDate(d.eventDate)}</span>
              {isManager ? (
                <button
                  className="text-xs text-destructive hover:underline"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Supprimer cette date',
                      description: formatEventDate(d.eventDate),
                      confirmLabel: 'Supprimer',
                    })
                    if (!ok) return
                    removeDate.mutate(d.id)
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
              disabled={addDate.isPending || !value}
              onClick={() => addDate.mutate(new Date(value).toISOString())}
            >
              {addDate.isPending ? 'Ajout…' : 'Ajouter'}
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
}: {
  playlistId: string
  shareLinks: Array<{
    link: { id: string; token: string; revokedAt: string | Date | null }
    groups: Array<{ id: string; name: string }>
  }>
  allGroups: Array<{ id: string; name: string }>
  isManager: boolean
}) {
  const confirm = useConfirm()
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set())
  const invalidates = [playlistKeys.shareLinks(playlistId)]
  const createLink = useMutation({
    mutationFn: (ids: Array<string>) => createShareLinkFn({ data: { playlistId, groupIds: ids } }),
    meta: { errorMessage: 'Création du lien impossible', invalidates },
    onSuccess: () => setGroupIds(new Set()),
  })
  const revokeLink = useMutation({
    mutationFn: (shareLinkId: string) => revokeShareLinkFn({ data: { shareLinkId } }),
    meta: { errorMessage: 'Révocation impossible', invalidates },
  })
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
            <Button disabled={createLink.isPending} onClick={() => createLink.mutate([...groupIds])}>
              {createLink.isPending ? 'Création…' : 'Créer un lien'}
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
                        revokeLink.mutate(link.id)
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
