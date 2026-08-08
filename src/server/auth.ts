import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect } from 'effect'
import { AuthService } from '../services/Auth'
import { AppRuntime } from '../services/Runtime'

export const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequestHeaders() as unknown as Headers
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const auth = yield* AuthService
      return yield* auth.getSession(headers)
    }),
  )
})
