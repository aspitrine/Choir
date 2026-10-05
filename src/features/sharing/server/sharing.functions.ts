import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { GroupIds, Id } from '@/shared/domain/schemas'
import { decodeInput } from '@/shared/server/request'
import { runServer, withActor } from '@/app/runtime'
import {
  createShareLink,
  getPublicAssetUrls,
  getPublicPlaylist,
  listShareLinks,
  revokeShareLink,
} from '../application/sharing'

export const listShareLinksFn = createServerFn({ method: 'GET' })
  .validator(decodeInput(Schema.Struct({ playlistId: Id })))
  .handler(({ data }) => withActor((actor) => listShareLinks(actor, data.playlistId)))

export const createShareLinkFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ playlistId: Id, groupIds: GroupIds })))
  .handler(({ data }) => withActor((actor) => createShareLink(actor, data.playlistId, data.groupIds)))

export const revokeShareLinkFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ shareLinkId: Id })))
  .handler(({ data }) => withActor((actor) => revokeShareLink(actor, data.shareLinkId)))

// Public: no session. The token itself is the capability.
export const getPublicPlaylistFn = createServerFn({ method: 'GET' })
  .validator(decodeInput(Schema.Struct({ token: Id })))
  .handler(({ data }) => runServer(getPublicPlaylist(data.token)))

export const getPublicAssetUrlsFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ token: Id, assetIds: Schema.Array(Id).pipe(Schema.maxItems(500)) })))
  .handler(({ data }) => runServer(getPublicAssetUrls(data.token, data.assetIds)))
