import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { getSongFn, deleteSongFn } from '@/server/songs'
import { createUploadIntentFn, confirmUploadFn, deleteAssetFn, setAssetGroupsFn } from '@/server/assets'
import { listGroupsFn } from '@/server/groups'
import { getMyRoleFn } from '@/server/members'
import { PdfViewer } from '@/components/pdf-viewer'
import { AudioPlayer } from '@/components/audio-player'
import { useConfirm } from '@/components/confirm-dialog'
import { PLAYABLE_AUDIO_MIME_TYPES, SCORE_MIME_TYPES, guessAssetKind } from '@/domain/songs'

export const Route = createFileRoute('/_authed/songs/$songId')({
  loader: async ({ params }) => {
    try {
      const [data, allGroups, role] = await Promise.all([
        getSongFn({ data: { songId: params.songId } }),
        listGroupsFn(),
        getMyRoleFn(),
      ])
      return { ...data, allGroups, role }
    } catch {
      throw redirect({ to: '/songs' })
    }
  },
  component: SongDetailPage,
})

type AssetWithGroups = {
  id: string
  kind: string
  label: string | null
  status: string
  url: string | null
  groups: Array<{ id: string; name: string }>
}

function SongDetailPage() {
  const { song, assets, allGroups, role } = Route.useLoaderData()
  const isManager = role === 'owner' || role === 'admin'
  const router = useRouter()
  const navigate = Route.useNavigate()
  const confirm = useConfirm()
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <div className="w-full space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{song.title}</h1>
          {song.composer ? (
            <p className="text-sm text-muted-foreground">{song.composer}</p>
          ) : null}
        </div>
        {isManager ? (
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Supprimer ce chant',
                  description: `"${song.title}" et tous ses fichiers seront supprimés définitivement.`,
                  confirmLabel: 'Supprimer',
                })
                if (!ok) return
                await deleteSongFn({ data: { songId: song.id } })
                navigate({ to: '/songs' })
              }}
            >
              Supprimer
            </Button>
          </div>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Partitions et audio</CardTitle>
              <CardDescription>{assets.length} fichier(s)</CardDescription>
            </div>
            {isManager ? (
              <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogTrigger asChild>
                  <Button>Ajouter un fichier</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Ajouter un fichier</DialogTitle>
                    <DialogDescription>Partition (PDF) ou audio</DialogDescription>
                  </DialogHeader>
                  <UploadForm
                    songId={song.id}
                    allGroups={allGroups}
                    onUploaded={async () => {
                      setUploadOpen(false)
                      await router.invalidate()
                    }}
                  />
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Groupes</TableHead>
                <TableHead className="w-0" />
                {isManager ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((a) => (
                <AssetRow
                  key={a.id}
                  asset={a as AssetWithGroups}
                  allGroups={allGroups}
                  isManager={isManager}
                  onChanged={() => router.invalidate()}
                />
              ))}
              {assets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isManager ? 5 : 4} className="text-center text-muted-foreground">
                    Aucun fichier pour l'instant
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

function AssetRow({
  asset,
  allGroups,
  isManager,
  onChanged,
}: {
  asset: AssetWithGroups
  allGroups: Array<{ id: string; name: string }>
  isManager: boolean
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [selected, setSelected] = useState(new Set(asset.groups.map((g) => g.id)))
  const [saving, setSaving] = useState(false)

  return (
    <TableRow>
      <TableCell>{asset.kind === 'score' ? 'Partition' : 'Audio'}</TableCell>
      <TableCell className="text-muted-foreground">
        {asset.label}
        {asset.status !== 'ready' ? <span className="ml-2 text-xs">({asset.status})</span> : null}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {asset.groups.length === 0 ? (
            <span className="text-xs text-muted-foreground">Tout le monde</span>
          ) : (
            asset.groups.map((g) => (
              <Badge key={g.id} variant="secondary">
                {g.name}
              </Badge>
            ))
          )}
        </div>
        {isManager ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button className="mt-1 text-xs text-muted-foreground hover:underline">Modifier</button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Groupes du fichier</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Aucun groupe coché = visible par tout le monde via un lien de partage.
              </p>
              <div className="flex flex-wrap gap-3">
                {allGroups.map((grp) => (
                  <label key={grp.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={selected.has(grp.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selected)
                        if (checked === true) next.add(grp.id)
                        else next.delete(grp.id)
                        setSelected(next)
                      }}
                    />
                    {grp.name}
                  </label>
                ))}
                {allGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun groupe créé pour l'instant</p>
                ) : null}
              </div>
              <Button
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  await setAssetGroupsFn({ data: { assetId: asset.id, groupIds: [...selected] } })
                  setSaving(false)
                  setOpen(false)
                  onChanged()
                }}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogContent>
          </Dialog>
        ) : null}
      </TableCell>
      <TableCell>
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={!asset.url}>
              Aperçu
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{asset.label || (asset.kind === 'score' ? 'Partition' : 'Audio')}</DialogTitle>
            </DialogHeader>
            {asset.url ? (
              asset.kind === 'score' ? (
                <PdfViewer url={asset.url} />
              ) : (
                <AudioPlayer url={asset.url} />
              )
            ) : null}
          </DialogContent>
        </Dialog>
      </TableCell>
      {isManager ? (
        <TableCell>
          <button
            className="text-xs text-destructive hover:underline"
            onClick={async () => {
              const ok = await confirm({
                title: 'Supprimer ce fichier',
                description: 'Le fichier sera supprimé définitivement.',
                confirmLabel: 'Supprimer',
              })
              if (!ok) return
              await deleteAssetFn({ data: { assetId: asset.id } })
              onChanged()
            }}
          >
            Supprimer
          </button>
        </TableCell>
      ) : null}
    </TableRow>
  )
}

function filenameWithoutExtension(filename: string) {
  return filename.replace(/\.[^./]+$/, '')
}

const PLAYABLE_AUDIO = new Set<string>(PLAYABLE_AUDIO_MIME_TYPES)

const FILE_ACCEPT = [...PLAYABLE_AUDIO_MIME_TYPES, ...SCORE_MIME_TYPES].join(',')

function UploadForm({
  songId,
  allGroups,
  onUploaded,
}: {
  songId: string
  allGroups: Array<{ id: string; name: string }>
  onUploaded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState('')
  const [labelTouched, setLabelTouched] = useState(false)
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const kind = file ? guessAssetKind(file.type) : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Choisissez un fichier')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const { assetId, uploadUrl } = await createUploadIntentFn({
        data: {
          songId,
          kind: guessAssetKind(file.type),
          label: label || null,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          groupIds: [...groupIds],
        },
      })
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!res.ok) throw new Error('upload failed')
      await confirmUploadFn({ data: { assetId } })
      setFile(null)
      setLabel('')
      setLabelTouched(false)
      setGroupIds(new Set())
      onUploaded()
    } catch {
      setError("Échec de l'envoi")
    } finally {
      setUploading(false)
    }
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <Label htmlFor="file">Fichier</Label>
        <input
          id="file"
          type="file"
          accept={FILE_ACCEPT}
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null
            if (picked && guessAssetKind(picked.type) === 'score' && picked.type !== 'application/pdf') {
              setError('Seuls les PDF et les fichiers audio sont acceptés')
              setFile(null)
              e.target.value = ''
              return
            }
            if (picked && guessAssetKind(picked.type) === 'audio' && !PLAYABLE_AUDIO.has(picked.type)) {
              setError("Ce format audio ne peut pas être écouté dans un navigateur (essayez MP3, WAV, OGG…)")
              setFile(null)
              e.target.value = ''
              return
            }
            setError(null)
            setFile(picked)
            if (picked && !labelTouched) setLabel(filenameWithoutExtension(picked.name))
          }}
          className="block w-full text-sm"
        />
        {kind ? (
          <p className="text-xs text-muted-foreground">
            Type détecté : {kind === 'score' ? 'Partition' : 'Audio'}
          </p>
        ) : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="label">Label (optionnel)</Label>
        <Input
          id="label"
          value={label}
          placeholder="Basse 2"
          onChange={(e) => {
            setLabelTouched(true)
            setLabel(e.target.value)
          }}
        />
      </div>

      {allGroups.length > 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Groupes (optionnel)</p>
              <p className="text-xs text-muted-foreground">
                Aucune sélection = visible par tout le monde via un lien de partage
              </p>
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={uploading || !file}>
        {uploading ? 'Envoi…' : 'Envoyer'}
      </Button>
    </form>
  )
}
