import { Effect, Layer, ManagedRuntime } from 'effect'
import { DatabaseLive } from '@/shared/infrastructure/db/database'
import { S3FileStorage } from '@/shared/infrastructure/storage/s3-file-storage'
import { requestHeaders } from '@/shared/server/request'
import { currentActor } from '@/features/auth/application/access'
import type { Actor } from '@/features/auth/domain/roles'
import { BetterAuthSessionReader } from '@/features/auth/infrastructure/better-auth-session-reader'
import { DrizzleMembershipRepository } from '@/features/auth/infrastructure/drizzle-membership-repository'
import { DrizzleGroupRepository } from '@/features/groups/infrastructure/drizzle-group-repository'
import { DrizzleMemberRepository } from '@/features/members/infrastructure/drizzle-member-repository'
import { BetterAuthOrganizationAuthority } from '@/features/organizations/infrastructure/better-auth-organization-authority'
import { DrizzlePlaylistRepository } from '@/features/playlists/infrastructure/drizzle-playlist-repository'
import { DrizzleShareLinkRepository } from '@/features/sharing/infrastructure/drizzle-share-link-repository'
import { DrizzleAssetRepository } from '@/features/songs/infrastructure/drizzle-asset-repository'
import { DrizzleSongRepository } from '@/features/songs/infrastructure/drizzle-song-repository'

// Composition root: the only place where ports meet their adapters.
const Repositories = Layer.mergeAll(
  DrizzleMembershipRepository,
  DrizzleGroupRepository,
  DrizzleSongRepository,
  DrizzleAssetRepository,
  DrizzlePlaylistRepository,
  DrizzleShareLinkRepository,
  DrizzleMemberRepository,
).pipe(Layer.provide(DatabaseLive))

export const AppLayer = Layer.mergeAll(Repositories, S3FileStorage, BetterAuthSessionReader, BetterAuthOrganizationAuthority)

export type AppServices = Layer.Layer.Success<typeof AppLayer>

const runtime = ManagedRuntime.make(AppLayer)

/** Runs a use case for a server function; typed failures reject the call. */
export const runServer = <A, E>(effect: Effect.Effect<A, E, AppServices>) => runtime.runPromise(effect)

/** Resolves the calling member of the active choir, then runs `useCase` as them. */
export const withActor = <A, E>(useCase: (actor: Actor) => Effect.Effect<A, E, AppServices>) =>
  runServer(Effect.flatMap(currentActor(requestHeaders()), useCase))
