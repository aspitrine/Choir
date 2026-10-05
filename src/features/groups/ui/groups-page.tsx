import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/primitives/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/shared/ui/primitives/dialog'
import { Input } from '@/shared/ui/primitives/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/primitives/table'
import { TablePager } from '@/shared/ui/table-pager'
import { useAppForm } from '@/shared/ui/form/form'
import { CreateGroupForm } from '@/features/groups/domain/group'
import { createGroupFn, deleteGroupFn } from '@/features/groups/server/groups.functions'
import { groupKeys, groupQueries } from '@/features/groups/ui/queries'
import { songKeys } from '@/features/songs/ui/queries'
import { playlistKeys } from '@/features/playlists/ui/queries'
import { memberKeys } from '@/features/members/ui/queries'
import { useIsManager } from '@/features/auth/ui/queries'
import { useConfirm } from '@/shared/ui/confirm-dialog'
import { getRouteApi } from '@tanstack/react-router'

const routeApi = getRouteApi('/_authed/groups/')

export function GroupsPage() {
  const deps = routeApi.useLoaderDeps()
  const {
    data: { rows: groups, total, page, pageSize },
  } = useSuspenseQuery(groupQueries.search(deps))
  const isManager = useIsManager()
  const { q } = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const confirm = useConfirm()
  const deleteGroup = useMutation({
    mutationFn: (groupId: string) => deleteGroupFn({ data: { groupId } }),
    // Group names appear on files, share links and members.
    meta: { errorMessage: 'Suppression impossible', invalidates: [groupKeys.all, songKeys.all, playlistKeys.all, memberKeys.all] },
  })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const [open, setOpen] = useState(false)

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
          <h1 className="text-xl font-bold">Groupes</h1>
          <p className="text-sm text-muted-foreground">
            Utilisées pour filtrer les fichiers dans les liens de partage
          </p>
        </div>
        {isManager ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Nouveau groupe</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouveau groupe</DialogTitle>
                <DialogDescription>Ex: Sopranos, Chorale enfants, Bureau…</DialogDescription>
              </DialogHeader>
              <CreateGroupDialogForm onCreated={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Groupes existants</CardTitle>
          <CardDescription>{total} groupe(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={searchInput}
            placeholder="Rechercher un groupe…"
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                {isManager ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((grp) => (
                <TableRow key={grp.id}>
                  <TableCell>{grp.name}</TableCell>
                  {isManager ? (
                    <TableCell>
                      <button
                        className="text-xs text-destructive hover:underline"
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Supprimer ce groupe',
                            description: `"${grp.name}" sera retirée de tous les fichiers et liens de partage qui l'utilisent.`,
                            confirmLabel: 'Supprimer',
                          })
                          if (!ok) return
                          deleteGroup.mutate(grp.id)
                        }}
                      >
                        Supprimer
                      </button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {groups.length === 0 ? (
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

function CreateGroupDialogForm({ onCreated }: { onCreated: () => void }) {
  const createGroup = useMutation({
    mutationFn: (name: string) => createGroupFn({ data: { name } }),
    meta: { invalidates: [groupKeys.all] },
  })

  const form = useAppForm({
    defaultValues: { name: '' },
    validators: { onChange: CreateGroupForm },
    onSubmit: async ({ value, formApi }) => {
      try {
        await createGroup.mutateAsync(value.name)
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
        children={(field) => <field.TextField label="Nom" placeholder="Sopranos" autoFocus />}
      />
      {createGroup.isError ? <p className="text-sm text-destructive">Impossible de créer le groupe</p> : null}
      <form.AppForm>
        <form.SubmitButton label="Créer" pendingLabel="Création…" />
      </form.AppForm>
    </form>
  )
}
