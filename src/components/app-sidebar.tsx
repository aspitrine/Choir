import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, Music, Tag, ListMusic, LogOut } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { signOut, useSession } from '@/lib/auth-client'

const NAV_ITEMS = [
  { to: '/dashboard' as const, label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/songs' as const, label: 'Chants', icon: Music },
  { to: '/groups' as const, label: 'Groupes', icon: Tag },
  { to: '/playlists' as const, label: 'Playlists', icon: ListMusic },
]

export function AppSidebar() {
  const { data: session } = useSession()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1.5 text-lg font-bold">Chorale</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.to)}>
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {session ? (
            <SidebarMenuItem>
              <div className="px-2 py-1 text-sm text-muted-foreground">{session.user.name}</div>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => signOut({ fetchOptions: { onSuccess: () => window.location.assign('/') } })}
            >
              <LogOut />
              <span>Se déconnecter</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
