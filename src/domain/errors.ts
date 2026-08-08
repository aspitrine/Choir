import { Data } from 'effect'

export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  entity: string
  id: string
}> {}

export class ForbiddenError extends Data.TaggedError('ForbiddenError')<{
  reason: string
}> {}

export class UnauthenticatedError extends Data.TaggedError('UnauthenticatedError')<{}> {}

export class ValidationError extends Data.TaggedError('ValidationError')<{
  message: string
}> {}

export class StorageError extends Data.TaggedError('StorageError')<{
  cause: unknown
}> {}
