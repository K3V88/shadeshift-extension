export type Mode = "auto" | "dark" | "original";
export type Theme = "Light" | "Dark" | "Mixed" | "Unknown";
export type Preset = "neutral" | "midnight" | "warm" | "custom";
export interface Palette {
  background: string;
  surface: string;
  elevated: string;
  text: string;
  secondary: string;
  border: string;
}
export interface Options {
  mode: Mode;
  brightness: number;
  contrast: number;
  preset: Preset;
  customPalette: Palette;
}
export interface Preferences {
  version: 1;
  enabled: boolean;
  defaults: Options;
  sites: Record<string, Partial<Options>>;
  excluded: string[];
}
export interface Detection {
  theme: Theme;
  confidence: number;
  lightCoverage: number;
  darkCoverage: number;
  averageContrast: number;
  prefersDark: boolean;
  reasons: string[];
}
export interface PageReport {
  domain: string;
  detection: Detection;
  active: boolean;
  modifiedElements: number;
  processing: boolean;
  mode: Mode;
  status: "Dark Mode Active" | "Disabled" | "Not Needed" | "Uncertain";
}
export interface SettingsUpdate {
  type: "settings:update";
  domain?: string;
  global?: boolean;
  defaults?: Partial<Options>;
  site?: Partial<Options>;
  excluded?: boolean;
  resetSite?: boolean;
}
