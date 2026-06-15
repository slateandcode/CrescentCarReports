'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Camera, ImageOff, Loader2, RefreshCw, RotateCw, Trash2 } from 'lucide-react'
import { uploadPhoto, deletePhoto, pathFromPublicUrl } from '@/lib/photo-client'
import { IS_DEMO } from '@/lib/env'
import type { PhotoRef } from '@/lib/report-types'
import { PhotoAdjuster } from './PhotoAdjuster'

/** Large main vehicle photo (camera or gallery), with preview, change & remove. */
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
  // The photo currently open in the adjuster — held in state (not a ref) so the
  // render reflects it; reading a ref during render is fragile and lint-banned.
  const [adjustTarget, setAdjustTarget] = useState<PhotoRef | null>(null)
  // Last UPLOADED ref, kept only to clean up the old storage file on replace /
  // remove. Read/written exclusively in event handlers, never during render.
  const lastRef = useRef<PhotoRef | null>(null)

  /** PhotoRef for the current image, rebuilt from the saved URL (path parsed out
   *  of the public storage URL). Pure — safe to call during render. */
  function currentRef(): PhotoRef | null {
    if (!url) return null
    const path = pathFromPublicUrl(url)
    return path ? { id: 'main', url, path, caption: null, sectionId: 'main', itemId: null } : null
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const ref = await uploadPhoto(file, { reportId, sectionId: 'main' })
      // Clean up the previous main image's storage file. lastRef only holds
      // in-session uploads, so for a photo loaded from a saved report it's null —
      // fall back to a ref derived from the saved URL so the orphan is still
      // removed. Best-effort: deletePhoto swallows its own failures.
      const prev = lastRef.current ?? currentRef()
      if (prev) await deletePhoto(prev)
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
    // As in handleFile: prefer the in-session ref, else derive one from the saved
    // URL so a pre-existing main photo's storage file is cleaned up too.
    const target = lastRef.current ?? currentRef()
    if (target) await deletePhoto(target)
    lastRef.current = null
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
            onClick={() => setAdjustTarget(currentRef())}
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

      {adjustTarget && (
        <PhotoAdjuster
          photo={adjustTarget}
          allowFit={false}
          allowCaption={false}
          onChange={(next) => {
            lastRef.current = next
            setAdjustTarget(next)
            onChange(next.url)
          }}
          onRemove={() => {
            setAdjustTarget(null)
            void remove()
          }}
          onClose={() => setAdjustTarget(null)}
        />
      )}

      {IS_DEMO && <p className="mt-1.5 text-xs text-text-muted">Preview mode — connect Supabase to upload photos.</p>}
      {error && <p className="mt-1.5 text-xs text-fail">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  )
}
