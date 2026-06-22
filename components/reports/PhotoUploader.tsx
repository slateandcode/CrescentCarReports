'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Camera, X, Loader2 } from 'lucide-react'
import { uploadPhoto, deletePhoto, type UploadTarget } from '@/lib/photo-client'
import { IS_DEMO } from '@/lib/env'
import type { PhotoRef } from '@/lib/report-types'
import { cn } from '@/lib/utils'
import { PhotoAdjuster } from './PhotoAdjuster'

interface Props {
  reportId: string
  photos: PhotoRef[]
  target: Omit<UploadTarget, 'reportId'>
  /** Called once with ALL newly-uploaded photos so the parent can append the
   *  whole batch in a single update (the input allows multi-select). */
  onAdd: (photos: PhotoRef[]) => void
  onRemove: (photo: PhotoRef) => void
  /** Replace a photo in place (rotation / fit / caption from the adjuster). */
  onUpdate?: (photo: PhotoRef) => void
  label?: string
  className?: string
  /** Force the device camera (no gallery) on phones. Defaults to false so the
   *  inspector can pick an existing photo from the gallery as well as shoot one. */
  capture?: boolean
}

export function PhotoUploader({
  reportId,
  photos,
  target,
  onAdd,
  onRemove,
  onUpdate,
  label = 'Add photo',
  className,
  capture = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adjustingId, setAdjustingId] = useState<string | null>(null)
  // Always read the live copy from props so adjuster edits show immediately.
  const adjusting = adjustingId ? photos.find((p) => p.id === adjustingId) : undefined

  /** Upload up to this many photos at once — overlaps the network round-trips so a
   *  multi-photo batch finishes far quicker than the old one-at-a-time loop. */
  const UPLOAD_CONCURRENCY = 3

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setBusy(true)
    setError(null)
    setProgress({ done: 0, total: list.length })
    // Results are slotted by index so the batch keeps file order regardless of
    // which upload finishes first, then appended in ONE onAdd call (appending
    // per-file would close over a stale parent array and lose all but the last).
    const added: (PhotoRef | undefined)[] = new Array(list.length)
    let firstError: string | null = null
    let done = 0
    let next = 0
    const runOne = async (): Promise<void> => {
      for (;;) {
        const i = next++
        if (i >= list.length) return
        try {
          added[i] = await uploadPhoto(list[i], { reportId, ...target })
        } catch (e) {
          if (!firstError) firstError = e instanceof Error ? e.message : 'Upload failed.'
        } finally {
          done += 1
          setProgress({ done, total: list.length })
        }
      }
    }
    try {
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, list.length) }, runOne),
      )
    } finally {
      const ok = added.filter((p): p is PhotoRef => Boolean(p))
      // Persist whatever uploaded, even if some files in the batch failed.
      if (ok.length) onAdd(ok)
      if (firstError) setError(firstError)
      setBusy(false)
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove(photo: PhotoRef) {
    setError(null)
    onRemove(photo)
    const ok = await deletePhoto(photo)
    if (!ok) {
      // Storage delete failed — re-add so the photo (and a retry handle)
      // reappears instead of silently orphaning a private PII file.
      onAdd([photo])
      setError("Couldn't remove that photo — please try again.")
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div
            key={p.id}
            className="group relative h-20 w-20 overflow-hidden rounded-input border border-border bg-surface"
          >
            <Image
              src={p.url}
              alt={p.caption || 'Photo'}
              fill
              sizes="80px"
              className={p.fit === 'contain' ? 'object-contain' : 'object-cover'}
            />
            {/* Tap the photo to open the adjuster (rotate / fit / caption). */}
            <button
              type="button"
              onClick={() => setAdjustingId(p.id)}
              className="absolute inset-0 cursor-pointer"
              aria-label="Adjust photo"
              title="Adjust photo"
            />
            <button
              type="button"
              onClick={() => remove(p)}
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-90 transition-opacity hover:bg-fail"
              aria-label="Remove photo"
            >
              <X size={15} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || IS_DEMO}
          title={IS_DEMO ? 'Connect Supabase to upload photos' : undefined}
          className={cn(
            'flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-input border border-dashed border-border bg-surface text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent',
            (busy || IS_DEMO) && 'opacity-60 hover:border-border hover:text-text-secondary',
          )}
        >
          {busy ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
          <span>
            {busy ? (progress && progress.total > 1 ? `${progress.done}/${progress.total}` : 'Uploading') : label}
          </span>
        </button>
      </div>

      {IS_DEMO && <p className="mt-1.5 text-xs text-text-muted">Preview mode — connect Supabase to upload photos.</p>}
      {error && <p className="mt-1.5 text-xs text-fail">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        {...(capture ? { capture: 'environment' as const } : {})}
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {adjusting && (
        <PhotoAdjuster
          photo={adjusting}
          onChange={(next) => onUpdate?.(next)}
          onRemove={() => {
            setAdjustingId(null)
            void remove(adjusting)
          }}
          onClose={() => setAdjustingId(null)}
        />
      )}
    </div>
  )
}
