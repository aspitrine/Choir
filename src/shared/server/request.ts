import { getRequestHeaders } from '@tanstack/react-start/server'
import { Schema } from 'effect'

export function requestHeaders() {
  return getRequestHeaders() as unknown as Headers
}

// Server function payloads come from the network: TypeScript types vanish there,
// so every field is decoded at runtime. Typed on the encoded shape so callers
// keep compile-time checks.
export const decodeInput =
  <A, I>(schema: Schema.Schema<A, I>) =>
  (data: I): A =>
    Schema.decodeUnknownSync(schema)(data)
