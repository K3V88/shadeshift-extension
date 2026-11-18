import type {
  Mode,
  Options,
  Palette,
  Preferences,
  SettingsUpdate,
} from "../shared/types";
export const PALETTES: Record<string, Palette> = {
  neutral: {
    background: "#121212",
    surface: "#1E1E1E",
    elevated: "#252525",
    text: "#EAEAEA",
    secondary: "#B8B8B8",
    border: "#383838",
  },
  midnight: {
    background: "#10131F",
    surface: "#191E2D",
    elevated: "#242B3C",
    text: "#EBEEFA",
    secondary: "#BAC2D9",
    border: "#3B455E",
  },
  warm: {
    background: "#191512",
    surface: "#241E19",
    elevated: "#302720",
    text: "#F0E9DF",
    secondary: "#C5B7A8",
    border: "#504338",
  },
};
export const DEFAULTS: Preferences = {
  version: 1,
  enabled: true,
  defaults: {
    mode: "auto",
    brightness: 100,
    contrast: 100,
    preset: "neutral",
    customPalette: { ...PALETTES.neutral },
  },
  sites: {},
  excluded: [],
};
export function domainFor(url: string): string | null {
  try {
    const u = new URL(url);
    if (
      !/^https?:$/.test(u.protocol) ||
      u.hostname === "chromewebstore.google.com" ||
      (u.hostname === "chrome.google.com" && u.pathname.startsWith("/webstore"))
    )
      return null;
    return u.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;
export function cleanOptions(
  value: unknown,
  base: Options = DEFAULTS.defaults,
): Options {
  const v = object(value);
  const palette = object(v.customPalette);
  const customPalette = { ...base.customPalette };
  for (const k of Object.keys(customPalette) as (keyof Palette)[])
    if (
      typeof palette[k] === "string" &&
      /^#[0-9a-f]{6}$/i.test(palette[k] as string)
    )
      customPalette[k] = palette[k] as string;
  return {
    mode: ["auto", "dark", "original"].includes(String(v.mode))
      ? (v.mode as Mode)
      : base.mode,
    brightness: clamp(v.brightness, 75, 125, base.brightness),
    contrast: clamp(v.contrast, 80, 130, base.contrast),
    preset: ["neutral", "midnight", "warm", "custom"].includes(String(v.preset))
      ? (v.preset as Options["preset"])
      : base.preset,
    customPalette,
  };
}
export function normalize(value: unknown): Preferences {
  const v = object(value);
  const defaults = cleanOptions(v.defaults);
  const sites: Preferences["sites"] = Object.create(null);
  for (const [domain, override] of Object.entries(object(v.sites))) {
    if (domainFor("https://" + domain) !== domain) continue;
    const raw = object(override);
    const cleaned = cleanOptions(raw, defaults);
    sites[domain] = Object.fromEntries(
      Object.keys(raw)
        .filter((k) => k in cleaned)
        .map((k) => [k, cleaned[k as keyof Options]]),
    );
  }
  return {
    version: 1,
    enabled: typeof v.enabled === "boolean" ? v.enabled : true,
    defaults,
    sites,
    excluded: Array.isArray(v.excluded)
      ? [
          ...new Set(
            v.excluded.filter(
              (d): d is string =>
                typeof d === "string" && domainFor("https://" + d) === d,
            ),
          ),
        ]
      : [],
  };
}
export function resolveOptions(prefs: Preferences, domain: string): Options {
  return cleanOptions(prefs.sites[domain], prefs.defaults);
}
export function updatePreferences(
  value: unknown,
  update: SettingsUpdate,
): Preferences {
  const p = normalize(value);
  if (typeof update.global === "boolean") p.enabled = update.global;
  if (update.defaults) p.defaults = cleanOptions(update.defaults, p.defaults);
  if (
    update.domain &&
    domainFor("https://" + update.domain) === update.domain
  ) {
    const d = update.domain;
    if (update.resetSite) delete p.sites[d];
    if (update.site) {
      const cleaned = cleanOptions(update.site, resolveOptions(p, d));
      const old = p.sites[d] || {};
      p.sites[d] = {
        ...old,
        ...Object.fromEntries(
          Object.keys(update.site)
            .filter((k) => k in cleaned)
            .map((k) => [k, cleaned[k as keyof Options]]),
        ),
      };
    }
    if (typeof update.excluded === "boolean")
      p.excluded = update.excluded
        ? [...new Set([...p.excluded, d])]
        : p.excluded.filter((x) => x !== d);
  }
  return normalize(p);
}
export async function readPreferences(): Promise<Preferences> {
  const result = await chrome.storage.local.get("settings");
  return normalize(result.settings);
}
