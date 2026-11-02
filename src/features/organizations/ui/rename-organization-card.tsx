import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/primitives/card'
import { authClient } from '@/features/auth/ui/auth-client'
import { useAppForm } from '@/shared/ui/form/form'
import { CreateOrganizationForm } from '@/features/organizations/domain/organization'

/** Managers: renames the active choir. The slug is kept so existing links don't change. */
export function RenameOrganizationCard() {
  const { data: activeOrganization } = authClient.useActiveOrganization()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chorale</CardTitle>
        <CardDescription>Le nom affiché aux membres et sur les invitations</CardDescription>
      </CardHeader>
      <CardContent>
        {activeOrganization ? (
          <RenameOrganizationForm
            key={activeOrganization.id}
            organizationId={activeOrganization.id}
            name={activeOrganization.name}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        )}
      </CardContent>
    </Card>
  )
}

function RenameOrganizationForm({ organizationId, name }: { organizationId: string; name: string }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const form = useAppForm({
    defaultValues: { name },
    validators: { onChange: CreateOrganizationForm },
    onSubmit: async ({ value }) => {
      setServerError(null)
      setSaved(false)
      // Refreshes the active organization and the switcher's list on success.
      const { error } = await authClient.organization.update({
        organizationId,
        data: { name: value.name.trim() },
      })
      if (error) {
        setServerError(error.message ?? 'Impossible de renommer la chorale')
        return
      }
      setSaved(true)
    },
  })

  return (
    <form
      className="space-y-3 sm:max-w-md"
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField
        name="name"
        listeners={{ onChange: () => setSaved(false) }}
        children={(field) => <field.TextField label="Nom de la chorale" />}
      />
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      {saved ? <p className="text-sm text-muted-foreground">Nom enregistré</p> : null}
      <form.AppForm>
        <form.SubmitButton label="Renommer" pendingLabel="Enregistrement…" />
      </form.AppForm>
    </form>
  )
}
