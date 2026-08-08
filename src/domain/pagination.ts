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
