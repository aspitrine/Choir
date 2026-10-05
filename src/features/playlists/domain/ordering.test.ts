import { describe, it, expect } from 'vitest'
import { isPermutationOf, nextPosition } from './ordering'

describe('nextPosition', () => {
  it('appends after the highest position, gaps included', () => {
    expect(nextPosition([])).toBe(0)
    expect(nextPosition([0, 1, 2])).toBe(3)
    expect(nextPosition([0, 3])).toBe(4)
  })
})

describe('isPermutationOf', () => {
  const current = ['a', 'b', 'c']
  it('accepts any order of exactly the current items', () => {
    expect(isPermutationOf(['c', 'a', 'b'], current)).toBe(true)
  })
  it.each([
    ['partial', ['c', 'a']],
    ['duplicated', ['a', 'a', 'b']],
    ['foreign item', ['a', 'b', 'x']],
    ['extra item', ['a', 'b', 'c', 'a']],
  ])('rejects a %s list', (_label, requested) => expect(isPermutationOf(requested, current)).toBe(false))
})
