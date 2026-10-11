import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { authClient, useSession } from '@/features/auth/ui/auth-client'
import { identify, redactPath, screenView, setGlobalProperties } from '@/shared/ui/lib/analytics'

/** One `screen_view` per page, share tokens stripped from the path. */
export function useScreenViews() {
  const router = useRouter()
  useEffect(() => {
    const send = () => {
      const routeId = router.state.matches.at(-1)?.routeId
      screenView(redactPath(router.state.location.pathname), routeId ? { route: routeId } : undefined)
    }
    send()
    return router.subscribe('onResolved', ({ pathChanged }) => {
      if (pathChanged) send()
    })
  }, [router])
}

/** Ties the signed-in member's events to their profile and active choir. */
export function useIdentifyMember(role: string | null) {
  const { data: session } = useSession()
  const { data: organization } = authClient.useActiveOrganization()
  const user = session?.user

  useEffect(() => {
    if (!user) return
    identify({ profileId: user.id, firstName: user.name, email: user.email })
  }, [user?.id, user?.name, user?.email])

  useEffect(() => {
    setGlobalProperties({ choir_id: organization?.id, choir_name: organization?.name, role: role ?? undefined })
  }, [organization?.id, organization?.name, role])
}
