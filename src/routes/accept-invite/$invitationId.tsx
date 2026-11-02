import { createFileRoute, redirect } from '@tanstack/react-router'
import { Schema } from 'effect'
import { AcceptInvitePage } from '@/features/members/ui/accept-invite-page'
import { readInviteLinkFn } from '@/features/members/server/members.functions'

const AcceptInviteSearch = Schema.Struct({
  // Secret proving the visitor received the link (not just the invitation id).
  k: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  org: Schema.optional(Schema.String),
})

export const Route = createFileRoute('/accept-invite/$invitationId')({
  validateSearch: (search) => Schema.decodeUnknownSync(AcceptInviteSearch)(search),
  // An already used link leads home: the dashboard when signed in, the login page otherwise.
  beforeLoad: async ({ params: { invitationId }, search: { k } }) => {
    const link = k ? await readInviteLinkFn({ data: { invitationId, secret: k } }) : null
    if (link?.used) throw redirect({ to: '/' })
    // Prefills the sign-up form with the name the inviter entered.
    return { inviteeName: link?.inviteeName ?? '' }
  },
  head: ({ match }) => {
    const orgName = match.search.org
    const title = orgName ? `Invitation à rejoindre ${orgName} · Chorale` : 'Invitation · Chorale'
    const description = orgName
      ? `Vous êtes invité·e à rejoindre ${orgName} sur Chorale.`
      : 'Vous êtes invité·e à rejoindre une chorale sur Chorale.'
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Chorale' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
    }
  },
  component: AcceptInvitePage,
})
