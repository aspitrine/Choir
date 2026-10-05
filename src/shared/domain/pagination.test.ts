import { describe, it, expect } from 'vitest'
import { containsPattern } from '@/shared/domain/pagination'

describe('containsPattern', () => {
  it('is undefined for a blank query', () => {
    expect(containsPattern('')).toBeUndefined()
    expect(containsPattern('   ')).toBeUndefined()
  })

  it('wraps the trimmed query for a contains match', () => {
    expect(containsPattern('  Ave ')).toBe('%Ave%')
  })

  it('escapes LIKE wildcards and the escape character', () => {
    expect(containsPattern('100%')).toBe('%100\\%%')
    expect(containsPattern('a_b')).toBe('%a\\_b%')
    expect(containsPattern('c:\\x')).toBe('%c:\\\\x%')
  })
})
