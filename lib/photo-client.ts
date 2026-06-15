'use client'

import { createClient } from '@/lib/supabase/client'
import { PHOTO_BUCKET, pathFromStorageUrl } from '@/lib/utils'
import type { PhotoRef } from '@/lib/report-types'

function uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function extOf(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && fromName.length <= 5) return fromName
  return file.type.split('/').pop() || 'jpg'
}

/** Don't bother recompressing anything already this small. */
const COMPRESS_MIN_BYTES = 400_000
/** Longest edge after downscale — ample for A4 print + on-screen zoom. */
const COMPRESS_MAX_EDGE = 2000
/** JPEG quality for the re-encode. */
const COMPRESS_QUALITY = 0.85

/**
 * Signed-URL TTL (seconds). The bucket is PRIVATE (migration 013), so every
 * rendered photo URL is a short-lived signed URL. 24h comfortably outlives an
 * editing/preview session and the PDF render; it MUST match SIGNED_URL_TTL_SECONDS
 * in lib/photo-sign.ts so client-minted and server-re-signed URLs behave alike.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24

/**
 * Downscale + re-encode a camera photo in the browser before upload. A modern
 * phone shot is 4–12 MB; at A4 print size 2000px/JPEG-0.85 looks identical but
 * is a fraction of the bytes — so uploads are quicker and the preview/PDF have
 * far less to re-fetch. Always falls back to the original file on any failure
 * (unsupported codec, no canvas, bigger result), so it can never break upload.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < COMPRESS_MIN_BYTES) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, COMPRESS_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', COMPRESS_QUALITY),
    )
    // Keep the original if re-encoding somehow didn't actually save anything.
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

export interface UploadTarget {
  reportId: string
  sectionId?: string | null
  itemId?: string | null
  caption?: string | null
}

/**
 * Upload one image to Storage from the browser, record its metadata row, and
 * return a PhotoRef the editor stores in the report JSON. Throws on failure so
 * the caller can surface an error to the inspector.
 */
export async function uploadPhoto(file: File, target: UploadTarget): Promise<PhotoRef> {
  const supabase = createClient()
  // Shrink the photo before it ever crosses the network (see compressImage).
  const upload = await compressImage(file)
  const folder = target.itemId
    ? `items/${target.itemId}`
    : target.sectionId
      ? `sections/${target.sectionId}`
      : 'general'
  const path = `${target.reportId}/${folder}/${uuid()}.${extOf(upload)}`

  const { error: uploadErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, upload, { contentType: upload.type, upsert: false })
  if (uploadErr) throw new Error(uploadErr.message)

  // Bucket is PRIVATE (migration 013): mint a signed URL so the editor can show
  // the photo immediately. The durable `path` (below) is what rendering re-signs
  // from — this URL is only good until the TTL lapses. Throw on failure so the
  // inspector sees that the upload didn't fully succeed.
  const { data: signed, error: signErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (signErr || !signed?.signedUrl) {
    throw new Error(signErr?.message || 'Could not sign the uploaded photo URL.')
  }
  const url = signed.signedUrl

  // Best-effort metadata row (the canonical copy lives in the report JSON). The
  // stored url is non-canonical — rendering always re-signs from `path` — so a
  // soon-to-expire signed URL here is fine.
  const { data: row } = await supabase
    .from('report_photos')
    .insert({
      report_id: target.reportId,
      section_id: target.sectionId ?? null,
      item_id: target.itemId ?? null,
      url,
      path,
      caption: target.caption ?? null,
    })
    .select('id')
    .maybeSingle()

  return {
    id: row?.id ?? uuid(),
    url,
    path,
    caption: target.caption ?? null,
    sectionId: target.sectionId ?? null,
    itemId: target.itemId ?? null,
  }
}

/**
 * Storage-URL → path parser. The shared implementation lives in lib/utils.ts
 * (server+client safe) and now parses signed URLs as well as legacy public ones.
 * Re-exported here, plus the back-compat `pathFromPublicUrl` alias that existing
 * call sites (e.g. MainImageUploader) import.
 */
export { pathFromStorageUrl }
export const pathFromPublicUrl = pathFromStorageUrl

/**
 * Rotate a photo by re-encoding it client-side and swapping the stored file, so
 * the rotation is baked into the image itself — the report, the PDF and any
 * other consumer of the URL all see it correctly with no CSS tricks. The
 * PhotoRef keeps its id (callers replace by id); url + path change.
 *
 * Note: report_photos has no UPDATE RLS policy, so the metadata row is swapped
 * (insert new + delete old) rather than updated — both best-effort, since the
 * canonical copy lives in the report JSON.
 */
export async function rotatePhoto(photo: PhotoRef, degrees: 90 | -90 | 180): Promise<PhotoRef> {
  const supabase = createClient()

  const resp = await fetch(photo.url, { cache: 'no-store' })
  if (!resp.ok) throw new Error('Could not load the photo to rotate.')
  const bitmap = await createImageBitmap(await resp.blob())

  // Downscale oversized originals while we're re-encoding anyway.
  const scale = Math.min(1, COMPRESS_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const quarter = degrees === 90 || degrees === -90

  const canvas = document.createElement('canvas')
  canvas.width = quarter ? h : w
  canvas.height = quarter ? w : h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close?.()
    throw new Error('Canvas is not available in this browser.')
  }
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
  bitmap.close?.()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', COMPRESS_QUALITY),
  )
  if (!blob) throw new Error('Could not rotate the photo.')

  // Upload the rotated copy next to the old file (same report folder, new name).
  const newPath = photo.path.replace(/[^/]+$/, `${uuid()}.jpg`)
  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(newPath, blob, { contentType: 'image/jpeg', upsert: false })
  if (upErr) throw new Error(upErr.message)

  // Bucket is PRIVATE (migration 013): mint a signed URL for the rotated copy.
  // Best-effort — fall back to the old url if signing hiccups, since rendering
  // re-signs from `path` (which we always update below) regardless.
  const { data: signed } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(newPath, SIGNED_URL_TTL_SECONDS)
  const url = signed?.signedUrl ?? photo.url

  // Best-effort metadata swap + old-file cleanup.
  try {
    const reportId = photo.path.split('/')[0]
    await supabase.from('report_photos').insert({
      report_id: reportId,
      section_id: photo.sectionId ?? null,
      item_id: photo.itemId ?? null,
      url,
      path: newPath,
      caption: photo.caption ?? null,
    })
    await supabase.from('report_photos').delete().eq('path', photo.path)
    await supabase.storage.from(PHOTO_BUCKET).remove([photo.path])
  } catch {
    // Non-fatal — the JSON reference below is the canonical copy.
  }

  return { ...photo, url, path: newPath }
}

/** Remove a photo from Storage + its metadata row. Failures are non-fatal. */
export async function deletePhoto(photo: PhotoRef): Promise<void> {
  const supabase = createClient()
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([photo.path])
    await supabase.from('report_photos').delete().eq('path', photo.path)
  } catch {
    // Ignore — the JSON reference is removed by the caller regardless.
  }
}
