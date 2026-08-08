import { Schema } from 'effect'

export const CreateOrganizationInput = Schema.Struct({
  name: Schema.String.pipe(
    Schema.minLength(2, { message: () => 'Le nom doit faire au moins 2 caractères' }),
    Schema.maxLength(80, { message: () => 'Le nom est trop long' }),
  ),
})
export type CreateOrganizationInput = typeof CreateOrganizationInput.Type

export const CreateOrganizationForm = Schema.standardSchemaV1(CreateOrganizationInput)
