import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { RouteError, RouteNotFound } from '@/shared/ui/route-fallbacks'
import { createQueryClient } from '@/shared/ui/lib/query-client'

export function getRouter() {
  // Created per router: on the server that means per request (no cross-user cache).
  const queryClient = createQueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Query owns data freshness; the router's own preload cache would mask it.
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
  })

  // Provides QueryClientProvider and dehydrates/hydrates the cache across SSR.
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
