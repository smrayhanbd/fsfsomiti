// ──────────────────────────────────────────────────────────────────────────────
// Detect Next.js redirect errors thrown from server actions.
//
// When a server action calls redirect(), Next throws a special error on the
// server that surfaces on the client as a thrown value. If a client handler
// awaits such an action inside try/catch, the throw lands in `catch` — so a
// naive catch-all would show a spurious error toast even though the action
// succeeded. Callers should re-throw redirect errors so Next can perform the
// navigation:
//
//   try {
//     await someActionThatRedirects()
//   } catch (err) {
//     if (isNextRedirect(err)) throw err
//     toast.error("Something went wrong.")
//   }
// ──────────────────────────────────────────────────────────────────────────────

export function isNextRedirect(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.message === "NEXT_REDIRECT") return true
  // The canonical marker lives on `digest`, which isn't on the Error type —
  // read it defensively.
  const digest = (err as { digest?: unknown }).digest
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")
}
