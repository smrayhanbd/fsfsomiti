import { defineConfig } from "vitest/config"
import path from "node:path"

// ─────────────────────────────────────────────────────────────────────────
// Vitest configuration.
//
// Scope: `tests/unit/**/*.test.ts` — pure-function tests that don't touch the
// DB or the network. Each test file is independent and can be run in parallel.
//
// The `@/*` path alias is mirrored from tsconfig.json so tests can import
// project code exactly the same way the app does.
//
// Environment is `node` (NOT jsdom) because:
//   1. The pure functions we're testing (loanSchedule, dueCalculator,
//      ballotCrypto, voucher) don't touch the DOM.
//   2. jsdom + node:crypto interop is flaky; the Node runtime has the
//      full `node:crypto` module available.
//
// Coverage is opt-in: run `npm test -- --coverage` to generate the
// text/json/html report under `coverage/`.
// ─────────────────────────────────────────────────────────────────────────
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/**/types.ts",
        "lib/**/*.d.ts",
        "lib/tree.ts",
        // Next.js client/server wrappers — tested via e2e, not unit.
        "lib/permissions/client.tsx",
        "lib/permissions/api.ts",
      ],
    },
  },
})
