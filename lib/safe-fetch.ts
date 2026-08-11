/**
 * Safe fetch helper for the RBAC admin UI.
 *
 * Wraps `fetch()` + JSON parsing so that the three failure modes that
 * crash `await res.json()` are handled gracefully:
 *
 *   1. Network error (fetch itself throws)            → { ok:false, kind:"network" }
 *   2. Empty body or non-JSON body                    → { ok:false, kind:"non-json" }
 *   3. HTTP error status OR { success:false } body    → { ok:false, kind:"api", error }
 *
 * On success returns { ok:true, data } where data is the parsed JSON
 * envelope's `data` field.
 *
 * The caller is expected to do:
 *
 *   const r = await safeFetch(url, { method: "PUT", body: ... })
 *   if (!r.ok) { toast.error(r.title, { description: r.description }); return }
 *   // use r.data
 */
"use client"

export interface SafeFetchOk<T> {
  ok: true
  data: T
}
export interface SafeFetchErr {
  ok: false
  /** Short title for the toast (e.g. "Network error"). */
  title: string
  /** Longer description for the toast body. */
  description: string
  /** HTTP status code, if a response was received. */
  status?: number
}
export type SafeFetchResult<T> = SafeFetchOk<T> | SafeFetchErr

/**
 * Standard API envelope returned by every /api/permissions/* route.
 *   { success: true,  data: T }
 *   { success: false, error: string }
 */
interface ApiEnvelope<T> {
  success?: boolean
  data?: T
  error?: string
}

/**
 * Fetch a JSON endpoint safely. Mirrors the standard `fetch()` signature
 * but returns a discriminated union instead of throwing.
 */
export async function safeFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<SafeFetchResult<T>> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    return {
      ok: false,
      title: "Network error",
      description: "Could not reach the server. Please check your connection and try again.",
    }
  }

  // Read the body as text first, then attempt to parse as JSON. This
  // avoids the "Unexpected end of JSON input" crash when the server
  // returns an empty body (e.g. a 500 with no JSON, a proxy error
  // page, or a middleware redirect that produced an HTML response).
  const text = await res.text()
  let envelope: ApiEnvelope<T> = {}
  if (text) {
    try {
      envelope = JSON.parse(text) as ApiEnvelope<T>
    } catch {
      return {
        ok: false,
        title: "Server returned a non-JSON response",
        description: `HTTP ${res.status} ${res.statusText}. The server may be restarting or a proxy error occurred.`,
        status: res.status,
      }
    }
  }

  if (!res.ok || !envelope.success) {
    return {
      ok: false,
      title: "Could not save",
      description: envelope.error || `HTTP ${res.status} ${res.statusText}`,
      status: res.status,
    }
  }

  return { ok: true, data: envelope.data as T }
}
