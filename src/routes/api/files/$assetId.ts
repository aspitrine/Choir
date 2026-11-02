import { createFileRoute } from '@tanstack/react-router'
import { Effect, Either, Schema } from 'effect'
import { Id } from '@/shared/domain/schemas'
import { runServer } from '@/app/runtime'
import { currentActor } from '@/features/auth/application/access'
import { getAssetUrl } from '@/features/songs/application/assets'

const statusOf = {
  UnauthenticatedError: 401,
  ForbiddenError: 403,
  NotFoundError: 404,
} as const

// Stable address of a choir's file, for its members: redirects to a freshly
// presigned URL, so a track left paused (or a phone left asleep) for longer
// than a presigned URL lives still resumes.
export const Route = createFileRoute('/api/files/$assetId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!Schema.is(Id)(params.assetId)) return new Response(null, { status: 404 })
        const result = await runServer(
          Effect.either(Effect.flatMap(currentActor(request.headers), (actor) => getAssetUrl(actor, params.assetId))),
        )
        if (Either.isLeft(result)) {
          const tag = result.left._tag
          return new Response(null, { status: tag in statusOf ? statusOf[tag as keyof typeof statusOf] : 502 })
        }
        // Presigned URLs live 15 minutes: never let a cached redirect outlive one.
        return new Response(null, { status: 302, headers: { Location: result.right, 'Cache-Control': 'no-store' } })
      },
    },
  },
})
