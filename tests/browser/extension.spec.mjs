import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launch } from "./harness.mjs";
let app, server, origin;
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const name = new URL(req.url, "http://localhost").pathname.slice(1);
      if (!/^[a-z-]+\.html$/.test(name)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "no-store");
      res.end(await readFile(resolve("tests/fixtures", name)));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, r));
  origin = `http://127.0.0.1:${server.address().port}`;
  app = await launch();
});
test.afterAll(async () => {
  await app?.close();
  if (server) await new Promise((r) => server.close(r));
});
async function open(name) {
  const page = await app.context.newPage();
  await page.goto(`${origin}/${name}.html`);
  return page;
}
const bg = (p) =>
  p.locator("body").evaluate((e) => getComputedStyle(e).backgroundColor);
async function snapshot(popup) {
  return popup.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return chrome.tabs.sendMessage(
      tab.id,
      { type: "page:get" },
      { frameId: 0 },
    );
  });
}
async function setting(popup, patch) {
  return popup.evaluate(
    async (patch) =>
      chrome.runtime.sendMessage({ type: "settings:update", ...patch }),
    patch,
  );
}
async function reset() {
  const page = await open("dark");
  const popup = await app.popup(page);
  await expect
    .poll(() => popup.evaluate(() => !!document.querySelector("h1")))
    .toBe(true);
  await setting(popup, {
    global: true,
    defaults: {
      mode: "auto",
      brightness: 100,
      contrast: 100,
      preset: "neutral",
    },
    domain: "127.0.0.1",
    resetSite: true,
    excluded: false,
  });
  await popup.close();
  await page.close();
}
test.beforeEach(reset);
test("automatically darkens light surfaces, preserves media and readable contrast", async () => {
  const page = await open("light");
  await expect.poll(() => bg(page)).toBe("rgb(18, 18, 18)");
  await expect(page.locator("#card")).toHaveCSS(
    "background-color",
    "rgb(30, 30, 30)",
  );
  await expect(page.locator("#text")).toHaveCSS("color", "rgb(234, 234, 234)");
  for (const id of ["image", "video", "canvas", "illustration"])
    await expect(page.locator("#" + id)).toHaveCSS("filter", "none");
  await expect(page.locator("#illustration rect")).toHaveAttribute(
    "fill",
    "#0088cc",
  );
  await expect(page.locator("#image")).toHaveAttribute("src", /^data:image/);
  await expect(page.locator("#field")).toHaveCSS(
    "background-color",
    "rgb(30, 30, 30)",
  );
  await expect(page.locator("td").first()).toHaveCSS(
    "border-top-color",
    "rgb(56, 56, 56)",
  );
  const popup = await app.popup(page);
  await expect
    .poll(async () => (await snapshot(popup)).detection.theme)
    .toBe("Light");
  expect((await snapshot(popup)).active).toBe(true);
  await popup.close();
  await page.close();
});
test("native dark and transparent dark pages remain untouched", async () => {
  for (const name of ["dark", "transparent"]) {
    const page = await open(name);
    const popup = await app.popup(page);
    await expect
      .poll(async () => (await snapshot(popup)).detection.theme)
      .toBe("Dark");
    expect((await snapshot(popup)).active).toBe(false);
    expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(
      0,
    );
    await popup.close();
    await page.close();
  }
});
test("mixed pages are preserved until explicitly forced", async () => {
  const page = await open("mixed");
  const popup = await app.popup(page);
  await expect
    .poll(async () => (await snapshot(popup)).detection.theme)
    .toBe("Mixed");
  expect((await snapshot(popup)).active).toBe(false);
  await popup.evaluate(() =>
    document.querySelector('[title="Force Dark Mode"]').click(),
  );
  await expect(page.locator("#light")).toHaveCSS(
    "background-color",
    "rgb(30, 30, 30)",
  );
  await popup.close();
  await page.close();
});
test("original mode restores exact authored styling and site override survives navigation", async () => {
  const page = await open("light");
  await expect.poll(() => bg(page)).toBe("rgb(18, 18, 18)");
  const popup = await app.popup(page);
  await popup.evaluate(() =>
    document.querySelector('[title="Force Original Appearance"]').click(),
  );
  await expect.poll(() => bg(page)).toBe("rgb(255, 255, 255)");
  await expect(page.locator("#text")).toHaveCSS("color", "rgb(17, 17, 17)");
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  await popup.close();
  await page.reload();
  await expect.poll(() => bg(page)).toBe("rgb(255, 255, 255)");
  const again = await app.popup(page);
  await expect.poll(async () => (await snapshot(again)).mode).toBe("original");
  await again.close();
  await page.close();
});
test("dynamic content, SPA changes, native theme changes and shadow DOM are handled", async () => {
  const page = await open("light");
  await expect.poll(() => bg(page)).toBe("rgb(18, 18, 18)");
  await expect(page.locator("#shadow-card")).toHaveCSS(
    "background-color",
    "rgb(30, 30, 30)",
  );
  await page.evaluate(() => {
    history.pushState({}, "", "/light.html?route=next");
    const div = document.createElement("div");
    div.id = "new-card";
    div.style.cssText = "background:white;color:black;padding:20px";
    div.textContent = "Dynamically added content";
    document.querySelector("#dynamic").append(div);
  });
  await expect(page.locator("#new-card")).toHaveCSS(
    "background-color",
    "rgb(30, 30, 30)",
  );
  await page.evaluate(() => {
    document.body.style.backgroundColor = "#101010";
    document.documentElement.style.backgroundColor = "#101010";
    document.querySelector("main").style.backgroundColor = "#101010";
    document.querySelector("#card").remove();
    document.querySelector("#media").remove();
    document.querySelector(".gradient").remove();
    document.querySelector("table").remove();
    document.querySelector("#new-card").remove();
    document.querySelector("#shadow-host").remove();
  });
  await expect.poll(() => bg(page)).toBe("rgb(16, 16, 16)");
  await expect
    .poll(() => page.evaluate(() => document.adoptedStyleSheets.length))
    .toBe(0);
  await page.close();
});
test("global switch, site exclusion, preset and brightness save through the real popup", async () => {
  const page = await open("light");
  await expect.poll(() => bg(page)).toBe("rgb(18, 18, 18)");
  const popup = await app.popup(page);
  await expect
    .poll(() =>
      popup.evaluate(() => document.querySelectorAll("[role=switch]").length),
    )
    .toBe(3);
  await popup.evaluate(() => document.querySelector("[role=switch]").click());
  await expect.poll(() => bg(page)).toBe("rgb(255, 255, 255)");
  await popup.evaluate(() => document.querySelector("[role=switch]").click());
  await expect.poll(() => bg(page)).toBe("rgb(18, 18, 18)");
  await popup.evaluate(() =>
    document.querySelectorAll("[role=switch]")[1].click(),
  );
  await expect.poll(() => bg(page)).toBe("rgb(255, 255, 255)");
  await popup.evaluate(() =>
    document.querySelectorAll("[role=switch]")[1].click(),
  );
  await expect.poll(() => bg(page)).toBe("rgb(18, 18, 18)");
  await popup.evaluate(() => {
    const select = document.querySelector("fieldset select");
    select.value = "midnight";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => bg(page)).toBe("rgb(16, 19, 31)");
  await popup.evaluate(() => {
    const input = document.querySelector("#brightness");
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, "120");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => bg(page)).toBe("rgb(19, 23, 37)");
  await popup.close();
  await page.close();
});
test("same-origin iframes are themed; cross-origin iframes are left alone", async () => {
  const page = await open("frames");
  await expect(page.frameLocator("#same").locator("body")).toHaveCSS(
    "background-color",
    "rgb(18, 18, 18)",
  );
  await expect(page.frameLocator("#cross").locator("body")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.close();
});
test("preferences persist across an actual browser restart", async () => {
  const profile = await mkdtemp(join(tmpdir(), "shadeshift-persist-"));
  let other = await launch(profile);
  try {
    let page = await other.context.newPage();
    await page.goto(origin + "/light.html");
    let popup = await other.popup(page);
    await expect
      .poll(() =>
        popup.evaluate(() => !!document.querySelector("[role=switch]")),
      )
      .toBe(true);
    await setting(popup, {
      global: false,
      domain: "127.0.0.1",
      site: { mode: "dark", brightness: 90 },
    });
    await popup.close();
    await other.close();
    other = await launch(profile);
    page = await other.context.newPage();
    await page.goto(origin + "/light.html");
    popup = await other.popup(page);
    await expect
      .poll(() =>
        popup.evaluate(async () => {
          const { settings } = await chrome.storage.local.get("settings");
          return settings?.enabled;
        }),
      )
      .toBe(false);
    const stored = await popup.evaluate(
      async () => (await chrome.storage.local.get("settings")).settings,
    );
    expect(stored.sites["127.0.0.1"].brightness).toBe(90);
    await expect.poll(() => bg(page)).toBe("rgb(255, 255, 255)");
    await popup.close();
  } finally {
    await other.close();
    await rm(profile, { recursive: true, force: true });
  }
});
test("modern CSS colors and gradients work without media inversion", async () => {
  const page = await open("light");
  await expect.poll(() => bg(page)).toBe("rgb(18, 18, 18)");
  await expect(page.locator(".gradient")).not.toHaveCSS(
    "background-image",
    /rgb\(255, 255, 255\)/,
  );
  await page.evaluate(() => {
    const div = document.createElement("div");
    div.id = "modern";
    div.style.cssText =
      "background:oklch(98% 0.01 270);color:color(display-p3 0.1 0.1 0.1);padding:40px";
    div.textContent = "Modern color surface";
    document.querySelector("main").append(div);
  });
  await expect(page.locator("#modern")).toHaveCSS(
    "background-color",
    "rgb(30, 30, 30)",
  );
  await page.close();
});
test("long pages finish in batches and settle without mutation feedback", async () => {
  const page = await open("light");
  await expect.poll(() => bg(page)).toBe("rgb(18, 18, 18)");
  await page.evaluate(() => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 1200; i++) {
      const p = document.createElement("p");
      p.id = "long-" + i;
      p.style.cssText = "background:white;color:black";
      p.textContent = "Long page content " + i;
      fragment.append(p);
    }
    document.querySelector("#dynamic").append(fragment);
  });
  await expect(page.locator("#long-1199")).toHaveCSS(
    "background-color",
    "rgb(30, 30, 30)",
  );
  const popup = await app.popup(page);
  await expect.poll(async () => (await snapshot(popup)).processing).toBe(false);
  await popup.close();
  const idle = await page.evaluate(async () => {
    let mutations = 0;
    const observer = new MutationObserver((records) => {
      mutations += records.length;
    });
    await new Promise((r) => setTimeout(r, 500));
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      childList: true,
    });
    await new Promise((r) => setTimeout(r, 500));
    observer.disconnect();
    return mutations;
  });
  expect(idle).toBe(0);
  await page.close();
});
test("unsupported browser pages are explained in the popup", async () => {
  const page = await app.context.newPage();
  await page.goto("chrome://version");
  const popup = await app.popup(page);
  await expect
    .poll(() =>
      popup.evaluate(() =>
        document.body.textContent.includes("Unsupported page"),
      ),
    )
    .toBe(true);
  expect(
    await popup.evaluate(() => document.querySelector("fieldset").disabled),
  ).toBe(true);
  await popup.close();
  await page.close();
});
test("capture the real popup design for documentation", async () => {
  const page = await open("light");
  await expect.poll(() => bg(page)).toBe("rgb(18, 18, 18)");
  await mkdir("docs", { recursive: true });
  await page.screenshot({ path: "docs/dark-page.png" });
  const popupTab = await app.context.newPage({
    viewport: { width: 380, height: 760 },
  });
  await page.bringToFront();
  await popupTab.goto(`chrome-extension://${app.id}/popup.html`);
  await expect(popupTab.locator("h2")).toHaveText("127.0.0.1");
  await expect(popupTab.locator("[role=status]")).toHaveText(
    "Dark Mode Active",
  );
  await popupTab.locator(".app").screenshot({ path: "docs/popup.png" });
  await popupTab.close();
  await page.close();
});

test("implicit white canvas is darkened and completely restored", async () => {
  const page = await open("implicit");
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(18, 18, 18)",
  );
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("p")).toHaveCSS("color", "rgb(234, 234, 234)");
  const popup = await app.popup(page);
  await setting(popup, { domain: "127.0.0.1", site: { mode: "original" } });
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator("html")).toHaveCSS("color-scheme", "normal");
  await popup.close();
  await page.close();
});
test("system dark Canvas is recognized without explicit opaque backgrounds", async () => {
  const page = await app.context.newPage();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(origin + "/system-dark.html");
  const popup = await app.popup(page);
  await expect
    .poll(async () => (await snapshot(popup)).detection.theme)
    .toBe("Dark");
  expect((await snapshot(popup)).active).toBe(false);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  await popup.close();
  await page.close();
});
