import { Schema } from 'effect'
import { GroupIds, Id } from '@/shared/domain/schemas'
import { AssignableRole } from '@/features/auth/domain/roles'

const OptionalName = Schema.NullOr(Schema.String.pipe(Schema.maxLength(100)))

const Email = Schema.Trim.pipe(
  Schema.maxLength(254),
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: () => 'Email invalide' }),
)

export const CreateInviteInput = Schema.Struct({
  email: Email,
  firstName: OptionalName,
  lastName: OptionalName,
  role: AssignableRole,
  groupIds: GroupIds,
})
export type CreateInviteInput = typeof CreateInviteInput.Type

/**
 * Changing the email makes a new link (new secret): the old one, sent to the
 * previous address, stops working.
 */
export const UpdateInviteInput = Schema.Struct({
  invitationId: Id,
  ...CreateInviteInput.fields,
})
export type UpdateInviteInput = typeof UpdateInviteInput.Type

/** A member's account name and email, as edited by a manager. */
export const UpdateMemberProfileInput = Schema.Struct({
  memberId: Id,
  name: Schema.Trim.pipe(Schema.minLength(1, { message: () => 'Nom requis' }), Schema.maxLength(100)),
  email: Email,
})
export type UpdateMemberProfileInput = typeof UpdateMemberProfileInput.Type

/**
 * Random secret carried by the invite link and checked on acceptance: the
 * invitation id alone is not proof of having received the link (members can
 * list pending invitations through Better Auth). 32 bytes, base64url.
 */
export function generateInvitationSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Constant-time comparison, so response timing doesn't reveal the secret. */
export function secretsMatch(expected: string, given: string) {
  if (expected.length !== given.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0
}

// `org` only makes a nicer preview when the link is shared in messaging apps.
export function buildInviteLink(
  origin: string,
  invitationId: string,
  secret: string | null,
  email: string,
  orgName: string | undefined,
) {
  const params = new URLSearchParams({ email })
  if (secret) params.set('k', secret)
  if (orgName) params.set('org', orgName)
  return `${origin}/accept-invite/${invitationId}?${params.toString()}`
}
