import { useMutation } from '@tanstack/react-query'
import { Button } from '@/shared/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/primitives/card'
import { useConfirm } from '@/shared/ui/confirm-dialog'
import { deleteOrganizationFn } from '@/features/organizations/server/organizations.functions'

/** Owner-only: wipes the choir and everything in it. */
export function DeleteOrganizationCard() {
  const confirm = useConfirm()
  const deleteOrganization = useMutation({
    mutationFn: () => deleteOrganizationFn(),
    meta: { errorMessage: 'Suppression de la chorale impossible' },
    // Full reload: every cached query and the session belong to the deleted choir.
    onSuccess: () => window.location.assign('/'),
  })

  return (
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
  )
}
