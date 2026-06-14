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
  const [error, setError] = useState<string | null>(null)
  const [adjustingId, setAdjustingId] = useState<string | null>(null)
  // Always read the live copy from props so adjuster edits show immediately.
  const adjusting = adjustingId ? photos.find((p) => p.id === adjustingId) : undefined

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    // Collect every upload and append the whole batch in ONE onAdd call. Appending
    // per-file would make each call close over the same stale parent array (await
    // yields between iterations), so only the last photo would survive.
    const added: PhotoRef[] = []
    try {
      for (const file of Array.from(files)) {
        const ref = await uploadPhoto(file, { reportId, ...target })
        added.push(ref)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      // Persist whatever uploaded, even if a later file in the batch failed.
      if (added.length) onAdd(added)
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove(photo: PhotoRef) {
    onRemove(photo)
    await deletePhoto(photo)
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
          <span>{busy ? 'Uploading' : label}</span>
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
