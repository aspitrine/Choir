import { CopyLinkButton } from '@/shared/ui/copy-link-button'
import { buildInviteLink } from '@/features/members/domain/invitation'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/primitives/button'
import { Badge } from '@/shared/ui/primitives/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/primitives/card'
import { Checkbox } from '@/shared/ui/primitives/checkbox'
import { Input } from '@/shared/ui/primitives/input'
import { Label } from '@/shared/ui/primitives/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/shared/ui/primitives/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/primitives/table'
import { TablePager } from '@/shared/ui/table-pager'
import { useConfirm } from '@/shared/ui/confirm-dialog'
import { createInviteFn, updateInviteFn, revokeInviteFn, updateMemberRoleFn, updateMemberGroupsFn, removeMemberFn } from '@/features/members/server/members.functions'
import { memberKeys, memberQueries } from '@/features/members/ui/queries'
import { groupQueries } from '@/features/groups/ui/queries'
import { isManagerRole, useRole } from '@/features/auth/ui/queries'
import { useSearchPaging } from '@/shared/ui/hooks/use-search-paging'
import { authClient, useSession } from '@/features/auth/ui/auth-client'
import type { AssignableRole as InviteRole } from '@/features/auth/domain/roles'
import type { Page } from '@/shared/domain/pagination'
import { DeleteOrganizationCard } from '@/features/organizations/ui/delete-organization-card'
import { RenameOrganizationCard } from '@/features/organizations/ui/rename-organization-card'

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

export function MembersPage() {
  const { data: allGroups } = useSuspenseQuery(groupQueries.options())
  const role = useRole()
  const { data: session } = useSession()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const isManager = isManagerRole(role)
  const [inviteOpen, setInviteOpen] = useState(false)

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
        allGroups={allGroups}
        isManager={isManager}
        orgName={activeOrganization?.name}
      />

      {isManager ? <RenameOrganizationCard /> : null}

      {role === 'owner' ? <DeleteOrganizationCard /> : null}
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
  allGroups,
  isManager,
  orgName,
}: {
  allGroups: Array<{ id: string; name: string }>
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
                  <GroupBadges groups={groups} emptyLabel="Tous les groupes" />
                </TableCell>
                <TableCell>
                  <CopyLinkButton url={buildInviteLink(origin, invitation.id, invitation.secret, invitation.email, orgName)} />
                </TableCell>
                {isManager ? (
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <EditInviteDialog invitation={invitation} groups={groups} allGroups={allGroups} />
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
                    </div>
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
  const [editOpen, setEditOpen] = useState(false)
  const removeMember = useMutation({
    mutationFn: () => removeMemberFn({ data: { memberId: row.member.id } }),
    meta: { errorMessage: 'Retrait impossible', invalidates: [memberKeys.all] },
  })

  return (
    <TableRow>
      <TableCell className="font-medium">{row.user.name}</TableCell>
      <TableCell className="text-muted-foreground">{row.user.email}</TableCell>
      <TableCell>{roleLabel(row.member.role)}</TableCell>
      <TableCell>
        <GroupBadges groups={row.groups} emptyLabel="Tout le monde" />
      </TableCell>
      {isManager ? (
        <TableCell>
          <div className="flex items-center gap-3">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Modifier
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Modifier {row.user.name}</DialogTitle>
                  <DialogDescription>{row.user.email}</DialogDescription>
                </DialogHeader>
                {/* Mounted on open: always starts from the current role and groups. */}
                <EditMemberForm row={row} allGroups={allGroups} isSelf={isSelf} onSaved={() => setEditOpen(false)} />
              </DialogContent>
            </Dialog>
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
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  )
}

function EditMemberForm({
  row,
  allGroups,
  isSelf,
  onSaved,
}: {
  row: MemberRow
  allGroups: Array<{ id: string; name: string }>
  isSelf: boolean
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const memberId = row.member.id
  const canChangeRole = row.member.role !== 'owner' && !isSelf
  const [role, setRole] = useState(row.member.role)
  const [groupIds, setGroupIds] = useState(new Set(row.groups.map((g) => g.id)))
  const save = useMutation({
    mutationFn: async () => {
      if (canChangeRole && role !== row.member.role) {
        await updateMemberRoleFn({ data: { memberId, role: role as InviteRole } })
      }
      await updateMemberGroupsFn({ data: { memberId, groupIds: [...groupIds] } })
    },
    meta: { errorMessage: 'Enregistrement impossible', invalidates: [memberKeys.all] },
    onSuccess: onSaved,
    // The role may have been saved before the groups failed: show what was stored.
    onError: () => queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  })

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="member-role">Rôle</Label>
        {canChangeRole ? (
          <RoleSelect id="member-role" value={role as InviteRole} onChange={setRole} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {roleLabel(row.member.role)} —{' '}
            {isSelf ? 'vous ne pouvez pas modifier votre propre rôle' : 'le rôle du propriétaire ne change pas'}
          </p>
        )}
      </div>
      <GroupCheckboxes allGroups={allGroups} selected={groupIds} onChange={setGroupIds} />
      <Button type="submit" className="w-full" disabled={save.isPending}>
        {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  )
}

function EditInviteDialog({
  invitation,
  groups,
  allGroups,
}: {
  invitation: InvitationRow['invitation']
  groups: Array<{ id: string; name: string }>
  allGroups: Array<{ id: string; name: string }>
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier l'invitation</DialogTitle>
          <DialogDescription>Le lien d'invitation reste le même</DialogDescription>
        </DialogHeader>
        <EditInviteForm invitation={invitation} groups={groups} allGroups={allGroups} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function EditInviteForm({
  invitation,
  groups,
  allGroups,
  onSaved,
}: {
  invitation: InvitationRow['invitation']
  groups: Array<{ id: string; name: string }>
  allGroups: Array<{ id: string; name: string }>
  onSaved: () => void
}) {
  const [firstName, setFirstName] = useState(invitation.firstName ?? '')
  const [lastName, setLastName] = useState(invitation.lastName ?? '')
  const [role, setRole] = useState(invitation.role as InviteRole)
  const [groupIds, setGroupIds] = useState(new Set(groups.map((g) => g.id)))
  const save = useMutation({
    mutationFn: () =>
      updateInviteFn({
        data: {
          invitationId: invitation.id,
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          role,
          groupIds: [...groupIds],
        },
      }),
    meta: { errorMessage: 'Enregistrement impossible', invalidates: [memberKeys.all] },
    onSuccess: onSaved,
  })

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="edit-invite-firstname">Prénom</Label>
          <Input id="edit-invite-firstname" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edit-invite-lastname">Nom</Label>
          <Input id="edit-invite-lastname" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-invite-email">Email</Label>
        <Input id="edit-invite-email" value={invitation.email} disabled />
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-invite-role">Rôle</Label>
        <RoleSelect id="edit-invite-role" value={role} onChange={setRole} />
      </div>
      <GroupCheckboxes allGroups={allGroups} selected={groupIds} onChange={setGroupIds} />
      <Button type="submit" className="w-full" disabled={save.isPending}>
        {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  )
}

function RoleSelect({ id, value, onChange }: { id: string; value: InviteRole; onChange: (role: InviteRole) => void }) {
  return (
    <select
      id={id}
      className="block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as InviteRole)}
    >
      <option value="member">Utilisateur (consultation seule)</option>
      <option value="admin">Admin (création / modification / suppression)</option>
    </select>
  )
}

function GroupBadges({ groups, emptyLabel }: { groups: Array<{ id: string; name: string }>; emptyLabel: string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {groups.length === 0 ? (
        <span className="text-xs text-muted-foreground">{emptyLabel}</span>
      ) : (
        groups.map((g) => (
          <Badge key={g.id} variant="secondary">
            {g.name}
          </Badge>
        ))
      )}
    </div>
  )
}

function GroupCheckboxes({
  allGroups,
  selected,
  onChange,
}: {
  allGroups: Array<{ id: string; name: string }>
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  if (allGroups.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Groupes (optionnel)</p>
      <div className="flex flex-wrap gap-3">
        {allGroups.map((grp) => (
          <label key={grp.id} className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={selected.has(grp.id)}
              onCheckedChange={(checked) => {
                const next = new Set(selected)
                if (checked === true) next.add(grp.id)
                else next.delete(grp.id)
                onChange(next)
              }}
            />
            {grp.name}
          </label>
        ))}
      </div>
    </div>
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
        <RoleSelect id="invite-role" value={role} onChange={setRole} />
      </div>
      <GroupCheckboxes allGroups={allGroups} selected={groupIds} onChange={setGroupIds} />
      {createInvite.isError ? (
        <p className="text-sm text-destructive">Invitation impossible (email déjà invité ou déjà membre ?)</p>
      ) : null}
      <Button type="submit" className="w-full" disabled={createInvite.isPending}>
        {createInvite.isPending ? 'Création…' : "Générer le lien d'invitation"}
      </Button>
    </form>
  )
}
