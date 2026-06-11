'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Camera, ImageOff, Loader2, RefreshCw, RotateCw, Trash2 } from 'lucide-react'
import { uploadPhoto, deletePhoto, pathFromPublicUrl } from '@/lib/photo-client'
import { IS_DEMO } from '@/lib/env'
import type { PhotoRef } from '@/lib/report-types'
import { PhotoAdjuster } from './PhotoAdjuster'

/** Large main vehicle photo with camera capture, preview, change & remove. */
export function MainImageUploader({
  reportId,
  url,
  onChange,
}: {
  reportId: string
  url: string | null
  onChange: (url: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const lastRef = useRef<PhotoRef | null>(null)

  /** PhotoRef for the current image — from the last upload, or rebuilt from the
   *  saved URL (path parsed out of the public storage URL) on a reloaded report. */
  function currentRef(): PhotoRef | null {
    if (!url) return null
    if (lastRef.current && lastRef.current.url === url) return lastRef.current
    const path = pathFromPublicUrl(url)
    return path ? { id: 'main', url, path, caption: null, sectionId: 'main', itemId: null } : null
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const ref = await uploadPhoto(file, { reportId, sectionId: 'main' })
      // Clean up the previously-uploaded main image if any.
      if (lastRef.current) await deletePhoto(lastRef.current)
      lastRef.current = ref
      onChange(ref.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove() {
    if (lastRef.current) {
      await deletePhoto(lastRef.current)
      lastRef.current = null
    }
    onChange(null)
  }

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-card border border-border bg-surface">
        {url ? (
          <Image src={url} alt="Vehicle" fill sizes="(min-width:768px) 600px, 100vw" className="object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
            <ImageOff size={32} />
            <p className="text-sm">No vehicle photo yet</p>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 size={28} className="animate-spin text-accent" />
          </div>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || IS_DEMO}
          title={IS_DEMO ? 'Connect Supabase to upload photos' : undefined}
          className="btn-secondary h-11 flex-1 text-sm"
        >
          {url ? <RefreshCw size={15} /> : <Camera size={15} />}
          {url ? 'Change photo' : 'Add vehicle photo'}
        </button>
        {url && !IS_DEMO && currentRef() && (
          <button
            type="button"
            onClick={() => {
              lastRef.current = currentRef()
              setAdjusting(true)
            }}
            disabled={busy}
            className="btn-secondary h-11 w-11 shrink-0 px-0"
            title="Rotate the photo"
          >
            <RotateCw size={15} />
          </button>
        )}
        {url && !IS_DEMO && (
          <button type="button" onClick={remove} disabled={busy} className="btn-danger h-11 w-11 shrink-0 px-0">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {adjusting && lastRef.current && (
        <PhotoAdjuster
          photo={lastRef.current}
          allowFit={false}
          allowCaption={false}
          onChange={(next) => {
            lastRef.current = next
            onChange(next.url)
          }}
          onRemove={() => {
            setAdjusting(false)
            void remove()
          }}
          onClose={() => setAdjusting(false)}
        />
      )}

      {IS_DEMO && <p className="mt-1.5 text-xs text-text-muted">Preview mode — connect Supabase to upload photos.</p>}
      {error && <p className="mt-1.5 text-xs text-fail">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  )
}
