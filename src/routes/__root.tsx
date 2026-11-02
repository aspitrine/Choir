import type { ReactNode } from 'react'
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'
import { useScreenViews } from '@/app/shell/analytics'
import { NowPlayingBar } from '@/shared/ui/media/now-playing-bar'
import { usePlayback } from '@/shared/ui/media/playback'

import '../styles.css'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Chorale' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  useScreenViews()
  // Toasts stay clear of the mini player.
  const playerOpen = usePlayback().track !== null
  const toastOffset = { bottom: playerOpen ? 88 : 24 }

  return (
    <RootDocument>
      <Outlet />
      <NowPlayingBar />
      <Toaster richColors position="bottom-right" offset={toastOffset} mobileOffset={toastOffset} />
      <TanStackDevtools
        config={{ position: 'bottom-right' }}
        plugins={[
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
          {
            name: 'TanStack Query',
            render: <ReactQueryDevtoolsPanel />,
          },
        ]}
      />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
