/** Imaginile puse pe planșă: se micșorează la cel mult 1600 px; PNG dacă au transparență, altfel JPEG */
export async function prepareImage(f: File): Promise<{ src: string; w: number; h: number }> {
  const url = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(f)
  })
  const im = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('format nesuportat'))
    i.src = url
  })
  const w0 = im.naturalWidth || 400
  const h0 = im.naturalHeight || 300
  const k = Math.min(1, 1600 / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * k))
  const h = Math.max(1, Math.round(h0 * k))
  // SVG mic: se păstrează ca vector
  if (f.type === 'image/svg+xml' && url.length < 400_000) return { src: url, w, h }
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(im, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data
  let alpha = false
  for (let i = 3; i < px.length; i += 16) {
    if (px[i] < 250) {
      alpha = true
      break
    }
  }
  return { src: alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85), w, h }
}
