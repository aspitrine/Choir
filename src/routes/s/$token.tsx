import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PdfViewer } from '@/components/pdf-viewer'
import { AudioPlayer } from '@/components/audio-player'
import { SharedBundles } from '@/components/shared-bundles'
import { getPublicPlaylistFn } from '@/server/shareLinks'

export const Route = createFileRoute('/s/$token')({
  loader: async ({ params }) => {
    try {
      return await getPublicPlaylistFn({ data: { token: params.token } })
    } catch {
      return null
    }
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: 'Lien introuvable · Chorale' }] }
    }
    const { playlist, items } = loaderData
    const title = `${playlist.name} · Chorale`
    const description =
      playlist.description ||
      (items.length > 0
        ? items
            .slice(0, 5)
            .map((i) => i.song.title)
            .join(', ') + (items.length > 5 ? '…' : '')
        : 'Playlist partagée')
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: playlist.name },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'music.playlist' },
        { property: 'og:site_name', content: 'Chorale' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: playlist.name },
        { name: 'twitter:description', content: description },
      ],
    }
  },
  component: PublicPlaylistPage,
})

type PlaylistItem = NonNullable<ReturnType<typeof Route.useLoaderData>>['items'][number]
type PlaylistAsset = PlaylistItem['assets'][number]

function PublicPlaylistPage() {
  const data = Route.useLoaderData()
  const { token } = Route.useParams()
  const [selected, setSelected] = useState<PlaylistItem | null>(null)

  if (!data) {
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

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <header>
        <h1 className="text-xl font-bold">{data.playlist.name}</h1>
        {data.playlist.description ? (
          <p className="text-sm text-muted-foreground">{data.playlist.description}</p>
        ) : null}
      </header>

      <div className="divide-y rounded-md border">
        {data.items.map((item) => (
          <button
            key={item.song.id}
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
