import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient, signIn } from '@/lib/auth-client'
import { getSessionFn } from '../server/auth'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (session) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: Home,
})

function Home() {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handlePasswordSignIn(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await authClient.signIn.email({ email, password, callbackURL: '/dashboard' })
    setSubmitting(false)
    if (signInError) {
      setError(signInError.message ?? 'Identifiants incorrects')
      return
    }
    window.location.assign('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Chorale</CardTitle>
          <CardDescription>Partitions, audio et playlists pour votre chorale</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            onClick={() => signIn.social({ provider: 'google', callbackURL: '/dashboard' })}
          >
            Se connecter avec Google
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() =>
              authClient.signIn.oauth2({ providerId: 'microsoft-entra-id', callbackURL: '/dashboard' })
            }
          >
            Se connecter avec Microsoft
          </Button>

          {!showPassword ? (
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:underline"
              onClick={() => setShowPassword(true)}
            >
              Ou se connecter avec un mot de passe
            </button>
          ) : (
            <form className="space-y-2 border-t pt-3" onSubmit={handlePasswordSignIn}>
              <div className="space-y-1">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="login-password">Mot de passe</Label>
                <Input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Connexion…' : 'Se connecter'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
