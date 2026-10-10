import { useEffect, useState, type ComponentType } from 'react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Button } from '@/shared/ui/primitives/button'
import { useStableUrl } from './use-stable-url'

// react-pdf (pdfjs-dist) touches browser-only globals (DOMMatrix) at module
// load — importing it statically crashes SSR. Load it only on the client.
let ReactPdf: typeof import('react-pdf') | null = null

export function PdfViewer({ url: latestUrl }: { url: string }) {
  const url = useStableUrl(latestUrl)
  const [Document, setDocument] = useState<ComponentType<any> | null>(null)
  const [Page, setPage] = useState<ComponentType<any> | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!ReactPdf) {
        ReactPdf = await import('react-pdf')
        ReactPdf.pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
      }
      if (!cancelled) {
        setDocument(() => ReactPdf!.Document)
        setPage(() => ReactPdf!.Page)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!Document || !Page) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Chargement…</div>
  }

  if (error) {
    return <p className="text-sm text-destructive">Impossible d'afficher ce PDF</p>
  }

  return (
    <div className="space-y-2">
      <div
        className="max-w-full overflow-auto rounded-md border bg-muted/30"
        ref={(el) => {
          if (el) setWidth(Math.min(el.clientWidth, 800))
        }}
      >
        <Document
          file={url}
          onLoadSuccess={({ numPages }: { numPages: number }) => setNumPages(numPages)}
          onLoadError={() => setError(true)}
          loading={<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Chargement…</div>}
        >
          <Page pageNumber={pageNum} width={width} />
        </Document>
      </div>
      {numPages && numPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {pageNum} / {numPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pageNum <= 1} onClick={() => setPageNum((p) => p - 1)}>
              Précédent
            </Button>
            <Button variant="outline" size="sm" disabled={pageNum >= numPages} onClick={() => setPageNum((p) => p + 1)}>
              Suivant
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
