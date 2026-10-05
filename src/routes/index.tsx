import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient, signIn } from '@/lib/auth-client'
import { sessionQueries } from '@/queries/session'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context: { queryClient } }) => {
    const session = await queryClient.fetchQuery(sessionQueries.current())
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
  const signInWithPassword = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.email({ email, password, callbackURL: '/dashboard' })
      if (error) throw new Error(error.message ?? 'Identifiants incorrects')
    },
    // Full load: the app starts with the new session and an empty query cache.
    onSuccess: () => window.location.assign('/dashboard'),
  })

  function handlePasswordSignIn(e: FormEvent) {
    e.preventDefault()
    signInWithPassword.mutate()
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
              {signInWithPassword.isError ? (
                <p className="text-sm text-destructive">{signInWithPassword.error.message}</p>
              ) : null}
              <Button
                type="submit"
                className="w-full"
                disabled={signInWithPassword.isPending || signInWithPassword.isSuccess}
              >
                {signInWithPassword.isPending || signInWithPassword.isSuccess ? 'Connexion…' : 'Se connecter'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
