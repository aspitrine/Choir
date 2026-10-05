// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSearchPaging } from '@/shared/ui/hooks/use-search-paging'

afterEach(() => vi.useRealTimers())

describe('useSearchPaging', () => {
  it('debounces the search and goes back to page 1 for a new search', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useSearchPaging())
    act(() => result.current.setPage((p) => p + 2))
    expect(result.current.params).toEqual({ q: '', page: 3 })

    act(() => result.current.setSearchInput('ave'))
    // Typing doesn't query on every keystroke.
    expect(result.current.params).toEqual({ q: '', page: 3 })
    act(() => vi.advanceTimersByTime(300))
    expect(result.current.params).toEqual({ q: 'ave', page: 1 })

    act(() => result.current.setPage((p) => p + 1))
    expect(result.current.params).toEqual({ q: 'ave', page: 2 })
  })
})
