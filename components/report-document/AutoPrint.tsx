'use client'

import { useEffect } from 'react'

/**
 * Opens the browser print dialog once, after the report's images have painted.
 * Rendered on the preview page only when it is reached with `?print=1` — the
 * PrintButton's fallback navigates here so a failed server-PDF prints the clean,
 * paginated report document instead of window.print() capturing the editor form.
 */
export function AutoPrint() {
  useEffect(() => {
    let fired = false
    const fire = () => {
      if (fired) return
      fired = true
      window.print()
    }
    const imgs = Array.from(document.images)
    Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => undefined)))).then(() =>
      setTimeout(fire, 300),
    )
    // Safety net so a slow/broken image can't stop the dialog from opening.
    const t = setTimeout(fire, 8000)
    return () => clearTimeout(t)
  }, [])
  return null
}
