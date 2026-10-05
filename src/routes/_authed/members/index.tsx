import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
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
  searchMembersFn,
  searchInvitationsFn,
  createInviteFn,
  revokeInviteFn,
  updateMemberRoleFn,
  updateMemberGroupsFn,
  removeMemberFn,
  deleteOrganizationFn,
  getMyRoleFn,
} from '@/server/members'
import { listGroupsFn } from '@/server/groups'
import { authClient, useSession } from '@/lib/auth-client'
import type { InviteRole } from '@/services/Members'
import type { Page } from '@/domain/pagination'

export const Route = createFileRoute('/_authed/members/')({
  loader: async () => {
    try {
      const [members, invitations, allGroups, role] = await Promise.all([
        searchMembersFn({ data: { q: '', page: 1 } }),
        searchInvitationsFn({ data: { q: '', page: 1 } }),
        listGroupsFn(),
        getMyRoleFn(),
      ])
      return { members, invitations, allGroups, role }
    } catch {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: MembersPage,
})

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
  const { members, invitations, allGroups, role } = Route.useLoaderData()
  const router = useRouter()
  const confirm = useConfirm()
  const { data: session } = useSession()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const isManager = role === 'owner' || role === 'admin'
  const [inviteOpen, setInviteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Bumped whenever an invite is created (in a sibling component, so the lists below
  // can't reach it directly) — remounts the list cards to pick up fresh data. Plain
  // router.invalidate() only refreshes this route's own loaderData, which the cards
  // only read once at mount into local state, so it doesn't reach them by itself.
  const [refreshKey, setRefreshKey] = useState(0)

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
            onOpenChange={(open) => {
              setInviteOpen(open)
              if (!open) {
                router.invalidate()
                setRefreshKey((k) => k + 1)
              }
            }}
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
                  onClose={() => {
                    setInviteOpen(false)
                    router.invalidate()
                    setRefreshKey((k) => k + 1)
                  }}
                />
              ) : null}
            </DialogContent>
          </Dialog>
        ) : null}
      </header>

      <MembersActiveCard
        key={`members-${refreshKey}`}
        initial={members}
        allGroups={allGroups}
        isManager={isManager}
        currentUserId={session?.user.id}
      />

      <PendingInvitationsCard
        key={`invitations-${refreshKey}`}
        initial={invitations}
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
              disabled={deleting}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Supprimer cette chorale',
                  description:
                    'Toutes les données de cette chorale seront supprimées définitivement : chants, fichiers, playlists, liens de partage, groupes et membres. Cette action est irréversible.',
                  confirmLabel: 'Supprimer définitivement',
                })
                if (!ok) return
                setDeleting(true)
                await deleteOrganizationFn()
                window.location.assign('/')
              }}
            >
              {deleting ? 'Suppression…' : 'Supprimer cette chorale'}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function MembersActiveCard({
  initial,
  allGroups,
  isManager,
  currentUserId,
}: {
  initial: Page<MemberRow>
  allGroups: Array<{ id: string; name: string }>
  isManager: boolean
  currentUserId: string | undefined
}) {
  const [result, setResult] = useState(initial)
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    searchMembersFn({ data: { q, page } }).then((res) => {
      if (!cancelled) setResult(res)
    })
    return () => {
      cancelled = true
    }
  }, [q, page])

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
  const refetch = () => searchMembersFn({ data: { q, page } }).then(setResult)

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
                onChanged={refetch}
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
  initial,
  isManager,
  orgName,
}: {
  initial: Page<InvitationRow>
  isManager: boolean
  orgName: string | undefined
}) {
  const confirm = useConfirm()
  const [result, setResult] = useState(initial)
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQ(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    searchInvitationsFn({ data: { q, page } }).then((res) => {
      if (!cancelled) setResult(res)
    })
    return () => {
      cancelled = true
    }
  }, [q, page])

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
  const refetch = () => searchInvitationsFn({ data: { q, page } }).then(setResult)

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
                        await revokeInviteFn({ data: { invitationId: invitation.id } })
                        await refetch()
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
  onChanged,
}: {
  row: MemberRow
  allGroups: Array<{ id: string; name: string }>
  isManager: boolean
  isSelf: boolean
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [selected, setSelected] = useState(new Set(row.groups.map((g) => g.id)))
  const [saving, setSaving] = useState(false)

  return (
    <TableRow>
      <TableCell className="font-medium">{row.user.name}</TableCell>
      <TableCell className="text-muted-foreground">{row.user.email}</TableCell>
      <TableCell>
        {isManager && row.member.role !== 'owner' && !isSelf ? (
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={row.member.role}
            onChange={async (e) => {
              await updateMemberRoleFn({
                data: { memberId: row.member.id, role: e.target.value as InviteRole },
              })
              onChanged()
            }}
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
              <Button
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  await updateMemberGroupsFn({ data: { memberId: row.member.id, groupIds: [...selected] } })
                  setSaving(false)
                  setGroupsOpen(false)
                  onChanged()
                }}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
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
                await removeMemberFn({ data: { memberId: row.member.id } })
                onChanged()
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
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setServerError(null)
    setSubmitting(true)
    try {
      const created = await createInviteFn({
        data: {
          email: email.trim(),
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          role,
          groupIds: [...groupIds],
        },
      })
      const link = buildInviteLink(window.location.origin, created.id, created.secret, email.trim(), orgName)
      setInviteLink(link)
      await copyInviteLink(link)
    } catch {
      setServerError('Invitation impossible (email déjà invité ou déjà membre ?)')
    } finally {
      setSubmitting(false)
    }
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
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Création…' : "Générer le lien d'invitation"}
      </Button>
    </form>
  )
}
