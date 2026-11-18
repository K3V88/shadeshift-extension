import { build } from "vite";
import { copyFile } from "node:fs/promises";
await build();
for (const [name, entry, format] of [
  ["content", "src/content/index.ts", "iife"],
  ["background", "src/background/index.ts", "es"],
]) {
  await build({
    configFile: false,
    publicDir: false,
    build: {
      target: "chrome120",
      emptyOutDir: false,
      lib: {
        entry,
        name: "ShadeShift",
        formats: [format],
        fileName: () => `${name}.js`,
      },
    },
  });
}
await copyFile("manifest.json", "dist/manifest.json");
await import("./verify.mjs");
