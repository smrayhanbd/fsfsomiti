/**
 * TrustRibbon — the signature brand element of Somiti MS.
 *
 * A persistent 3px horizontal gradient bar (Royal Blue → Violet → Warm Gold)
 * placed at the very top of every screen. This single element makes the
 * product instantly recognizable, per the design system.
 *
 * Render it as the first child of any full-page / shell container.
 */
export default function TrustRibbon({ className = "" }: { className?: string }) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={`trust-gradient h-[3px] w-full shrink-0 ${className}`}
    />
  )
}
