import type { ReactNode } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
