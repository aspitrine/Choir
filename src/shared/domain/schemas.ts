import { Schema } from 'effect'

export const Id = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))
export const GroupIds = Schema.Array(Id).pipe(Schema.maxItems(100))
