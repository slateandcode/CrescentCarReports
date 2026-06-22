/// <reference lib="webworker" />
/**
 * Off-main-thread image processing. Decoding a 4–12MB camera photo, scaling it on
 * a canvas and re-encoding to JPEG froze the UI for seconds on mobile (the "lag
 * while uploading photos" report). Doing it here on a Web Worker with
 * OffscreenCanvas keeps the main thread responsive. lib/photo-client.ts falls back
 * to the main-thread path if a worker or OffscreenCanvas isn't available, so this
 * is a pure performance layer — never a correctness dependency.
 *
 * Message in:  { id, blob, maxEdge, quality, degrees? }
 * Message out: { id, ok, blob? }   (blob is a re-encoded image/jpeg)
 */

interface ProcessRequest {
  id: number
  blob: Blob
  maxEdge: number
  quality: number
  degrees?: number
}

self.onmessage = async (e: MessageEvent<ProcessRequest>) => {
  const { id, blob, maxEdge, quality, degrees = 0 } = e.data
  try {
    // EXIF orientation applied on decode (matches the main-thread path) so phone
    // photos come out upright before any explicit rotation.
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const quarter = degrees === 90 || degrees === -90
    const canvas = new OffscreenCanvas(quarter ? h : w, quarter ? w : h)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      ;(self as unknown as Worker).postMessage({ id, ok: false })
      return
    }
    if (degrees) {
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((degrees * Math.PI) / 180)
      ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
    } else {
      ctx.drawImage(bitmap, 0, 0, w, h)
    }
    bitmap.close?.()
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality })
    ;(self as unknown as Worker).postMessage({ id, ok: true, blob: out })
  } catch {
    ;(self as unknown as Worker).postMessage({ id, ok: false })
  }
}
