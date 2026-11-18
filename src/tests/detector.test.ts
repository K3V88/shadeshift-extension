import { it, expect } from "vitest";
import { classify, type Sample } from "../content/detector";
import { parseColor, composite } from "../content/colors";
const sample = (background: string, weight = 1): Sample => ({
  background: parseColor(background)!,
  foreground: parseColor(background === "#fff" ? "#000" : "#eee")!,
  weight,
});
it("classifies a white viewport with high confidence", () => {
  const d = classify(Array.from({ length: 35 }, () => sample("#fff")));
  expect(d.theme).toBe("Light");
  expect(d.confidence).toBeGreaterThan(0.72);
});
it("preserves predominantly dark websites even with small bright elements", () => {
  const d = classify(
    [
      ...Array.from({ length: 8 }, () => sample("#121212", 100)),
      sample("#fff", 1),
    ],
    true,
    true,
  );
  expect(d.theme).toBe("Dark");
  expect(d.darkCoverage).toBeGreaterThan(0.99);
});
it("recognizes mixed layouts without aggressively converting them", () =>
  expect(
    classify([
      ...Array.from({ length: 18 }, () => sample("#fff")),
      ...Array.from({ length: 17 }, () => sample("#121212")),
    ]).theme,
  ).toBe("Mixed"));
it("returns unknown for sparse or medium-gray evidence", () => {
  expect(classify([sample("#fff")]).theme).toBe("Unknown");
  expect(classify(Array.from({ length: 35 }, () => sample("#999"))).theme).toBe(
    "Unknown",
  );
});
it("does not let a dark class override measured light surfaces", () =>
  expect(
    classify(
      Array.from({ length: 35 }, () => sample("#fff")),
      true,
      true,
    ).theme,
  ).toBe("Light"));
it("transparent white over a dark canvas remains dark", () => {
  const color = composite(
    { ...parseColor("#fff")!, a: 0.05 },
    parseColor("#121212")!,
  );
  expect(
    classify(
      Array.from({ length: 35 }, () => ({
        ...sample("#121212"),
        background: color,
      })),
    ).theme,
  ).toBe("Dark");
});
