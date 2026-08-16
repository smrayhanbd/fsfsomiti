import fs from "node:fs"
import path from "node:path"

// Generate prisma/registry.json from lib/permissions/permission-registry.ts
// so the CJS seed script can read it without needing a TS transpiler.
//
// Run: node scripts/sync-registry.mjs
// Then: npm run seed:rbac (which reads registry.json)

const ROOT = path.resolve(process.cwd())
const TS_FILE = path.join(ROOT, "lib/permissions/permission-registry.ts")
const JSON_FILE = path.join(ROOT, "prisma/registry.json")

const ts = fs.readFileSync(TS_FILE, "utf8")

// Extract the PERMISSION_REGISTRY object from the TS source.
// We find `PERMISSION_REGISTRY = {` ... `} as const` and parse the object.
const start = ts.indexOf("PERMISSION_REGISTRY = {")
if (start === -1) {
  console.error("Could not find PERMISSION_REGISTRY in the TS file")
  process.exit(1)
}
let depth = 0
let end = -1
for (let i = start + "PERMISSION_REGISTRY = ".length; i < ts.length; i++) {
  if (ts[i] === "{") depth++
  else if (ts[i] === "}") {
    depth--
    if (depth === 0) { end = i + 1; break }
  }
}
if (end === -1) {
  console.error("Could not find the end of PERMISSION_REGISTRY")
  process.exit(1)
}

const objStr = ts.slice(start + "PERMISSION_REGISTRY = ".length, end)

// The TS object uses `as const satisfies ...` which isn't valid JS.
// Strip the trailing type assertion.
let cleanStr = objStr
  // Strip single-line comments (// ...)
  .replace(/\/\/[^\n]*/g, "")
  // Strip multi-line comments (/* ... */)
  .replace(/\/\*[\s\S]*?\*\//g, "")

// JSON requires quoted keys — wrap bare identifiers in quotes.
cleanStr = cleanStr.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_' ]*?)(\s*:)/g, (match, prefix, key, colon) => {
  // Only quote if it's not already quoted
  if (key.startsWith("'") || key.startsWith('"')) return match
  // Handle keys with apostrophes like "Member's Pending Req."
  return `${prefix}"${key.replace(/"/g, '\\"')}":`
})

// Remove trailing commas in arrays/objects (not allowed in JSON)
cleanStr = cleanStr.replace(/,(\s*[}\]])/g, "$1")

let registry
try {
  registry = JSON.parse(cleanStr)
} catch (e) {
  console.error("Failed to parse registry JSON:", e.message)
  // Write the cleaned string for debugging
  fs.writeFileSync("/tmp/registry-debug.txt", cleanStr)
  console.error("Cleaned string written to /tmp/registry-debug.txt")
  process.exit(1)
}

// Write to prisma/registry.json
fs.writeFileSync(JSON_FILE, JSON.stringify(registry, null, 2) + "\n", "utf8")

// Count summary
let pages = 0
let actions = 0
let tabs = 0
for (const group of Object.keys(registry)) {
  for (const page of Object.keys(registry[group])) {
    pages++
    actions += registry[group][page].actions?.length || 0
    tabs += registry[group][page].tabs?.length || 0
  }
}

console.log(`✓ Wrote prisma/registry.json`)
console.log(`  Groups: ${Object.keys(registry).length}`)
console.log(`  Pages:  ${pages}`)
console.log(`  Tabs:   ${tabs}`)
console.log(`  Actions: ${actions}`)
console.log(`  Total permission nodes: ${pages + actions + tabs + Object.keys(registry).length}`)
