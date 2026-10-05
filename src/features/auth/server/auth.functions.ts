import { createServerFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import { requestHeaders } from '@/shared/server/request'
import { runServer, withActor } from '@/app/runtime'
import { SessionReader } from '../application/ports'

export const getSessionFn = createServerFn({ method: 'GET' }).handler(() =>
  runServer(Effect.flatMap(SessionReader, (sessions) => sessions.getSession(requestHeaders()))),
)

/** Role in the active choir; fails without an active choir or membership. */
export const getMyRoleFn = createServerFn({ method: 'GET' }).handler(() =>
  withActor((actor) => Effect.succeed(actor.role)),
)
