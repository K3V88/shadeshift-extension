import { it, expect } from "vitest";
import { mapBackground, paletteFor, adjust } from "../content/transformer";
import { DEFAULTS } from "../storage/preferences";
import {
  parseColor,
  luminance,
  ensureContrast,
  contrast,
} from "../content/colors";
it("maps primary and secondary bright surfaces to distinct dark shades", () => {
  expect(mapBackground(parseColor("#fff")!, DEFAULTS.defaults, true)).toEqual(
    parseColor("#121212"),
  );
  expect(mapBackground(parseColor("#fff")!, DEFAULTS.defaults)).toEqual(
    parseColor("#1e1e1e"),
  );
});
it("leaves transparent and already dark backgrounds intact", () => {
  for (const value of ["transparent", "#121212", "#000"]) {
    const c = parseColor(value)!;
    expect(mapBackground(c, DEFAULTS.defaults)).toEqual(c);
  }
});
it("keeps translucent surfaces translucent", () =>
  expect(
    mapBackground(parseColor("rgba(255,255,255,.4)")!, DEFAULTS.defaults).a,
  ).toBe(0.4));
it("darkens bright accents without removing their hue", () => {
  const mapped = mapBackground(parseColor("#ff8800")!, DEFAULTS.defaults);
  expect(mapped.r).toBeGreaterThan(mapped.g);
  expect(mapped.g).toBeGreaterThan(mapped.b);
  expect(luminance(mapped)).toBeLessThan(0.16);
});
it("ensures AA foreground contrast on converted backgrounds", () => {
  const bg = mapBackground(parseColor("#fff")!, DEFAULTS.defaults);
  expect(
    contrast(ensureContrast(parseColor("#444")!, bg), bg),
  ).toBeGreaterThanOrEqual(4.5);
});
it("applies brightness only to generated colors and accepts custom palettes", () => {
  const options = { ...DEFAULTS.defaults, brightness: 120 };
  expect(adjust(parseColor("#808080")!, options).r).toBeGreaterThan(128);
  const custom = {
    ...DEFAULTS.defaults,
    preset: "custom" as const,
    customPalette: {
      ...DEFAULTS.defaults.customPalette,
      background: "#102030",
    },
  };
  expect(paletteFor(custom).background).toBe("#102030");
});
