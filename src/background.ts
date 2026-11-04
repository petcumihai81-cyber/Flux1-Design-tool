import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Background } from './types'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_SIDE = 4000

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Imaginea nu a putut fi încărcată'))
    img.src = src
  })
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export type PdfDoc = pdfjs.PDFDocumentProxy

/** Miniatura unei pagini PDF (pentru alegerea paginii) și formatul ei în mm */
export async function pdfThumb(doc: PdfDoc, pageNo: number, size = 220): Promise<{ src: string; wmm: number; hmm: number }> {
  const page = await doc.getPage(pageNo)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: size / Math.max(base.width, base.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return { src: canvas.toDataURL('image/jpeg', 0.8), wmm: (base.width / 72) * 25.4, hmm: (base.height / 72) * 25.4 }
}

/**
 * Încarcă un plan (PDF sau imagine) ca fundal; PDF-ul se rasterizează la rezoluție mare.
 * La un PDF cu mai multe pagini, `choosePage` alege pagina (null = renunță).
 */
export async function loadBackground(file: File, choosePage: (doc: PdfDoc) => Promise<number | null>): Promise<Background | null> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    const src = await readAsDataUrl(file)
    const img = await loadImage(src)
    return { src, width: img.naturalWidth, height: img.naturalHeight, name: file.name }
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  try {
    let pageNo = 1
    if (doc.numPages > 1) {
      const chosen = await choosePage(doc)
      if (chosen == null) return null
      pageNo = Math.min(Math.max(1, Math.round(chosen)), doc.numPages)
    }
    const page = await doc.getPage(pageNo)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(MAX_SIDE / Math.max(base.width, base.height), 6)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const src = canvas.toDataURL('image/png')
    return { src, width: canvas.width, height: canvas.height, name: doc.numPages > 1 ? `${file.name} (pag. ${pageNo})` : file.name }
  } finally {
    await doc.destroy()
  }
}
