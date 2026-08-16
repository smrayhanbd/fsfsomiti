import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(process.cwd())
const PAGES_DIR = path.join(ROOT, "app/dashboard")

function findPageFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findPageFiles(fullPath))
    } else if (entry.name === "page.tsx") {
      results.push(fullPath)
    }
  }
  return results
}

const pageFiles = findPageFiles(PAGES_DIR)
let fixed = 0

for (const file of pageFiles) {
  const content = fs.readFileSync(file, "utf8")
  // Pattern: async function Name({
  //   // Page-level permission guard...
  //   await guardDashboardPage("...")
  //
  //
  //   params,
  const broken = content.match(
    /(export\s+default\s+async\s+function\s+\w+\s*\(\{\s*\n\s*\/\/\s*Page-level permission guard[^\n]*\n\s*\/\/\s*if the user doesn't have access to this page\.\n\s*await guardDashboardPage\([^)]+\)\n\n*\s*)(params,)(\s*\n\}:\s*\{[^}]*\}\s*\n\}\)\s*\{)/
  )
  if (broken) {
    // Reconstruct: move the guard AFTER the `}: { ... }) {` block
    const beforeMatch = content.slice(0, broken.index)
    const afterMatch = content.slice(broken.index + broken[0].length)
    // The guard block (without trailing newlines)
    const guardBlock = broken[1].trim()
    // The fixed version: params, }: { ... }) { \n guardBlock \n
    const fixedContent =
      beforeMatch +
      "  " + broken[2] + broken[3].replace(/^\s*\n/, "\n") +
      "\n  " + guardBlock.replace(/\n/g, "\n  ") + "\n" +
      afterMatch
    fs.writeFileSync(file, fixedContent, "utf8")
    console.log(`  FIXED: ${file}`)
    fixed++
  }
}

console.log(`\nFixed ${fixed} files.`)
