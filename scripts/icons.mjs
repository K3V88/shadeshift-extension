import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
const svg = await readFile("public/icons/icon.svg", "utf8");
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
    );
    await page.screenshot({
      path: `public/icons/icon${size}.png`,
      omitBackground: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
