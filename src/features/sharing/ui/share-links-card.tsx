import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/primitives/button'
import { Badge } from '@/shared/ui/primitives/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/primitives/card'
import { Checkbox } from '@/shared/ui/primitives/checkbox'
import { createShareLinkFn, revokeShareLinkFn } from '@/features/sharing/server/sharing.functions'
import { playlistKeys } from '@/features/playlists/ui/queries'
import { useConfirm } from '@/shared/ui/confirm-dialog'
import { CopyLinkButton } from '@/shared/ui/copy-link-button'

export function ShareLinksCard({
  playlistId,
  shareLinks,
  allGroups,
  isManager,
}: {
  playlistId: string
  shareLinks: Array<{
    link: { id: string; token: string; revokedAt: string | Date | null }
    groups: Array<{ id: string; name: string }>
  }>
  allGroups: Array<{ id: string; name: string }>
  isManager: boolean
}) {
  const confirm = useConfirm()
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set())
  const invalidates = [playlistKeys.shareLinks(playlistId)]
  const createLink = useMutation({
    mutationFn: (ids: Array<string>) => createShareLinkFn({ data: { playlistId, groupIds: ids } }),
    meta: { errorMessage: 'Création du lien impossible', invalidates },
    onSuccess: () => setGroupIds(new Set()),
  })
  const revokeLink = useMutation({
    mutationFn: (shareLinkId: string) => revokeShareLinkFn({ data: { shareLinkId } }),
    meta: { errorMessage: 'Révocation impossible', invalidates },
  })
  // Read after mount only — window.location during SSR would mismatch the client render.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const active = shareLinks.filter((s) => !s.link.revokedAt)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liens de partage</CardTitle>
        <CardDescription>
          Aucun groupe sélectionné = tous les fichiers sont visibles
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isManager ? (
          <>
            {allGroups.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Groupes</p>
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
            <Button disabled={createLink.isPending} onClick={() => createLink.mutate([...groupIds])}>
              {createLink.isPending ? 'Création…' : 'Créer un lien'}
            </Button>
          </>
        ) : null}

        <div className="space-y-2">
          {active.map(({ link, groups }) => (
            <div key={link.id} className="space-y-1 rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <code className="truncate text-xs">{origin}/s/{link.token}</code>
                <div className="flex shrink-0 items-center gap-3">
                  <CopyLinkButton url={`${origin}/s/${link.token}`} />
                  {isManager ? (
                    <button
                      className="text-xs text-destructive hover:underline"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Révoquer ce lien',
                          description: 'Le lien cessera de fonctionner immédiatement. Cette action est irréversible.',
                          confirmLabel: 'Révoquer',
                        })
                        if (!ok) return
                        revokeLink.mutate(link.id)
                      }}
                    >
                      Révoquer
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {groups.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Tout le monde</span>
                ) : (
                  groups.map((g) => (
                    <Badge key={g.id} variant="secondary">
                      {g.name}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          ))}
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun lien actif</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
