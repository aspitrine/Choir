export class NoPagesError extends Error {
  constructor() {
    super('The merged document has no page')
  }
}

/** Concatenates the PDFs at `urls`, in order, into one document. */
export async function mergePdfs(urls: ReadonlyArray<string>) {
  // Loaded on demand: pdf-lib is only needed on share pages, once a merge is asked for.
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.create()
  for (const url of urls) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    const doc = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true })
    const pages = await out.copyPages(doc, doc.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  const pages = out.getPageCount()
  if (pages === 0) throw new NoPagesError()
  return { bytes: await out.save(), pages }
}
