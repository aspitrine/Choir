import { Context, type Effect } from 'effect'
import type { NotFoundError } from '@/shared/domain/errors'
import type { Page, PageParams } from '@/shared/domain/pagination'
import type { Group } from '@/features/groups/application/ports'
import type { CreateSongInput, Song } from '../domain/song'
import type { Asset } from '../domain/asset'

export type { Asset, Song }

/** Port: a choir's song catalog, always scoped by organization. */
export class SongRepository extends Context.Tag('SongRepository')<
  SongRepository,
  {
    readonly list: (orgId: string, params: PageParams) => Effect.Effect<Page<Song>>
    readonly listAll: (orgId: string) => Effect.Effect<Array<Song>>
    readonly get: (orgId: string, songId: string) => Effect.Effect<Song, NotFoundError>
    readonly create: (orgId: string, input: CreateSongInput) => Effect.Effect<Song>
    readonly update: (orgId: string, songId: string, input: CreateSongInput) => Effect.Effect<Song, NotFoundError>
    readonly remove: (orgId: string, songId: string) => Effect.Effect<void, NotFoundError>
  }
>() {}

export interface PendingAsset {
  readonly id: string
  readonly songId: string
  readonly kind: Asset['kind']
  readonly label: string | null
  readonly storageKey: string
  readonly mimeType: string
}

/** Port: files attached to songs (rows only — bytes live behind FileStorage). */
export class AssetRepository extends Context.Tag('AssetRepository')<
  AssetRepository,
  {
    readonly listForSong: (songId: string) => Effect.Effect<Array<Asset>>
    readonly groupsForSong: (songId: string) => Effect.Effect<Array<{ assetId: string; group: Group }>>
    /** The asset, only if its song belongs to the organization. */
    readonly findOwned: (orgId: string, assetId: string) => Effect.Effect<Asset, NotFoundError>
    readonly insertPending: (asset: PendingAsset, groupIds: ReadonlyArray<string>) => Effect.Effect<void>
    readonly markReady: (assetId: string, meta: { sizeBytes: number; mimeType: string }) => Effect.Effect<Asset>
    readonly remove: (assetId: string) => Effect.Effect<void>
    readonly removeMany: (assetIds: ReadonlyArray<string>) => Effect.Effect<void>
    readonly removeForSong: (songId: string) => Effect.Effect<void>
    readonly replaceGroups: (assetId: string, groupIds: ReadonlyArray<string>) => Effect.Effect<void>
    readonly storageKeysForSong: (songId: string) => Effect.Effect<Array<string>>
    readonly storageKeysForOrg: (orgId: string) => Effect.Effect<Array<string>>
    readonly findStaleUploads: (
      orgId: string,
      olderThan: Date,
    ) => Effect.Effect<Array<{ id: string; storageKey: string }>>
  }
>() {}
