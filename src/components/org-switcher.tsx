import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { ChevronDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient } from '@/lib/auth-client'
import { useAppForm } from '@/lib/form'
import { CreateOrganizationForm } from '@/domain/organization'

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function OrgSwitcher() {
  const router = useRouter()
  const { data: organizations, refetch } = authClient.useListOrganizations()
  const { data: activeOrganization, isPending: activeOrgPending } = authClient.useActiveOrganization()
  const [createOpen, setCreateOpen] = useState(false)

  async function switchTo(organizationId: string) {
    await authClient.organization.setActive({ organizationId })
    await router.invalidate()
  }

  // A session (e.g. after a fresh login) has no active org until one is picked —
  // skip that step for the common case of a single choir.
  useEffect(() => {
    if (!activeOrgPending && !activeOrganization && organizations?.length === 1) {
      switchTo(organizations[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgPending, activeOrganization, organizations])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="lg" className="gap-2 px-4">
            {activeOrganization?.name ?? 'Sélectionner une chorale'}
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {organizations?.map((org) => (
            <DropdownMenuItem
              key={org.id}
              className="gap-2 px-2.5 py-2"
              onSelect={() => switchTo(org.id)}
            >
              {org.name}
              {org.id === activeOrganization?.id ? (
                <span className="ml-auto text-xs text-muted-foreground">Active</span>
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 px-2.5 py-2"
            onSelect={(e) => {
              e.preventDefault()
              setCreateOpen(true)
            }}
          >
            <Plus className="size-4" />
            Créer une nouvelle chorale
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une nouvelle chorale</DialogTitle>
            <DialogDescription>Elle deviendra votre chorale active</DialogDescription>
          </DialogHeader>
          <CreateOrganizationDialogForm
            onCreated={async () => {
              setCreateOpen(false)
              await refetch()
              await router.invalidate()
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function CreateOrganizationDialogForm({ onCreated }: { onCreated: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { name: '' },
    validators: { onChange: CreateOrganizationForm },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const { error } = await authClient.organization.create({
        name: value.name,
        slug: slugify(value.name),
      })
      if (error) {
        setServerError(error.message ?? 'Impossible de créer la chorale')
        return
      }
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
        children={(field) => (
          <field.TextField label="Nom de la chorale" placeholder="Chorale Saint-Martin" autoFocus />
        )}
      />
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <form.AppForm>
        <form.SubmitButton label="Créer" pendingLabel="Création…" />
      </form.AppForm>
    </form>
  )
}
