import { useMutation } from '@tanstack/react-query'
import { updateSongFn } from '@/features/songs/server/songs.functions'
import { playlistKeys } from '@/features/playlists/ui/queries'
import { songKeys } from '@/features/songs/ui/queries'
import { useAppForm } from '@/shared/ui/form/form'
import { CreateSongForm, type UpdateSongInput } from '@/features/songs/domain/song'

export type EditableSong = {
  id: string
  title: string
  composer: string | null
  arranger: string | null
  key: string | null
  tempo: string | null
  notes: string | null
}

export function EditSongForm({
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
