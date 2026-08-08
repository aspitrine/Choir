import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/app-sidebar'
import { OrgSwitcher } from '@/components/org-switcher'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { getSessionFn } from '../server/auth'
import { getMyRoleFn } from '../server/members'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const session = await getSessionFn()

    if (!session) {
      throw redirect({ to: '/' })
    }

    // No active org yet (e.g. just signed up) — role is simply unknown until one is picked.
    const role = await getMyRoleFn().catch(() => null)

    return { session, role }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { role } = Route.useRouteContext()

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
