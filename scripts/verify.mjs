import { readFile, access } from "node:fs/promises";
import assert from "node:assert/strict";
const m = JSON.parse(await readFile("dist/manifest.json", "utf8"));
assert.equal(m.manifest_version, 3);
for (const file of [
  "popup.html",
  m.background.service_worker,
  ...m.content_scripts.flatMap((s) => s.js),
  ...Object.values(m.icons),
  ...Object.values(m.action.default_icon),
])
  await access(`dist/${file}`);
for (const [size, path] of Object.entries(m.icons)) {
  const data = await readFile("dist/" + path);
  assert.equal(data.subarray(1, 4).toString(), "PNG");
  assert.equal(data.readUInt32BE(16), Number(size));
  assert.equal(data.readUInt32BE(20), Number(size));
}
const content = await readFile("dist/content.js", "utf8");
assert.ok(
  !/import\s.*from\s/.test(content),
  "Content script must be standalone",
);
console.log(
  "Verified: MV3 manifest, standalone scripts, popup and all four PNG icon sizes.",
);
