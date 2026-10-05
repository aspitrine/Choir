import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/shared/ui/primitives/dialog'
import { songQueries } from '@/features/songs/ui/queries'
import { PdfViewer } from '@/shared/ui/media/pdf-viewer'
import { AudioPlayer } from '@/shared/ui/media/audio-player'

export function SongDetailsDialog({ songId }: { songId: string }) {
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
