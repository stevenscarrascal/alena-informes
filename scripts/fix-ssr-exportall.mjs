import fs from "node:fs";
import path from "node:path";

const ssrDir = path.resolve(process.cwd(), ".output/server/_ssr");

function patchFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const from = "var server_exports = /* @__PURE__ */ __exportAll({";
  const to = "var server_exports = /* @__PURE__ */ __exportAll$1({";

  if (!source.includes(from)) return false;
  const patched = source.replace(from, to);
  fs.writeFileSync(filePath, patched, "utf8");
  return true;
}

if (!fs.existsSync(ssrDir)) {
  process.exit(0);
}

let patchedCount = 0;
for (const name of fs.readdirSync(ssrDir)) {
  if (!name.startsWith("transport-") || !name.endsWith(".mjs")) continue;
  const fullPath = path.join(ssrDir, name);
  if (patchFile(fullPath)) {
    patchedCount += 1;
  }
}

if (patchedCount > 0) {
  console.log(`[fix-ssr-exportall] patched ${patchedCount} file(s)`);
}
