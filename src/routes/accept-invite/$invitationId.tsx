import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { Schema } from 'effect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient, useSession, signIn, signOut } from '@/lib/auth-client'
import { acceptInvitationFn } from '@/server/members'

const AcceptInviteSearch = Schema.Struct({
  // Secret proving the visitor received the link (not just the invitation id).
  k: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  org: Schema.optional(Schema.String),
})

export const Route = createFileRoute('/accept-invite/$invitationId')({
  validateSearch: (search) => Schema.decodeUnknownSync(AcceptInviteSearch)(search),
  head: ({ match }) => {
    const orgName = match.search.org
    const title = orgName ? `Invitation à rejoindre ${orgName} · Chorale` : 'Invitation · Chorale'
    const description = orgName
      ? `Vous êtes invité·e à rejoindre ${orgName} sur Chorale.`
      : 'Vous êtes invité·e à rejoindre une chorale sur Chorale.'
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Chorale' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
    }
  },
  component: AcceptInvitePage,
})

type InvitationInfo = {
  organizationName: string
  role: string
}

function roleLabel(role: string) {
  return role === 'member' ? 'Utilisateur (consultation seule)' : 'Admin (création / modification / suppression)'
}

function AcceptInvitePage() {
  const { invitationId } = Route.useParams()
  const { email: invitedEmail, org: orgName, k: secret } = Route.useSearch()
  const navigate = useNavigate()
  const { data: session, isPending: sessionPending } = useSession()

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  const callbackURL = typeof window !== 'undefined' ? window.location.href : undefined
  const emailMismatch =
    !!session && !!invitedEmail && session.user.email.toLowerCase() !== invitedEmail.toLowerCase()

  useEffect(() => {
    if (!session || emailMismatch) return
    let cancelled = false
    authClient.organization.getInvitation({ query: { id: invitationId } }).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setLoadError("Cette invitation n'est plus valide (expirée, révoquée ou déjà acceptée).")
        return
      }
      setInvitation({ organizationName: data.organizationName, role: data.role })
    })
    return () => {
      cancelled = true
    }
  }, [session, emailMismatch, invitationId])

  async function handleAccept() {
    setAccepting(true)
    setAcceptError(null)
    try {
      await acceptInvitationFn({ data: { invitationId, secret: secret ?? '' } })
    } catch {
      setAcceptError("Impossible d'accepter l'invitation. Vérifiez que vous utilisez le lien complet reçu.")
      setAccepting(false)
      return
    }
    navigate({ to: '/dashboard' })
  }

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
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : !invitation ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                Rejoindre <span className="font-medium">{invitation.organizationName}</span> en tant que{' '}
                <span className="font-medium">{roleLabel(invitation.role)}</span>.
              </p>
              {acceptError ? <p className="text-sm text-destructive">{acceptError}</p> : null}
              <Button className="w-full" disabled={accepting} onClick={handleAccept}>
                {accepting ? 'Acceptation…' : 'Accepter'}
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
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handlePasswordSignUp(e: FormEvent) {
    e.preventDefault()
    if (!invitedEmail) return
    setError(null)
    setSubmitting(true)
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email: invitedEmail,
      password,
      callbackURL,
    })
    setSubmitting(false)
    if (signUpError) {
      setError(signUpError.message ?? 'Impossible de créer le compte')
      return
    }
    window.location.reload()
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Création…' : 'Créer mon compte'}
          </Button>
        </form>
      )}
    </div>
  )
}
