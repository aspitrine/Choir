import { useNavigate, getRouteApi } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sessionKeys } from '@/features/auth/ui/queries'
import { Button } from '@/shared/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/primitives/card'
import { Input } from '@/shared/ui/primitives/input'
import { Label } from '@/shared/ui/primitives/label'
import { authClient, useSession, signIn, signOut } from '@/features/auth/ui/auth-client'
import { acceptInvitationFn } from '@/features/members/server/members.functions'

const routeApi = getRouteApi('/accept-invite/$invitationId')

type InvitationInfo = {
  organizationName: string
  role: string
}

function roleLabel(role: string) {
  return role === 'member' ? 'Utilisateur (consultation seule)' : 'Admin (création / modification / suppression)'
}

export function AcceptInvitePage() {
  const { invitationId } = routeApi.useParams()
  const { email: invitedEmail, org: orgName, k: secret } = routeApi.useSearch()
  const navigate = useNavigate()
  const { data: session, isPending: sessionPending } = useSession()

  const queryClient = useQueryClient()

  const callbackURL = typeof window !== 'undefined' ? window.location.href : undefined
  const emailMismatch =
    !!session && !!invitedEmail && session.user.email.toLowerCase() !== invitedEmail.toLowerCase()

  // Better Auth only shows an invitation to its recipient: wait for the right session.
  const invitationQuery = useQuery({
    queryKey: ['invitation', invitationId],
    queryFn: async (): Promise<InvitationInfo> => {
      const { data, error } = await authClient.organization.getInvitation({ query: { id: invitationId } })
      if (error || !data) throw new Error(error?.message ?? 'Invitation introuvable')
      return { organizationName: data.organizationName, role: data.role }
    },
    enabled: !!session && !emailMismatch,
    retry: false,
  })
  const invitation = invitationQuery.data

  const accept = useMutation({
    mutationFn: () => acceptInvitationFn({ data: { invitationId, secret: secret ?? '' } }),
    onSuccess: async () => {
      // The session now has an active choir and a role: drop anything cached before.
      queryClient.removeQueries({ queryKey: sessionKeys.all })
      await navigate({ to: '/dashboard' })
    },
  })

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{orgName ? `Rejoindre ${orgName}` : 'Invitation'}</CardTitle>
          <CardDescription>
            {invitedEmail ? `Pour ${invitedEmail}` : 'Rejoindre une chorale sur Chorale'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessionPending ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !session ? (
            <SignInOptions invitedEmail={invitedEmail} callbackURL={callbackURL} />
          ) : emailMismatch ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                Vous êtes connecté·e avec {session.user.email}, mais cette invitation est pour {invitedEmail}.
              </p>
              <Button variant="outline" className="w-full" onClick={() => signOut()}>
                Se déconnecter
              </Button>
            </div>
          ) : invitationQuery.isError ? (
            <p className="text-sm text-destructive">
              Cette invitation n'est plus valide (expirée, révoquée ou déjà acceptée).
            </p>
          ) : !invitation ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                Rejoindre <span className="font-medium">{invitation.organizationName}</span> en tant que{' '}
                <span className="font-medium">{roleLabel(invitation.role)}</span>.
              </p>
              {accept.isError ? (
                <p className="text-sm text-destructive">
                  Impossible d'accepter l'invitation. Vérifiez que vous utilisez le lien complet reçu.
                </p>
              ) : null}
              <Button className="w-full" disabled={accept.isPending || accept.isSuccess} onClick={() => accept.mutate()}>
                {accept.isPending || accept.isSuccess ? 'Acceptation…' : 'Accepter'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SignInOptions({ invitedEmail, callbackURL }: { invitedEmail?: string; callbackURL?: string }) {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const signUp = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await authClient.signUp.email({ name, email, password, callbackURL })
      if (error) throw new Error(error.message ?? 'Impossible de créer le compte')
    },
    // Fresh page load with the new session cookie.
    onSuccess: () => window.location.reload(),
  })

  function handlePasswordSignUp(e: FormEvent) {
    e.preventDefault()
    if (invitedEmail) signUp.mutate(invitedEmail)
  }

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={() => signIn.social({ provider: 'google', callbackURL })}>
        Se connecter avec Google
      </Button>
      <Button
        className="w-full"
        variant="outline"
        onClick={() => authClient.signIn.oauth2({ providerId: 'microsoft-entra-id', callbackURL })}
      >
        Se connecter avec Microsoft
      </Button>

      {!showPasswordForm ? (
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground hover:underline"
          onClick={() => setShowPasswordForm(true)}
        >
          Ou créer un compte avec un mot de passe
        </button>
      ) : (
        <form className="space-y-2 border-t pt-3" onSubmit={handlePasswordSignUp}>
          <div className="space-y-1">
            <Label htmlFor="invite-name">Nom</Label>
            <Input id="invite-name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-email-locked">Email</Label>
            <Input id="invite-email-locked" value={invitedEmail ?? ''} disabled />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-password">Mot de passe</Label>
            <Input
              id="invite-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {signUp.isError ? <p className="text-sm text-destructive">{signUp.error.message}</p> : null}
          <Button type="submit" className="w-full" disabled={signUp.isPending || signUp.isSuccess}>
            {signUp.isPending || signUp.isSuccess ? 'Création…' : 'Créer mon compte'}
          </Button>
        </form>
      )}
    </div>
  )
}
