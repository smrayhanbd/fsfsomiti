import React from "react"

/**
 * OrgLogo — renders the organization's uploaded logo when present, otherwise
 * falls back to its children (typically a `<Building2 />` icon). Callers keep
 * their own wrapper styling (brand-gradient box, white/20 backdrop, etc.) and
 * just pass the fallback inside.
 *
 * Centralizes the single `@next/next/no-img-element` lint disable so it isn't
 * scattered across every chrome surface.
 */
export default function OrgLogo({
  logo,
  alt,
  className,
  children,
}: {
  logo: string | null | undefined
  alt: string
  className?: string
  children?: React.ReactNode
}) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={alt} className={className} />
  }
  return <>{children}</>
}
