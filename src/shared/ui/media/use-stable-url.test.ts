// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStableUrl } from './use-stable-url'

describe('useStableUrl', () => {
  it('keeps the first URL while only the signature changes', () => {
    const { result, rerender } = renderHook(({ url }) => useStableUrl(url), {
      initialProps: { url: 'https://s3.test/bucket/a.mp3?X-Amz-Signature=1' },
    })
    rerender({ url: 'https://s3.test/bucket/a.mp3?X-Amz-Signature=2' })
    expect(result.current).toBe('https://s3.test/bucket/a.mp3?X-Amz-Signature=1')
  })

  it('switches to another file right away', () => {
    const { result, rerender } = renderHook(({ url }) => useStableUrl(url), {
      initialProps: { url: 'https://s3.test/bucket/a.mp3?X-Amz-Signature=1' },
    })
    rerender({ url: 'https://s3.test/bucket/b.mp3?X-Amz-Signature=2' })
    expect(result.current).toBe('https://s3.test/bucket/b.mp3?X-Amz-Signature=2')
  })
})
