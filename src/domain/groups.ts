import { Schema } from 'effect'

const CreateGroupFormValues = Schema.Struct({
  name: Schema.String.pipe(
    Schema.minLength(2, { message: () => 'Le nom doit faire au moins 2 caractères' }),
    Schema.maxLength(60, { message: () => 'Le nom est trop long' }),
  ),
})
export const CreateGroupForm = Schema.standardSchemaV1(CreateGroupFormValues)
