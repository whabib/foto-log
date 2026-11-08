// lex-cli writes relative imports with a ".js" suffix (NodeNext style).
// Turbopack doesn't map those to the .ts files, so strip the suffix.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) walk(file);
    else if (file.endsWith(".ts")) {
      const src = readFileSync(file, "utf8");
      const out = src.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)\.js(['"])/g, "$1$2$3");
      if (out !== src) writeFileSync(file, out);
    }
  }
}

walk(path.resolve(import.meta.dirname, "../lib/lexicon"));
