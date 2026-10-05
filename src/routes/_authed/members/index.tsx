import { createFileRoute, redirect } from '@tanstack/react-router'
import { FIRST_PAGE, memberQueries } from '@/features/members/ui/queries'
import { groupQueries } from '@/features/groups/ui/queries'
import { isManagerRole, sessionQueries } from '@/features/auth/ui/queries'
import { MembersPage } from '@/features/members/ui/members-page'

export const Route = createFileRoute('/_authed/members/')({
  // Managers only (the server refuses the lists to plain members).
  beforeLoad: async ({ context: { queryClient } }) => {
    if (!isManagerRole(await queryClient.ensureQueryData(sessionQueries.role()))) {
      throw redirect({ to: '/dashboard' })
    }
  },
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(memberQueries.list(FIRST_PAGE)),
      queryClient.ensureQueryData(memberQueries.invitations(FIRST_PAGE)),
      queryClient.ensureQueryData(groupQueries.options()),
    ]),
  component: MembersPage,
})
