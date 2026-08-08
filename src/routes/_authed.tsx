import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/app-sidebar'
import { OrgSwitcher } from '@/components/org-switcher'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { getSessionFn } from '../server/auth'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const session = await getSessionFn()

    if (!session) {
      throw redirect({ to: '/' })
    }

    return { session }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <TooltipProvider>
      <ConfirmProvider>
        <SidebarProvider>
          <AppSidebar />
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
