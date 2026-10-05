import { readFile } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const games = ["snake", "breakout", "splat", "asteroids", "missile", "starfall"];
const allowed = new Set(["src/geometry.js", "src/decisions.js"]);
for (const game of games) allowed.add(`src/games/${game}/model.js`);

// Inspect the full dependency graph, including re-exports and dynamic imports,
// so putting the host behind a nominally neutral helper cannot bypass the check.
export async function checkModelBoundary() {
  const visited = new Set();
  async function visit(path, chain = []) {
    const name = relative(root, path);
    if (!allowed.has(name)) throw new Error(`Model dependency crosses the boundary: ${[...chain, name].join(" -> ")}`);
    if (visited.has(path)) return;
    visited.add(path);
    const source = (await readFile(path, "utf8")).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    if (/\b(?:window|document|requestAnimationFrame|cancelAnimationFrame|CanvasRenderingContext2D)\b|\b(?:getContext|fillText|fillRect|strokeRect)\s*\(/.test(source)) {
      throw new Error(`Model-safe module uses host or rendering APIs: ${name}`);
    }
    const imports = source.matchAll(/(?:\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?|\bimport\s*\(\s*)["']([^"']+)["']/g);
    for (const [, specifier] of imports) {
      if (!specifier.startsWith(".")) throw new Error(`Model-safe module has an external dependency: ${name} -> ${specifier}`);
      await visit(resolve(dirname(path), specifier), [...chain, name]);
    }
  }
  for (const game of games) await visit(resolve(root, `src/games/${game}/model.js`));
  for (const game of games) {
    const facade = await readFile(resolve(root, `src/games/${game}/index.js`), "utf8");
    const view = await readFile(resolve(root, `src/games/${game}/view.js`), "utf8");
    if (/\bfrom\s*["'][^"']*engine\.js["']/.test(view)) throw new Error(`View imports rendering from the host: ${game}`);
  }
  return visited.size;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkModelBoundary();
  console.log("model-boundary: arcade models depend only on model-safe modules");
}
