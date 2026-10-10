import { createFileRoute } from '@tanstack/react-router'
import { Effect, Either, Schema } from 'effect'
import { Id } from '@/shared/domain/schemas'
import { runServer } from '@/app/runtime'
import { getPublicAssetUrl } from '@/features/sharing/application/sharing'

// Public, stable address of a shared file: redirects to a freshly presigned
// URL, so a playlist left playing for hours never holds an expired one.
export const Route = createFileRoute('/api/public/$token/files/$assetId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const valid = Schema.is(Id)
        if (!valid(params.token) || !valid(params.assetId)) return new Response(null, { status: 404 })
        const result = await runServer(Effect.either(getPublicAssetUrl(params.token, params.assetId)))
        if (Either.isLeft(result)) {
          return new Response(null, { status: result.left._tag === 'NotFoundError' ? 404 : 502 })
        }
        // Presigned URLs live 15 minutes: never let a cached redirect outlive one.
        return new Response(null, { status: 302, headers: { Location: result.right, 'Cache-Control': 'no-store' } })
      },
    },
  },
})
