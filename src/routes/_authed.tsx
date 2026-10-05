import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/app-sidebar'
import { OrgSwitcher } from '@/components/org-switcher'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { sessionQueries, useRole } from '@/queries/session'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location, context: { queryClient } }) => {
    // fetchQuery honours staleTime: navigating between pages reuses the cached
    // session and role instead of two server round-trips per navigation.
    const session = await queryClient.fetchQuery(sessionQueries.current())

    if (!session) {
      throw redirect({ to: '/' })
    }

    // No role = no active org yet (e.g. just signed up) or no longer a member of it.
    // Only the dashboard (with its org picker) makes sense then.
    const role = await queryClient.fetchQuery(sessionQueries.role())
    if (role === null && location.pathname !== '/dashboard') {
      throw redirect({ to: '/dashboard' })
    }

    return { session }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const role = useRole()

  return (
    <TooltipProvider>
      <ConfirmProvider>
        <SidebarProvider>
          <AppSidebar role={role} />
          <SidebarInset>
            <header className="flex h-12 items-center justify-between border-b px-4">
              <SidebarTrigger />
              <OrgSwitcher />
            </header>
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      </ConfirmProvider>
    </TooltipProvider>
  )
}
