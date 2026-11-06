/**
 * Descărcarea fișierelor generate (PDF, Excel, DXF, draw.io, memoriu, proiect).
 * În timpul `captureDownloads` fișierele nu se descarcă, ci se adună (pentru pachetul .zip al proiectului).
 */
export interface CapturedFile {
  name: string
  blob: Blob
}

let sink: CapturedFile[] | null = null

export function downloadBlob(blob: Blob, name: string) {
  if (sink) {
    sink.push({ name, blob })
    return
  }
  // link atașat în pagină: numele fișierului se păstrează sigur în toate browserele
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 30000)
}

/** Rulează exporturile și întoarce fișierele lor, în loc să le descarce */
export async function captureDownloads(fn: () => unknown | Promise<unknown>): Promise<CapturedFile[]> {
  const out: CapturedFile[] = []
  const prev = sink
  sink = out
  try {
    await fn()
  } finally {
    sink = prev
  }
  return out
}
