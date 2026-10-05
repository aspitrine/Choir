import { Schema } from 'effect'

export type OrgRole = 'owner' | 'admin' | 'member'

/** Owners and admins manage content; members (singers) only read. */
export const isManagerRole = (role: string | null | undefined): role is 'owner' | 'admin' =>
  role === 'owner' || role === 'admin'

// 'owner' is never assignable through the app: only the choir creator holds it.
export const AssignableRole = Schema.Literal('admin', 'member')
export type AssignableRole = typeof AssignableRole.Type

/** Who is acting, in which choir, with which role — the input of every authorized use case. */
export interface Actor {
  readonly orgId: string
  readonly userId: string
  readonly role: OrgRole
}
