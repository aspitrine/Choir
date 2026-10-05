import { Schema } from 'effect'

export const PAGE_SIZE = 20

export const PageParams = Schema.Struct({
  q: Schema.String,
  page: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
})
export type PageParams = typeof PageParams.Type

export interface Page<T> {
  rows: Array<T>
  total: number
  page: number
  pageSize: number
}

/**
 * ILIKE pattern matching `q` literally anywhere: `%`, `_` and `\` typed by the
 * user are escaped instead of acting as wildcards. Undefined for a blank query.
 */
export function containsPattern(q: string): string | undefined {
  const trimmed = q.trim()
  if (!trimmed) return undefined
  return `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
