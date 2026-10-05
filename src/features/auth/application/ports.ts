import { Context, type Effect } from 'effect'
import type { OrgRole } from '../domain/roles'

export interface Session {
  readonly userId: string
  readonly email: string
  readonly activeOrganizationId: string | null
}

/** Port: reads the authenticated session behind a request. */
export class SessionReader extends Context.Tag('SessionReader')<
  SessionReader,
  { readonly getSession: (headers: Headers) => Effect.Effect<Session | null> }
>() {}

/** Port: choir memberships. */
export class MembershipRepository extends Context.Tag('MembershipRepository')<
  MembershipRepository,
  { readonly findRole: (orgId: string, userId: string) => Effect.Effect<OrgRole | null> }
>() {}
