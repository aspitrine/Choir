import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { getSessionFn, getMyRoleFn } from '@/features/auth/server/auth.functions'
import { sessionKeys } from './keys'

export const sessionQueries = {
  current: () =>
    queryOptions({
      queryKey: sessionKeys.current(),
      queryFn: () => getSessionFn(),
    }),
  // null = no active choir, or no longer a member of it.
  role: () =>
    queryOptions({
      queryKey: sessionKeys.role(),
      queryFn: () => getMyRoleFn().catch(() => null),
    }),
}

export const isManagerRole = (role: string | null | undefined) => role === 'owner' || role === 'admin'

/** Role in the active choir. Ensured by the `_authed` route, so it never suspends there. */
export function useRole() {
  return useSuspenseQuery(sessionQueries.role()).data
}

export function useIsManager() {
  return isManagerRole(useRole())
}

export { sessionKeys }
