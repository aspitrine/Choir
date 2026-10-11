import { Outlet } from '@tanstack/react-router'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/shared/ui/primitives/sidebar'
import { TooltipProvider } from '@/shared/ui/primitives/tooltip'
import { AppSidebar } from '@/app/shell/app-sidebar'
import { OrgSwitcher } from '@/features/organizations/ui/org-switcher'
import { ConfirmProvider } from '@/shared/ui/confirm-dialog'
import { useRole } from '@/features/auth/ui/queries'
import { useIdentifyMember } from '@/app/shell/analytics'

export function AuthedLayout() {
  const role = useRole()
  useIdentifyMember(role)

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
