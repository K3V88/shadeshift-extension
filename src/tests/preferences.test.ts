import { it, expect, vi, afterEach } from "vitest";
import {
  DEFAULTS,
  domainFor,
  normalize,
  resolveOptions,
  updatePreferences,
  readPreferences,
} from "../storage/preferences";
afterEach(() => vi.unstubAllGlobals());
it("normalizes HTTP domains without merging unrelated subdomains", () => {
  expect(domainFor("https://WWW.Example.com:8080/a")).toBe("www.example.com");
  expect(domainFor("https://news.example.com")).toBe("news.example.com");
  expect(domainFor("https://example.com./a")).toBe("example.com");
});
it.each([
  "chrome://settings",
  "file:///a.html",
  "https://chromewebstore.google.com/detail/x",
  "https://chrome.google.com/webstore/detail/x",
  "javascript:alert(1)",
])("rejects unsupported URL %s", (url) => expect(domainFor(url)).toBeNull());
it("validates stored values and clamps sliders", () => {
  const p = normalize({
    defaults: {
      brightness: 500,
      contrast: -5,
      preset: "evil",
      mode: "bad",
      customPalette: { text: "javascript:alert(1)" },
    },
  });
  expect(p.defaults.brightness).toBe(125);
  expect(p.defaults.contrast).toBe(80);
  expect(p.defaults.preset).toBe("neutral");
  expect(p.defaults.customPalette.text).toBe("#EAEAEA");
});
it("keeps site overrides partial so global changes are inherited", () => {
  let p = updatePreferences(DEFAULTS, {
    type: "settings:update",
    domain: "example.com",
    site: { mode: "original" },
  });
  p = updatePreferences(p, {
    type: "settings:update",
    defaults: { brightness: 112 },
  });
  expect(resolveOptions(p, "example.com").mode).toBe("original");
  expect(resolveOptions(p, "example.com").brightness).toBe(112);
  expect(resolveOptions(p, "other.com").mode).toBe("auto");
});
it("persists and removes site overrides and exclusions", () => {
  let p = updatePreferences(DEFAULTS, {
    type: "settings:update",
    domain: "example.com",
    site: { mode: "dark" },
    excluded: true,
  });
  expect(p.excluded).toEqual(["example.com"]);
  p = updatePreferences(p, {
    type: "settings:update",
    domain: "example.com",
    resetSite: true,
    excluded: false,
  });
  expect(resolveOptions(p, "example.com").mode).toBe("auto");
  expect(p.excluded).toEqual([]);
});
it("reads persisted preferences rather than cached defaults", async () => {
  const settings = updatePreferences(DEFAULTS, {
    type: "settings:update",
    global: false,
    domain: "example.com",
    site: { brightness: 90 },
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => ({
          settings: JSON.parse(JSON.stringify(settings)),
        })),
      },
    },
  });
  expect((await readPreferences()).enabled).toBe(false);
  expect(
    resolveOptions(await readPreferences(), "example.com").brightness,
  ).toBe(90);
});
