import { Context, type Effect } from 'effect'
import type { NotFoundError } from '@/shared/domain/errors'
import type { Group } from '@/features/groups/application/ports'
import type { Asset, Song } from '@/features/songs/application/ports'
import type { Playlist } from '@/features/playlists/application/ports'
import type { ShareLink } from '../domain/share-link'

export type { ShareLink }
export type PublicSong = Pick<Song, 'id' | 'title' | 'composer' | 'arranger' | 'key' | 'tempo'>
export type TaggedAsset = Asset & { groups: Array<Pick<Group, 'id' | 'name'>> }

/** Port: share links of playlists, plus the read model behind public pages. */
export class ShareLinkRepository extends Context.Tag('ShareLinkRepository')<
  ShareLinkRepository,
  {
    readonly listForPlaylist: (playlistId: string) => Effect.Effect<Array<{ link: ShareLink; groups: Array<Group> }>>
    readonly create: (playlistId: string, groupIds: ReadonlyArray<string>) => Effect.Effect<ShareLink>
    /** The link, only if its playlist belongs to the organization. */
    readonly findOwned: (orgId: string, shareLinkId: string) => Effect.Effect<ShareLink, NotFoundError>
    readonly revoke: (shareLinkId: string, at: Date) => Effect.Effect<void>
    readonly findByToken: (token: string) => Effect.Effect<{ link: ShareLink; groupIds: Array<string> } | null>
    /** Playlist, ordered songs and their fully uploaded files with group tags. */
    readonly loadContent: (playlistId: string) => Effect.Effect<{
      playlist: Pick<Playlist, 'name' | 'description'>
      songs: Array<PublicSong>
      assets: Array<TaggedAsset>
    }>
  }
>() {}
