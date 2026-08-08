import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Schema } from 'effect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useAppForm } from '@/lib/form'
import { CreateGroupForm } from '@/domain/groups'
import { searchGroupsFn, createGroupFn, deleteGroupFn } from '@/server/groups'
import { useConfirm } from '@/components/confirm-dialog'

const GroupsSearch = Schema.Struct({
  q: Schema.optional(Schema.String),
  page: Schema.optional(Schema.Number),
})

export const Route = createFileRoute('/_authed/groups/')({
  validateSearch: (search) => Schema.decodeUnknownSync(GroupsSearch)(search),
  loaderDeps: ({ search }) => ({ q: search.q ?? '', page: search.page ?? 1 }),
  loader: async ({ deps }) => {
    try {
      return await searchGroupsFn({ data: deps })
    } catch {
      throw redirect({ to: '/songs' })
    }
  },
  component: GroupsPage,
})

function GroupsPage() {
  const { rows: groups, total, page, pageSize } = Route.useLoaderData()
  const { q } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const confirm = useConfirm()
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Nouveau groupe</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau groupe</DialogTitle>
              <DialogDescription>Ex: Sopranos, Chorale enfants, Bureau…</DialogDescription>
            </DialogHeader>
            <CreateGroupDialogForm
              onCreated={async () => {
                setOpen(false)
                await router.invalidate()
              }}
            />
          </DialogContent>
        </Dialog>
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
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((grp) => (
                <TableRow key={grp.id}>
                  <TableCell>{grp.name}</TableCell>
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
                        await deleteGroupFn({ data: { groupId: grp.id } })
                        await router.invalidate()
                      }}
                    >
                      Supprimer
                    </button>
                  </TableCell>
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
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { name: '' },
    validators: { onChange: CreateGroupForm },
    onSubmit: async ({ value, formApi }) => {
      setServerError(null)
      try {
        await createGroupFn({ data: { name: value.name } })
        formApi.reset()
        onCreated()
      } catch {
        setServerError('Impossible de créer le groupe')
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
        name="name"
        children={(field) => <field.TextField label="Nom" placeholder="Sopranos" autoFocus />}
      />
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <form.AppForm>
        <form.SubmitButton label="Créer" pendingLabel="Création…" />
      </form.AppForm>
    </form>
  )
}
