import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { mergePdfs, NoPagesError } from '@/features/sharing/ui/merge-pdfs'

const pdf = async (pages: number) => {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([100 + i, 100])
  return doc.save()
}

let files: Record<string, Uint8Array | number> = {}
beforeEach(() => {
  files = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      typeof files[url] === 'number'
        ? new Response(null, { status: files[url] as number })
        : new Response(files[url] as BodyInit, { status: 200 }),
    ),
  )
})

describe('mergePdfs', () => {
  it('concatenates every page, in the given order', async () => {
    files = { a: await pdf(2), b: await pdf(1) }
    const { bytes, pages } = await mergePdfs(['b', 'a'])
    expect(pages).toBe(3)
    const merged = await PDFDocument.load(bytes)
    // Page widths encode their source: b's page first, then a's two pages.
    expect(merged.getPages().map((p) => p.getWidth())).toEqual([100, 100, 101])
  })

  it('refuses to produce an empty document', async () => {
    await expect(mergePdfs([])).rejects.toBeInstanceOf(NoPagesError)
  })

  it('fails when a file cannot be downloaded (e.g. expired URL)', async () => {
    files = { a: await pdf(1), gone: 403 }
    await expect(mergePdfs(['a', 'gone'])).rejects.toThrow('HTTP 403')
  })
})
