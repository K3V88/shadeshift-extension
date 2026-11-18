import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const directory = new URL("../tests/fixtures/", import.meta.url);
const port = Number(process.env.PORT || 8100);
const server = createServer(async (req, res) => {
  try {
    let path = new URL(req.url, "http://localhost").pathname;
    if (path === "/") path = "/light.html";
    if (!/^\/[a-z-]+\.html$/.test(path)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(await readFile(fileURLToPath(new URL(path.slice(1), directory))));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `ShadeShift fixtures: http://127.0.0.1:${port}/light.html (also dark.html, mixed.html, transparent.html, frames.html)`,
  ),
);
