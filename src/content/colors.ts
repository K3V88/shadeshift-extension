export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}
const unit = (v: number) => Math.max(0, Math.min(1, v));
export function parseColor(
  input: string,
  doc: Document | undefined = typeof document === "undefined"
    ? undefined
    : document,
): Color | null {
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const names: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    blue: "#0000ff",
    green: "#008000",
    gray: "#808080",
    grey: "#808080",
    rebeccapurple: "#663399",
  };
  if (names[s]) return parseColor(names[s], doc);
  if (/^#[0-9a-f]{3,8}$/.test(s)) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1,
    };
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const values = parts.map((p, i) => {
      const n = Number(p.replace("%", ""));
      return p.endsWith("%") ? n * (i === 3 ? 0.01 : 2.55) : n;
    });
    if (values.some((v) => !Number.isFinite(v))) return null;
    return {
      r: Math.max(0, Math.min(255, values[0])),
      g: Math.max(0, Math.min(255, values[1])),
      b: Math.max(0, Math.min(255, values[2])),
      a: unit(values[3] ?? 1),
    };
  }
  if (doc && typeof CSS !== "undefined" && CSS.supports("color", s)) {
    const canvas = doc.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    }
  }
  return null;
}
export function luminance(c: Color): number {
  const linear = (n: number) => {
    const s = n / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}
export function contrast(a: Color, b: Color): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function composite(fg: Color, bg: Color): Color {
  const a = fg.a + bg.a * (1 - fg.a);
  if (!a) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  };
}
export function mix(a: Color, b: Color, t: number): Color {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a,
  };
}
export function css(c: Color): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Number(c.a.toFixed(3))})`;
}
export function saturation(c: Color): number {
  const max = Math.max(c.r, c.g, c.b),
    min = Math.min(c.r, c.g, c.b);
  return max === 0 ? 0 : (max - min) / max;
}
export function ensureContrast(color: Color, bg: Color, target = 4.5): Color {
  if (contrast(composite(color, bg), bg) >= target) return color;
  const white = { r: 255, g: 255, b: 255, a: 1 },
    black = { r: 0, g: 0, b: 0, a: 1 };
  const end = contrast(white, bg) > contrast(black, bg) ? white : black;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (
      contrast(composite(mix({ ...color, a: 1 }, end, mid), bg), bg) >= target
    )
      hi = mid;
    else lo = mid;
  }
  return mix({ ...color, a: 1 }, end, hi);
}
