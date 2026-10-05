import { useState } from 'react'
import type { PageParams } from '@/domain/pagination'
import { useDebouncedValue } from './use-debounced-value'

/** Debounced search text + page for in-component lists; a new search goes back to page 1. */
export function useSearchPaging() {
  const [searchInput, setSearchInput] = useState('')
  const q = useDebouncedValue(searchInput)
  const [paging, setPaging] = useState({ q, page: 1 })
  const page = paging.q === q ? paging.page : 1
  const params: PageParams = { q, page }
  return {
    searchInput,
    setSearchInput,
    params,
    setPage: (update: (page: number) => number) => setPaging({ q, page: update(page) }),
  }
}
