import { Context, Effect } from 'effect'
import type { StorageError } from '@/shared/domain/errors'

/** Port: object storage for uploaded files. Clients never get direct access, only presigned URLs. */
export class FileStorage extends Context.Tag('FileStorage')<
  FileStorage,
  {
    readonly presignPut: (key: string, contentType: string) => Effect.Effect<string, StorageError>
    readonly presignGet: (key: string) => Effect.Effect<string, StorageError>
    readonly head: (key: string) => Effect.Effect<{ sizeBytes: number; contentType: string }, StorageError>
    readonly remove: (key: string) => Effect.Effect<void, StorageError>
  }
>() {}

/** Best effort: a missing object must not fail the deletion it belongs to. */
export const removeObjects = (keys: ReadonlyArray<string>) =>
  Effect.flatMap(FileStorage, (storage) =>
    Effect.all(
      keys.map((key) => storage.remove(key).pipe(Effect.catchAll(() => Effect.void))),
      { concurrency: 5, discard: true },
    ),
  )
