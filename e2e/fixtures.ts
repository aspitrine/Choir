import { PDFDocument, StandardFonts } from 'pdf-lib'

export async function pdfFile(name: string, pages: number) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) doc.addPage().drawText(`${name} — page ${i}`, { x: 50, y: 700, font })
  return { name: `${name}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) }
}

// Content is never decoded in these tests (players use preload="none"); only
// the declared type matters for the upload form and the share page.
export function mp3File(name: string) {
  return { name: `${name}.mp3`, mimeType: 'audio/mpeg', buffer: Buffer.from('ID3fake-mp3-payload') }
}
