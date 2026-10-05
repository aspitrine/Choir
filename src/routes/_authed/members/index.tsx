import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TablePager } from '@/components/table-pager'
import { useConfirm } from '@/components/confirm-dialog'
import {
  createInviteFn,
  revokeInviteFn,
  updateMemberRoleFn,
  updateMemberGroupsFn,
  removeMemberFn,
  deleteOrganizationFn,
} from '@/server/members'
import { memberKeys, memberQueries } from '@/queries/members'
import { groupQueries } from '@/queries/groups'
import { isManagerRole, sessionQueries, useRole } from '@/queries/session'
import { useSearchPaging } from '@/hooks/use-search-paging'
import { authClient, useSession } from '@/lib/auth-client'
import type { InviteRole } from '@/services/Members'
import type { Page, PageParams } from '@/domain/pagination'

export const Route = createFileRoute('/_authed/members/')({
  // Managers only (the server refuses the lists to plain members).
  beforeLoad: async ({ context: { queryClient } }) => {
    if (!isManagerRole(await queryClient.ensureQueryData(sessionQueries.role()))) {
      throw redirect({ to: '/dashboard' })
    }
  },
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(memberQueries.list(FIRST_PAGE)),
      queryClient.ensureQueryData(memberQueries.invitations(FIRST_PAGE)),
      queryClient.ensureQueryData(groupQueries.options()),
    ]),
  component: MembersPage,
})

const FIRST_PAGE: PageParams = { q: '', page: 1 }
const EMPTY_PAGE = { rows: [], total: 0, page: 1, pageSize: 1 }

type MemberRow = {
  member: { id: string; role: string }
  user: { id: string; name: string; email: string }
  groups: Array<{ id: string; name: string }>
}
type InvitationRow = {
  invitation: {
    id: string
    email: string
    role: string
    firstName: string | null
    lastName: string | null
    secret: string | null
  }
  groups: Array<{ id: string; name: string }>
}

function roleLabel(role: string) {
  return role === 'member' ? 'Utilisateur' : 'Admin'
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

function MembersPage() {
  const { data: allGroups } = useSuspenseQuery(groupQueries.options())
  const role = useRole()
  const confirm = useConfirm()
  const { data: session } = useSession()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const isManager = isManagerRole(role)
  const [inviteOpen, setInviteOpen] = useState(false)
  const deleteOrganization = useMutation({
    mutationFn: () => deleteOrganizationFn(),
    meta: { errorMessage: 'Suppression de la chorale impossible' },
    // Full reload: every cached query and the session belong to the deleted choir.
    onSuccess: () => window.location.assign('/'),
  })

  return (
    <div className="w-full space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Membres</h1>
          <p className="text-sm text-muted-foreground">Qui a accès à cette chorale, et avec quels droits</p>
        </div>
        {isManager ? (
          <Dialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
          >
            <DialogTrigger asChild>
              <Button>Inviter quelqu'un</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Inviter quelqu'un</DialogTitle>
                <DialogDescription>
                  Génère un lien à partager vous-même (aucun email n'est envoyé)
                </DialogDescription>
              </DialogHeader>
              {inviteOpen ? (
                <InviteDialogForm
                  allGroups={allGroups}
                  orgName={activeOrganization?.name}
                  onClose={() => setInviteOpen(false)}
                />
              ) : null}
            </DialogContent>
          </Dialog>
        ) : null}
      </header>

      <MembersActiveCard
        allGroups={allGroups}
        isManager={isManager}
        currentUserId={session?.user.id}
      />

      <PendingInvitationsCard
        isManager={isManager}
        orgName={activeOrganization?.name}
      />

      {role === 'owner' ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Zone dangereuse</CardTitle>
            <CardDescription>
              Supprime définitivement cette chorale : chants, partitions, audios, playlists, liens de
              partage, groupes et membres. Cette action est irréversible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              disabled={deleteOrganization.isPending || deleteOrganization.isSuccess}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Supprimer cette chorale',
                  description:
                    'Toutes les données de cette chorale seront supprimées définitivement : chants, fichiers, playlists, liens de partage, groupes et membres. Cette action est irréversible.',
                  confirmLabel: 'Supprimer définitivement',
                })
                if (!ok) return
                deleteOrganization.mutate()
              }}
            >
              {deleteOrganization.isPending || deleteOrganization.isSuccess ? 'Suppression…' : 'Supprimer cette chorale'}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function MembersActiveCard({
  allGroups,
  isManager,
  currentUserId,
}: {
  allGroups: Array<{ id: string; name: string }>
  isManager: boolean
  currentUserId: string | undefined
}) {
  const { searchInput, setSearchInput, params, setPage } = useSearchPaging()
  // First page is prefetched by the route loader; later pages keep the previous
  // results on screen while loading.
  const result = useQuery(memberQueries.list(params)).data ?? EMPTY_PAGE
  const page = params.page
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membres actifs</CardTitle>
        <CardDescription>{result.total} membre(s)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={searchInput}
          placeholder="Rechercher un nom ou email…"
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Groupes</TableHead>
              {isManager ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row) => (
              <MemberRow
                key={row.member.id}
                row={row}
                allGroups={allGroups}
                isManager={isManager}
                isSelf={row.user.id === currentUserId}
              />
            ))}
            {result.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isManager ? 5 : 4} className="text-center text-muted-foreground">
                  Aucun résultat
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <TablePager
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </CardContent>
    </Card>
  )
}

function PendingInvitationsCard({
  isManager,
  orgName,
}: {
  isManager: boolean
  orgName: string | undefined
}) {
  const confirm = useConfirm()
  const { searchInput, setSearchInput, params, setPage } = useSearchPaging()
  const result: Page<InvitationRow> = useQuery(memberQueries.invitations(params)).data ?? EMPTY_PAGE
  const page = params.page
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const revokeInvite = useMutation({
    mutationFn: (invitationId: string) => revokeInviteFn({ data: { invitationId } }),
    meta: { errorMessage: 'Révocation impossible', invalidates: [memberKeys.all] },
  })

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitations en attente</CardTitle>
        <CardDescription>{result.total} invitation(s)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={searchInput}
          placeholder="Rechercher un nom ou email…"
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Groupes</TableHead>
              <TableHead className="w-0" />
              {isManager ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map(({ invitation, groups }) => (
              <TableRow key={invitation.id}>
                <TableCell>
                  {[invitation.firstName, invitation.lastName].filter(Boolean).join(' ') || '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">{invitation.email}</TableCell>
                <TableCell>{roleLabel(invitation.role)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {groups.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Tous les groupes</span>
                    ) : (
                      groups.map((g) => (
                        <Badge key={g.id} variant="secondary">
                          {g.name}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <CopyLinkButton url={buildInviteLink(origin, invitation.id, invitation.secret, invitation.email, orgName)} />
                </TableCell>
                {isManager ? (
                  <TableCell>
                    <button
                      className="text-xs text-destructive hover:underline"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Révoquer cette invitation',
                          description: `Le lien envoyé à "${invitation.email}" cessera de fonctionner.`,
                          confirmLabel: 'Révoquer',
                        })
                        if (!ok) return
                        revokeInvite.mutate(invitation.id)
                      }}
                    >
                      Révoquer
                    </button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {result.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isManager ? 6 : 5} className="text-center text-muted-foreground">
                  Aucune invitation en attente
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <TablePager
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      </CardContent>
    </Card>
  )
}

function MemberRow({
  row,
  allGroups,
  isManager,
  isSelf,
}: {
  row: MemberRow
  allGroups: Array<{ id: string; name: string }>
  isManager: boolean
  isSelf: boolean
}) {
  const confirm = useConfirm()
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [selected, setSelected] = useState(new Set(row.groups.map((g) => g.id)))
  const memberId = row.member.id
  const queryClient = useQueryClient()
  const invalidates = [memberKeys.all]
  const updateRole = useMutation({
    mutationFn: (role: InviteRole) => updateMemberRoleFn({ data: { memberId, role } }),
    meta: { errorMessage: 'Modification du rôle impossible', invalidates },
    // On failure too, so the select shows the actual role again.
    onError: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  })
  const updateGroups = useMutation({
    mutationFn: (groupIds: Array<string>) => updateMemberGroupsFn({ data: { memberId, groupIds } }),
    meta: { errorMessage: 'Enregistrement impossible', invalidates },
    onSuccess: () => setGroupsOpen(false),
  })
  const removeMember = useMutation({
    mutationFn: () => removeMemberFn({ data: { memberId } }),
    meta: { errorMessage: 'Retrait impossible', invalidates },
  })

  return (
    <TableRow>
      <TableCell className="font-medium">{row.user.name}</TableCell>
      <TableCell className="text-muted-foreground">{row.user.email}</TableCell>
      <TableCell>
        {isManager && row.member.role !== 'owner' && !isSelf ? (
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={row.member.role}
            disabled={updateRole.isPending}
            onChange={(e) => updateRole.mutate(e.target.value as InviteRole)}
          >
            <option value="admin">Admin</option>
            <option value="member">Utilisateur</option>
          </select>
        ) : (
          roleLabel(row.member.role)
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {row.groups.length === 0 ? (
            <span className="text-xs text-muted-foreground">Tout le monde</span>
          ) : (
            row.groups.map((g) => (
              <Badge key={g.id} variant="secondary">
                {g.name}
              </Badge>
            ))
          )}
        </div>
        {isManager ? (
          <Dialog open={groupsOpen} onOpenChange={setGroupsOpen}>
            <DialogTrigger asChild>
              <button className="mt-1 text-xs text-muted-foreground hover:underline">Modifier</button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Groupes de {row.user.name}</DialogTitle>
              </DialogHeader>
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
              <Button disabled={updateGroups.isPending} onClick={() => updateGroups.mutate([...selected])}>
                {updateGroups.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogContent>
          </Dialog>
        ) : null}
      </TableCell>
      {isManager ? (
        <TableCell>
          {row.member.role !== 'owner' ? (
            <button
              className="text-xs text-destructive hover:underline"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Retirer ce membre',
                  description: `"${row.user.name}" perdra l'accès à cette chorale.`,
                  confirmLabel: 'Retirer',
                })
                if (!ok) return
                removeMember.mutate()
              }}
            >
              Retirer
            </button>
          ) : null}
        </TableCell>
      ) : null}
    </TableRow>
  )
}

async function copyInviteLink(link: string) {
  try {
    await navigator.clipboard.writeText(link)
    toast.success('Lien copié dans le presse-papier')
  } catch {
    toast.error('Copie impossible — sélectionnez le lien manuellement')
  }
}

// `org` is only used to render a nicer link preview (title/description) when the
// link is shared on messaging apps — the actual invite is still resolved by id.
function buildInviteLink(
  origin: string,
  invitationId: string,
  secret: string | null,
  email: string,
  orgName: string | undefined,
) {
  const params = new URLSearchParams({ email })
  if (secret) params.set('k', secret)
  if (orgName) params.set('org', orgName)
  return `${origin}/accept-invite/${invitationId}?${params.toString()}`
}

function InviteDialogForm({
  allGroups,
  orgName,
  onClose,
}: {
  allGroups: Array<{ id: string; name: string }>
  orgName: string | undefined
  onClose: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('member')
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set())
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const createInvite = useMutation({
    mutationFn: () =>
      createInviteFn({
        data: {
          email: email.trim(),
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          role,
          groupIds: [...groupIds],
        },
      }),
    meta: { invalidates: [memberKeys.all] },
    onSuccess: async (created) => {
      const link = buildInviteLink(window.location.origin, created.id, created.secret, email.trim(), orgName)
      setInviteLink(link)
      await copyInviteLink(link)
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    createInvite.mutate()
  }

  if (inviteLink) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Lien copié — partagez-le vous-même avec la personne invitée.
        </p>
        <code className="block w-full overflow-hidden rounded-md border bg-muted px-2 py-1.5 text-xs break-all">
          {inviteLink}
        </code>
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => copyInviteLink(inviteLink)}>
          Copier
        </Button>
        <Button type="button" className="w-full" onClick={onClose}>
          Fermer
        </Button>
      </div>
    )
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="invite-firstname">Prénom</Label>
          <Input id="invite-firstname" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invite-lastname">Nom</Label>
          <Input id="invite-lastname" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jean.dupont@example.com"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invite-role">Rôle</Label>
        <select
          id="invite-role"
          className="block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as InviteRole)}
        >
          <option value="member">Utilisateur (consultation seule)</option>
          <option value="admin">Admin (création / modification / suppression)</option>
        </select>
      </div>
      {allGroups.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Groupes (optionnel)</p>
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
      {createInvite.isError ? (
        <p className="text-sm text-destructive">Invitation impossible (email déjà invité ou déjà membre ?)</p>
      ) : null}
      <Button type="submit" className="w-full" disabled={createInvite.isPending}>
        {createInvite.isPending ? 'Création…' : "Générer le lien d'invitation"}
      </Button>
    </form>
  )
}
