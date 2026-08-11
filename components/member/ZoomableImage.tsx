/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { X, ZoomIn, ChevronLeft, ChevronRight } from "lucide-react"

interface ZoomableImageProps {
  src: string
  alt: string
  className?: string
  // Optional caption shown below the zoomed image (e.g. "Member Photo", "Nominee Signature")
  caption?: string
  // Optional gallery: if provided, clicking left/right arrows navigates between images.
  // When gallery is set, src/alt are the initial image.
  gallery?: { src: string; alt: string; caption?: string }[]
  // Index of the initial image in the gallery (default 0)
  initialIndex?: number
}

/**
 * Wraps an <img> so clicking it opens a full-screen zoom modal.
 *
 * - The thumbnail uses whatever className you pass (preserving existing layout).
 * - A subtle zoom-cursor + hover overlay hint signals clickability.
 * - The modal shows the image at native resolution (up to 95vw × 90vh), with
 *   optional caption + optional gallery navigation arrows.
 * - ESC closes; clicking the backdrop closes.
 *
 * Works inside both Server Components (as an imported Client Component) and
 * Client Components.
 */
export default function ZoomableImage({
  src,
  alt,
  className,
  caption,
  gallery,
  initialIndex = 0,
}: ZoomableImageProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [idx, setIdx] = useState(initialIndex)
  // Guard against double-setting mounted (cascading-render lint rule).
  const mountedRef = useRef(false)

  // Resolve whether we're in gallery mode (gallery array with >1 item).
  const hasGallery = !!gallery && gallery.length > 1
  const current = hasGallery && gallery ? gallery[idx] : { src, alt, caption }

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      setMounted(true)
    }
  }, [])

  const close = useCallback(() => setOpen(false), [])
  const prev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    setIdx((i) => (i <= 0 ? (gallery?.length || 1) - 1 : i - 1))
  }, [gallery])
  const next = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    setIdx((i) => (i + 1) % (gallery?.length || 1))
  }, [gallery])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      if (hasGallery) {
        if (e.key === "ArrowLeft") prev()
        if (e.key === "ArrowRight") next()
      }
    }
    window.addEventListener("keydown", onKey)
    // Lock body scroll while modal is open.
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, close, prev, next, hasGallery])

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIdx(initialIndex)
          setOpen(true)
        }}
        className="group relative block cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-full"
        aria-label={`Zoom ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className} />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/30 group-hover:opacity-100">
          <ZoomIn className="h-5 w-5 text-white drop-shadow-lg" />
        </span>
      </button>

      {mounted && open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={current.alt}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Gallery: previous arrow */}
          {hasGallery && (
            <button
              type="button"
              onClick={prev}
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Image */}
          <div
            className="relative max-h-[90vh] max-w-[95vw] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.src}
              alt={current.alt}
              className="max-h-[85vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
            />
            {current.caption && (
              <p className="mt-3 text-center text-sm font-medium text-white/90">
                {current.caption}
                {hasGallery && (
                  <span className="ml-2 text-white/50">
                    ({idx + 1} / {gallery?.length})
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Gallery: next arrow */}
          {hasGallery && (
            <button
              type="button"
              onClick={next}
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Next image"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
