import { Schema } from 'effect'

const CreateGroupFormValues = Schema.Struct({
  name: Schema.String.pipe(
    Schema.minLength(2, { message: () => 'Le nom doit faire au moins 2 caractères' }),
    Schema.maxLength(60, { message: () => 'Le nom est trop long' }),
  ),
})
export const CreateGroupForm = Schema.standardSchemaV1(CreateGroupFormValues)

export const CreateGroupInput = Schema.Struct({
  name: Schema.Trim.pipe(Schema.minLength(1, { message: () => 'Le nom est requis' }), Schema.maxLength(60)),
})

/** URL-safe identifier from a display name ("Sopranes Élèves" → "sopranes-eleves"). */
export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'groupe'
  )
}

/** A group of singers (voice, section…) used to target files and share links. */
export interface Group {
  id: string
  organizationId: string
  name: string
  slug: string
  createdAt: Date
}
