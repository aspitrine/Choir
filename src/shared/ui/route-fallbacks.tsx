import { useEffect, type ReactNode } from 'react'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { Button } from '@/shared/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/primitives/card'

function Fallback({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">{children}</CardContent>
      </Card>
    </div>
  )
}

// Shown when a loader or render throws (server refused, network down…). Error
// details stay out of the UI: they can carry internal messages.
export function RouteError() {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()
  // Failed suspense queries stay in error until reset; otherwise a retry would
  // render the same error again without refetching.
  useEffect(() => queryErrorResetBoundary.reset(), [queryErrorResetBoundary])
  return (
    <Fallback title="Une erreur est survenue" description="Cette page n'a pas pu être chargée.">
      <Button onClick={() => router.invalidate()}>Réessayer</Button>
      <Button variant="outline" asChild>
        <Link to="/dashboard">Tableau de bord</Link>
      </Button>
    </Fallback>
  )
}

export function RouteNotFound() {
  return (
    <Fallback title="Page introuvable" description="Ce lien ne correspond à aucune page.">
      <Button variant="outline" asChild>
        <Link to="/">Accueil</Link>
      </Button>
    </Fallback>
  )
}
