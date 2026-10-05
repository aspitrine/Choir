export interface Member {
  id: string
  organizationId: string
  userId: string
  role: string
  createdAt: Date
}

export interface Invitation {
  id: string
  organizationId: string
  email: string
  role: string
  status: string
  expiresAt: Date
  inviterId: string
  createdAt: Date
  firstName: string | null
  lastName: string | null
  /** Shown to managers only, to rebuild the invite link. */
  secret: string | null
}
