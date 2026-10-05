import { createFileRoute } from '@tanstack/react-router'
import { Schema } from 'effect'
import { AcceptInvitePage } from '@/features/members/ui/accept-invite-page'

const AcceptInviteSearch = Schema.Struct({
  // Secret proving the visitor received the link (not just the invitation id).
  k: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  org: Schema.optional(Schema.String),
})

export const Route = createFileRoute('/accept-invite/$invitationId')({
  validateSearch: (search) => Schema.decodeUnknownSync(AcceptInviteSearch)(search),
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
