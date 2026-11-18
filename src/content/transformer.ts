import type { Options, Palette } from "../shared/types";
import { PALETTES } from "../storage/preferences";
import {
  css,
  ensureContrast,
  luminance,
  mix,
  parseColor,
  saturation,
  type Color,
} from "./colors";
import { effectiveBackground } from "./detector";
const MEDIA =
  "img,video,canvas,svg,picture,iframe,object,embed,script,style,link,meta,noscript";
export function paletteFor(options: Options): Palette {
  return options.preset === "custom"
    ? options.customPalette
    : PALETTES[options.preset];
}
export function adjust(c: Color, options: Options): Color {
  const f = (n: number) =>
    Math.max(
      0,
      Math.min(
        255,
        ((((n - 128) * options.contrast) / 100 + 128) * options.brightness) /
          100,
      ),
    );
  return { ...c, r: f(c.r), g: f(c.g), b: f(c.b) };
}
export function mapBackground(c: Color, options: Options, main = false): Color {
  if (c.a < 0.01 || luminance(c) < 0.16) return c;
  const p = paletteFor(options);
  const target = parseColor(
    main ? p.background : luminance(c) > 0.65 ? p.surface : p.elevated,
  )!;
  const mapped = saturation(c) > 0.28 ? mix(c, target, 0.77) : target;
  return { ...adjust(mapped, options), a: c.a };
}
interface Sheet {
  root: Document | ShadowRoot;
  sheet: CSSStyleSheet;
}
interface Entry {
  id: number;
  rule: string;
}
export class Transformer {
  readonly attribute = "data-shadeshift-" + crypto.randomUUID().slice(0, 8);
  private sheets: Sheet[] = [];
  private entries = new Map<Element, Entry>();
  private roots: Element[] = [];
  private walkers: TreeWalker[] = [];
  private frame = 0;
  private nextId = 0;
  private disposed = false;
  onShadow?: (root: ShadowRoot) => void;
  constructor(
    private doc: Document,
    private options: Options,
  ) {
    this.addRoot(doc);
  }
  get count() {
    return this.entries.size;
  }
  get busy() {
    return !!(this.frame || this.roots.length || this.walkers.length);
  }
  private addRoot(root: Document | ShadowRoot) {
    if (this.sheets.some((r) => r.root === root)) return;
    const sheet = new CSSStyleSheet();
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    this.sheets.push({ root, sheet });
  }
  withOriginal<T>(fn: () => T): T {
    for (const { sheet } of this.sheets) sheet.disabled = true;
    try {
      return fn();
    } finally {
      for (const { sheet } of this.sheets) sheet.disabled = false;
    }
  }
  configure(options: Options) {
    this.options = options;
    this.enqueue(this.doc.documentElement);
  }
  enqueue(root: Element) {
    if (this.disposed || root.matches(MEDIA) || !root.isConnected) return;
    if (this.roots.some((queued) => queued.contains(root))) return;
    this.roots = this.roots.filter((queued) => !root.contains(queued));
    this.roots.push(root);
    this.schedule();
  }
  private schedule() {
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.batch();
      });
  }
  private batch() {
    if (this.disposed) return;
    const items: Element[] = [];
    while (items.length < 180 && (this.roots.length || this.walkers.length)) {
      if (this.roots.length) {
        const root = this.roots.shift()!;
        if (!root.isConnected) continue;
        items.push(root);
        this.walkers.push(
          this.doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
            acceptNode: (n) =>
              (n as Element).matches(MEDIA)
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT,
          }),
        );
      } else {
        const walker = this.walkers[0];
        const node = walker.nextNode() as Element | null;
        if (!node) {
          this.walkers.shift();
          continue;
        }
        items.push(node);
      }
    }
    const results = this.withOriginal(() =>
      items
        .filter((el) => el.isConnected)
        .map((el) => {
          if (el.shadowRoot) {
            this.addRoot(el.shadowRoot);
            this.onShadow?.(el.shadowRoot);
            for (const child of el.shadowRoot.children) this.enqueue(child);
          }
          const s = getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden")
            return { el, rule: "" };
          const declarations: string[] = [];
          if (el === this.doc.documentElement)
            declarations.push("color-scheme:dark");
          const bg = parseColor(s.backgroundColor, this.doc);
          if (bg && bg.a < 0.01 && el === this.doc.documentElement)
            declarations.push(
              "background-color:" +
                css(
                  adjust(
                    parseColor(paletteFor(this.options).background)!,
                    this.options,
                  ),
                ),
            );
          if (bg && bg.a > 0.01) {
            const mapped = mapBackground(
              bg,
              this.options,
              el === this.doc.body || el === this.doc.documentElement,
            );
            if (css(bg) !== css(mapped))
              declarations.push("background-color:" + css(mapped));
          }
          const targetBg = effectiveBackground(el, (c, node) =>
            c.a < 0.01 && node === this.doc.documentElement
              ? adjust(
                  parseColor(paletteFor(this.options).background)!,
                  this.options,
                )
              : mapBackground(
                  c,
                  this.options,
                  node === this.doc.body || node === this.doc.documentElement,
                ),
          );
          const foreground = parseColor(s.color, this.doc);
          if (foreground && foreground.a > 0.01) {
            const palette = paletteFor(this.options);
            let color = foreground;
            if (saturation(color) < 0.18) {
              color = adjust(
                parseColor(
                  luminance(color) < 0.08 ? palette.text : palette.secondary,
                )!,
                this.options,
              );
            }
            const result = ensureContrast(color, targetBg);
            if (css(result) !== css(foreground))
              declarations.push("color:" + css(result));
          }
          for (const property of [
            "border-top-color",
            "border-right-color",
            "border-bottom-color",
            "border-left-color",
            "outline-color",
          ]) {
            const value = parseColor(s.getPropertyValue(property), this.doc);
            if (value && value.a > 0.01 && luminance(value) > 0.18) {
              const mapped =
                saturation(value) > 0.25
                  ? ensureContrast(value, targetBg, 3)
                  : adjust(
                      parseColor(paletteFor(this.options).border)!,
                      this.options,
                    );
              declarations.push(
                property + ":" + css({ ...mapped, a: value.a }),
              );
            }
          }
          const image = s.backgroundImage;
          if (
            image !== "none" &&
            !/url\(/i.test(image) &&
            /gradient\(/i.test(image)
          ) {
            const transformed = image.replace(
              /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[\da-f]{3,8}\b|\bwhite\b|\bblack\b/gi,
              (token) => {
                const c = parseColor(token, this.doc);
                return c ? css(mapBackground(c, this.options)) : token;
              },
            );
            if (transformed !== image)
              declarations.push("background-image:" + transformed);
          }
          return {
            el,
            rule: declarations.map((d) => d + "!important").join(";"),
          };
        }),
    );
    let dirty = false;
    for (const { el, rule } of results) {
      const old = this.entries.get(el);
      if (!rule) {
        if (old) {
          this.entries.delete(el);
          el.removeAttribute(this.attribute);
          dirty = true;
        }
        continue;
      }
      if (
        old?.rule === rule &&
        el.getAttribute(this.attribute) === String(old.id)
      )
        continue;
      const id = old?.id ?? ++this.nextId;
      this.entries.set(el, { id, rule });
      if (el.getAttribute(this.attribute) !== String(id))
        el.setAttribute(this.attribute, String(id));
      dirty = true;
    }
    if (this.prune()) dirty = true;
    if (dirty) this.render();
    if (this.roots.length || this.walkers.length) this.schedule();
  }
  prune() {
    let dirty = false;
    for (const el of this.entries.keys())
      if (!el.isConnected) {
        this.entries.delete(el);
        el.removeAttribute(this.attribute);
        dirty = true;
      }
    this.sheets = this.sheets.filter(({ root, sheet }) => {
      if (root instanceof Document || root.host.isConnected) return true;
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
        (s) => s !== sheet,
      );
      return false;
    });
    return dirty;
  }
  private render() {
    const groups = new Map<Document | ShadowRoot, string[]>();
    for (const [el, { id, rule }] of this.entries) {
      const root = el.getRootNode();
      if (root instanceof Document || root instanceof ShadowRoot) {
        const list = groups.get(root) || [];
        list.push(`[${this.attribute}="${id}"]{${rule}}`);
        groups.set(root, list);
      }
    }
    for (const { root, sheet } of this.sheets)
      sheet.replaceSync(
        (groups.get(root) || []).join("\n") +
          `\n[${this.attribute}]:focus-visible{outline:2px solid #A5A2FF!important;outline-offset:2px!important}[${this.attribute}]::selection{background:#6056A8!important;color:#FFFFFF!important}`,
      );
  }
  stop() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.roots = [];
    this.walkers = [];
    for (const el of this.entries.keys()) el.removeAttribute(this.attribute);
    this.entries.clear();
    for (const { root, sheet } of this.sheets)
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
        (s) => s !== sheet,
      );
    this.sheets = [];
  }
}
