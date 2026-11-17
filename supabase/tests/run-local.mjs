import { PGlite } from "@electric-sql/pglite"
import fs from "node:fs"
// Usage (base locale en mémoire, aucune connexion à Supabase) :
//   cd supabase/tests && npm i --no-save @electric-sql/pglite && node run-local.mjs --twice
import path from "node:path"
import { fileURLToPath } from "node:url"
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const db = new PGlite()
const files = ["tests/00_stubs_local.sql", ...fs.readdirSync(dir + "/migrations").sort().map(f => "migrations/" + f)]
const twice = process.argv.includes("--twice")
for (const f of [...files, ...(twice ? files.slice(1) : [])]) {
  try { await db.exec(fs.readFileSync(`${dir}/${f}`, "utf8")); console.log("OK", f) }
  catch (e) { console.log("FAIL", f, e.message); process.exit(1) }
}
if (fs.existsSync(`${dir}/tests/rls_test.sql`)) {
  try { const r = await db.exec(fs.readFileSync(`${dir}/tests/rls_test.sql`, "utf8")); for (const x of r) if (x.rows?.length) console.log(JSON.stringify(x.rows)) ; console.log("RLS TEST OK") }
  catch (e) { console.log("RLS FAIL", e.message); process.exit(1) }
}
