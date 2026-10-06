import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { basename, join } from "node:path";

const root = new URL("../", import.meta.url);
const vendor = new URL("vendor/ai/", root);
const manifest = JSON.parse(await readFile(new URL("manifest.json", vendor), "utf8"));
const lock = JSON.parse(await readFile(new URL("scripts/ai-runtime/package-lock.json", root), "utf8"));
const provenance = JSON.parse(await readFile(new URL("scripts/ai-runtime/package.json", root), "utf8"));
for (const [name, version] of Object.entries(manifest.packages)) {
  const record = lock.packages[`node_modules/${name}`];
  if (provenance.dependencies[name] !== version || lock.packages[""].dependencies[name] !== version || record?.version !== version || !record.integrity?.startsWith("sha512-") || !record.resolved.startsWith("https://registry.npmjs.org/")) throw new Error(`Invalid pinned npm provenance: ${name}`);
}
const digest = (bytes, algorithm = "sha256", encoding = "hex") => createHash(algorithm).update(bytes).digest(encoding);

export function verifyBytes(file, bytes) {
  if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error(`AI asset integrity mismatch: ${file.path}`);
}

export async function verifyRuntime(directory = vendor) {
  const expected = new Set(manifest.files.map(file => file.path));
  for (const name of await readdir(directory)) {
    if (/\.(?:js|mjs|wasm)$/.test(name) && !expected.has(name)) throw new Error(`Unreviewed executable AI asset: ${name}`);
  }
  for (const file of manifest.files) verifyBytes(file, await readFile(new URL(file.path, directory)));
  return manifest.files.reduce((sum, file) => sum + file.bytes, 0);
}

async function restoreRuntime(archiveDirectory) {
  const archives = new Map();
  // Verify every output before writing any of them. Never run npm lifecycle code.
  const outputs = [];
  for (const file of manifest.files) {
    let bytes;
    if (file.url) {
      const response = await fetch(file.url);
      if (!response.ok) throw new Error(`Download failed: ${file.url}`);
      bytes = Buffer.from(await response.arrayBuffer());
      // Upstream license ends with an extra blank line; the checked-in copy is
      // normalized to one newline. Executable package bytes are never changed.
      bytes = Buffer.from(bytes.toString("utf8").trimEnd() + "\n");
    } else {
      const record = lock.packages[`node_modules/${file.package}`];
      if (!record?.integrity?.startsWith("sha512-") || !record.resolved.startsWith("https://registry.npmjs.org/")) throw new Error(`Invalid npm provenance: ${file.package}`);
      if (!archives.has(file.package)) {
        let archive;
        if (archiveDirectory) archive = await readFile(join(archiveDirectory, basename(record.resolved)));
        else {
          const response = await fetch(record.resolved);
          if (!response.ok) throw new Error(`Download failed: ${record.resolved}`);
          archive = Buffer.from(await response.arrayBuffer());
        }
        if (`sha512-${digest(archive, "sha512", "base64")}` !== record.integrity) throw new Error(`npm tarball integrity mismatch: ${file.package}`);
        archives.set(file.package, archive);
      }
      bytes = execFileSync("tar", ["-xzOf", "-", file.member], { input: archives.get(file.package), maxBuffer: 32 * 1024 * 1024 });
    }
    verifyBytes(file, bytes);
    outputs.push([file.path, bytes]);
  }
  for (const [path, bytes] of outputs) await writeFile(new URL(path, vendor), bytes);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === "--restore") await restoreRuntime(args[1]);
  else if (args.length) throw new Error("Usage: node scripts/vendor-ai-runtime.mjs [--restore [archive-directory]]");
  console.log(`Verified ${manifest.files.length} pinned AI assets (${await verifyRuntime()} bytes).`);
}
