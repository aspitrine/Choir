import { Layer, ManagedRuntime } from 'effect'
import { DatabaseLive } from './Database'
import { AuthServiceLive } from './Auth'
import { StorageLive } from './Storage'
import { SongsLive } from './Songs'
import { AssetsLive } from './Assets'
import { AccessLive } from './Access'
import { GroupsLive } from './Groups'
import { PlaylistsLive } from './Playlists'
import { ShareLinksLive } from './ShareLinks'
import { MembersLive } from './Members'

const AppLayer = Layer.mergeAll(
  DatabaseLive,
  AuthServiceLive,
  StorageLive,
  SongsLive.pipe(Layer.provide(DatabaseLive)),
  AssetsLive.pipe(Layer.provide(Layer.mergeAll(DatabaseLive, StorageLive))),
  AccessLive.pipe(Layer.provide(DatabaseLive)),
  GroupsLive.pipe(Layer.provide(DatabaseLive)),
  PlaylistsLive.pipe(Layer.provide(DatabaseLive)),
  ShareLinksLive.pipe(Layer.provide(DatabaseLive)),
  MembersLive.pipe(Layer.provide(DatabaseLive)),
)

export const AppRuntime = ManagedRuntime.make(AppLayer)
