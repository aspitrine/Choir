import { MutationCache, QueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Toasted when the mutation fails. Omit when the UI shows the error itself (forms). */
      errorMessage?: string
      /** Query keys (prefixes) refetched once the mutation succeeds, before mutateAsync resolves. */
      invalidates?: ReadonlyArray<QueryKey>
    }
  }
}

// One client per request on the server (created in getRouter), one per tab in the
// browser: a module-level client would leak cached data between users during SSR.
export function createQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Data dehydrated from SSR is not refetched straight away on hydration.
        staleTime: 30_000,
        retry: 1,
      },
    },
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) =>
        Promise.all(
          (mutation.meta?.invalidates ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        ),
      onError: (_error, _variables, _context, mutation) => {
        if (mutation.meta?.errorMessage) toast.error(mutation.meta.errorMessage)
      },
    }),
  })
  return queryClient
}
