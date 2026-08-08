import { createFileRoute, redirect } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signIn } from '@/lib/auth-client'
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
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Chorale</CardTitle>
          <CardDescription>Partitions, audio et playlists pour votre chorale</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            onClick={() => signIn.social({ provider: 'google', callbackURL: '/dashboard' })}
          >
            Se connecter avec Google
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
