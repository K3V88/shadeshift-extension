import { describe, it, expect } from "vitest";
import {
  parseColor,
  luminance,
  contrast,
  composite,
  ensureContrast,
  saturation,
} from "../content/colors";
const black = parseColor("#000")!,
  white = parseColor("#fff")!;
describe("local color math", () => {
  it("uses WCAG relative luminance", () => {
    expect(luminance(black)).toBe(0);
    expect(luminance(white)).toBe(1);
    expect(luminance(parseColor("#ff0000")!)).toBeCloseTo(0.2126);
    expect(luminance(parseColor("#777")!)).toBeCloseTo(0.18447, 4);
  });
  it("calculates WCAG contrast symmetrically", () => {
    expect(contrast(black, white)).toBe(21);
    expect(contrast(white, black)).toBe(21);
    expect(contrast(white, white)).toBe(1);
  });
  it.each([
    ["#abc", { r: 170, g: 187, b: 204, a: 1 }],
    ["#11223380", { r: 17, g: 34, b: 51, a: 128 / 255 }],
    ["rgb(10, 20, 30)", { r: 10, g: 20, b: 30, a: 1 }],
    ["rgb(10 20 30 / 50%)", { r: 10, g: 20, b: 30, a: 0.5 }],
    ["transparent", { r: 0, g: 0, b: 0, a: 0 }],
  ])("parses %s", (input, value) =>
    expect(parseColor(input as string)).toEqual(value),
  );
  it("parses percentage RGB", () => {
    expect(parseColor("rgb(100% 0% 50%)")!.r).toBeCloseTo(255);
    expect(parseColor("rgb(100% 0% 50%)")!.b).toBeCloseTo(127.5);
  });
  it.each(["#12", "#12345", "rgb(no 0 0)", "not-a-color"])(
    "rejects invalid color %s",
    (s) => expect(parseColor(s)).toBeNull(),
  );
  it("composites transparent layers", () => {
    const c = composite({ r: 0, g: 0, b: 0, a: 0.5 }, white);
    expect(c.r).toBe(127.5);
    expect(c.a).toBe(1);
    expect(composite({ ...black, a: 0 }, white)).toEqual(white);
  });
  it("raises text contrast to AA", () => {
    const bg = parseColor("#1e1e1e")!;
    const result = ensureContrast(parseColor("#444")!, bg);
    expect(contrast(result, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps already accessible brand text", () => {
    const accent = parseColor("#b69aff")!;
    expect(ensureContrast(accent, black)).toEqual(accent);
    expect(saturation(accent)).toBeGreaterThan(0.2);
  });
});
