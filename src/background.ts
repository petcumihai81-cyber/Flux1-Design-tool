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

/** Încarcă un plan (PDF sau imagine) ca fundal; PDF-ul se rasterizează la rezoluție mare */
export async function loadBackground(file: File, askPage: (count: number) => number | null): Promise<Background | null> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    const src = await readAsDataUrl(file)
    const img = await loadImage(src)
    return { src, width: img.naturalWidth, height: img.naturalHeight, name: file.name }
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  let pageNo = 1
  if (doc.numPages > 1) {
    const chosen = askPage(doc.numPages)
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
  await doc.destroy()
  return { src, width: canvas.width, height: canvas.height, name: `${file.name} (pag. ${pageNo})` }
}
