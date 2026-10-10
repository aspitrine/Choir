import { useState } from 'react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/shared/ui/primitives/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/ui/primitives/dialog'
import { PdfViewer } from '@/shared/ui/media/pdf-viewer'
import { AudioPlayer } from '@/shared/ui/media/audio-player'
import { SharedBundles } from '@/features/sharing/ui/shared-bundles'
import { useSuspenseQuery } from '@tanstack/react-query'
import { publicQueries } from '@/features/sharing/ui/queries'
import { getRouteApi } from '@tanstack/react-router'

const routeApi = getRouteApi('/s/$token')

type PlaylistItem = ReturnType<typeof routeApi.useLoaderData>['items'][number]
type PlaylistAsset = PlaylistItem['assets'][number]

export function LinkNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Lien introuvable</CardTitle>
          <CardDescription>Ce lien a expiré ou a été révoqué.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export function PublicPlaylistPage() {
  const { token } = routeApi.useParams()
  // Subscribed: refetched once stale, which renews the presigned file URLs.
  const { data } = useSuspenseQuery(publicQueries.playlist(token))
  const [selected, setSelected] = useState<PlaylistItem | null>(null)

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <header>
        <h1 className="text-xl font-bold">{data.playlist.name}</h1>
        {data.playlist.description ? (
          <p className="text-sm text-muted-foreground">{data.playlist.description}</p>
        ) : null}
      </header>

      <div className="divide-y rounded-md border">
        {data.items.map((item, i) => (
          <button
            // A song can be in the playlist twice (encore).
            key={`${item.song.id}-${i}`}
            className="flex w-full flex-col px-4 py-3 text-left text-sm hover:bg-accent"
            onClick={() => setSelected(item)}
          >
            <span className="font-medium">{item.song.title}</span>
            {item.song.composer || item.song.key || item.song.tempo ? (
              <span className="text-xs text-muted-foreground">
                {[item.song.composer, item.song.key, item.song.tempo].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </button>
        ))}
        {data.items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Cette playlist est vide</p>
        ) : null}
      </div>

      <SharedBundles token={token} items={data.items} />

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.song.title}</DialogTitle>
                <DialogDescription>
                  {[selected.song.composer, selected.song.arranger].filter(Boolean).join(' · ') || undefined}
                </DialogDescription>
              </DialogHeader>

              {selected.song.key || selected.song.tempo ? (
                <div className="flex gap-4 text-sm text-muted-foreground">
                  {selected.song.key ? <span>Tonalité : {selected.song.key}</span> : null}
                  {selected.song.tempo ? <span>Tempo : {selected.song.tempo}</span> : null}
                </div>
              ) : null}

              <div className="max-h-[70vh] space-y-4 overflow-y-auto">
                {selected.assets.map((a: PlaylistAsset) => (
                  <div key={a.id} className="space-y-1">
                    <p className="text-sm font-medium">
                      {a.kind === 'score' ? 'Partition' : 'Audio'}
                      {a.label ? ` — ${a.label}` : ''}
                    </p>
                    {a.kind === 'score' ? <PdfViewer url={a.url} /> : <AudioPlayer url={a.url} />}
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs text-muted-foreground hover:underline"
                    >
                      Télécharger
                    </a>
                  </div>
                ))}
                {selected.assets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun fichier disponible</p>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
