import type { Detection } from "../shared/types";
import {
  composite,
  contrast,
  luminance,
  parseColor,
  type Color,
} from "./colors";
export interface Sample {
  background: Color;
  foreground: Color;
  weight: number;
}
const white = { r: 255, g: 255, b: 255, a: 1 };
export function effectiveBackground(
  el: Element,
  transform?: (c: Color, el: Element) => Color,
): Color {
  const colors: Color[] = [];
  for (
    let node: Element | null = el;
    node;
    node =
      node.parentElement ||
      (node.getRootNode() instanceof ShadowRoot
        ? (node.getRootNode() as ShadowRoot).host
        : null)
  ) {
    const color = parseColor(
      getComputedStyle(node).backgroundColor,
      node.ownerDocument,
    );
    if (color) {
      colors.push(transform ? transform(color, node) : color);
      if (color.a >= 0.999) break;
    }
  }
  const scheme = getComputedStyle(el.ownerDocument.documentElement).colorScheme;
  const darkCanvas =
    scheme.split(/\s+/).includes("dark") &&
    (!scheme.split(/\s+/).includes("light") ||
      el.ownerDocument.defaultView?.matchMedia("(prefers-color-scheme: dark)")
        .matches);
  let bg = darkCanvas ? { r: 18, g: 18, b: 18, a: 1 } : white;
  for (let i = colors.length - 1; i >= 0; i--) bg = composite(colors[i], bg);
  return bg;
}
export function classify(
  samples: Sample[],
  prefersDark = false,
  themeHint = false,
): Detection {
  const total = samples.reduce((n, s) => n + s.weight, 0);
  let light = 0,
    dark = 0,
    ratio = 0;
  for (const s of samples) {
    const l = luminance(s.background);
    if (l > 0.45) light += s.weight;
    if (l < 0.16) dark += s.weight;
    ratio +=
      contrast(composite(s.foreground, s.background), s.background) * s.weight;
  }
  const l = total ? light / total : 0,
    d = total ? dark / total : 0;
  let theme: Detection["theme"] = "Unknown";
  if (samples.length >= 8 && total > 0) {
    if (l >= 0.58 && d < 0.25) theme = "Light";
    else if (d >= 0.65 && l < 0.2) theme = "Dark";
    else if (l >= 0.22 && d >= 0.22) theme = "Mixed";
  }
  const confidence =
    theme === "Unknown"
      ? 0
      : Math.min(
          0.99,
          0.55 +
            0.4 * (theme === "Mixed" ? Math.min(1, l + d) : Math.max(l, d)) +
            (theme === "Dark" && themeHint ? 0.04 : 0),
        );
  return {
    theme,
    confidence,
    lightCoverage: l,
    darkCoverage: d,
    averageContrast: total ? ratio / total : 0,
    prefersDark,
    reasons: [
      theme === "Light"
        ? "Most sampled visible surfaces are bright."
        : theme === "Dark"
          ? "Most sampled visible surfaces are already dark."
          : theme === "Mixed"
            ? "Substantial light and dark regions share the viewport."
            : "Not enough consistent visible color evidence.",
      ...(themeHint
        ? [
            "The site advertises a dark theme; measured colors still determine classification.",
          ]
        : []),
    ],
  };
}
export function detect(doc: Document): Detection {
  const view = doc.defaultView;
  if (!view || !doc.body) return classify([]);
  const samples: Sample[] = [];
  const width = view.innerWidth,
    height = view.innerHeight;
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 7; col++) {
      let el = doc.elementFromPoint(
        (width * (col + 0.5)) / 7,
        (height * (row + 0.5)) / 5,
      );
      if (!el) continue;
      while (el.shadowRoot) {
        const inner = el.shadowRoot.elementFromPoint(
          (width * (col + 0.5)) / 7,
          (height * (row + 0.5)) / 5,
        );
        if (!inner || inner === el) break;
        el = inner;
      }
      if (el.closest("img,video,canvas,svg,picture,iframe"))
        el =
          el.closest("img,video,canvas,svg,picture,iframe")?.parentElement ||
          el;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      const fg = parseColor(s.color, doc);
      if (fg)
        samples.push({
          background: effectiveBackground(el),
          foreground: fg,
          weight: 1,
        });
    }
  const root = doc.documentElement;
  const hint = /dark/i.test(
    root.className +
      " " +
      (root.getAttribute("data-theme") || "") +
      " " +
      getComputedStyle(root).colorScheme,
  );
  return classify(
    samples,
    view.matchMedia("(prefers-color-scheme: dark)").matches,
    hint,
  );
}
