"use client"

/**
 * Root error boundary.
 *
 * This is Next.js' LAST line of defence — it catches errors that escape
 * `app/error.tsx` (i.e. errors thrown by the root layout itself, or by
 * `app/error.tsx`). Because the root layout's `<html>`/`<body>` may have
 * failed to render, this file must render its OWN `<html>` and `<body>`.
 *
 * Kept deliberately minimal: no Tailwind theme, no UI primitives, no DB
 * access — just enough markup to tell the user the app is down and let them
 * retry. Sentry (when configured) will still capture the error.
 */
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[GlobalErrorBoundary]", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1A1A1A",
          color: "#FAFAFA",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: "2rem" }}>
          {/* Brand mark */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "linear-gradient(135deg, #C9A84C 0%, #8B6F2A 100%)",
              color: "#fff",
              fontWeight: 800,
              fontSize: 24,
              marginBottom: 24,
            }}
            aria-hidden
          >
            S
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#B5B5B5", marginBottom: 24 }}>
            The application hit an unexpected error. Your data is safe. Try
            reloading the page — if the problem persists, contact your
            administrator.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              background: "#C9A84C",
              color: "#1A1A1A",
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {process.env.NODE_ENV !== "production" && (
            <pre
              style={{
                marginTop: 24,
                textAlign: "left",
                fontSize: 12,
                color: "#FF6B6B",
                background: "#222",
                padding: 12,
                borderRadius: 8,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {error?.message || String(error)}
              {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          )}
        </div>
      </body>
    </html>
  )
}
