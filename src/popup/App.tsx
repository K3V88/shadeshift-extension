import { useEffect, useState } from "react";
import {
  DEFAULTS,
  domainFor,
  PALETTES,
  readPreferences,
  resolveOptions,
} from "../storage/preferences";
import type {
  Mode,
  Options,
  PageReport,
  Preferences,
  SettingsUpdate,
} from "../shared/types";
function Switch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}
export default function App() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS),
    [domain, setDomain] = useState<string | null>(null),
    [tab, setTab] = useState<number>(),
    [page, setPage] = useState<PageReport>(),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const p = await readPreferences();
        const [current] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!alive) return;
        setPrefs(p);
        setDomain(current?.url ? domainFor(current.url) : null);
        setTab(current?.id);
        setReady(true);
      } catch {
        if (alive) setError("Could not load ShadeShift. Reopen the popup.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!tab || !domain) return;
    let alive = true;
    const refresh = () => {
      void chrome.tabs
        .sendMessage(tab, { type: "page:get" }, { frameId: 0 })
        .then((r: PageReport) => {
          if (alive) setPage(r);
        })
        .catch(() => {
          if (alive) {
            setPage(undefined);
            setError("Refresh this tab once to connect ShadeShift.");
          }
        });
    };
    refresh();
    const timer = setInterval(refresh, 700);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [tab, domain]);
  const options = domain ? resolveOptions(prefs, domain) : prefs.defaults;
  const excluded = !!domain && prefs.excluded.includes(domain);
  async function save(update: Omit<SettingsUpdate, "type">) {
    setSaving(true);
    setError("");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "settings:update",
        ...update,
      });
      if (!response?.ok)
        throw new Error(response?.error || "Could not save settings.");
      setPrefs(response.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  const site = (patch: Partial<Options>) =>
    void save(domain ? { domain, site: patch } : { defaults: patch });
  const status =
    !prefs.enabled || excluded || options.mode === "original"
      ? "Disabled"
      : page?.status || "Connecting";
  return (
    <div className="app">
      <header>
        <img src="icons/icon48.png" width="38" height="38" alt="" />
        <div>
          <h1>ShadeShift</h1>
          <p>Intelligent Auto Dark Mode</p>
        </div>
        <span className="version">1.0</span>
      </header>
      <main>
        <div className="global">
          <Switch
            label="Enable ShadeShift"
            checked={prefs.enabled}
            disabled={!ready}
            onChange={(v) => void save({ global: v })}
          />
        </div>
        <section className="site-card">
          <div className="eyebrow">CURRENT WEBSITE</div>
          <h2>{domain || "Unsupported page"}</h2>
          <div className="status-line">
            <span
              className={
                "dot " +
                (page?.active && status === "Dark Mode Active" ? "active" : "")
              }
            />
            <span role="status">{domain ? status : "Unavailable here"}</span>
            <span className="badge" data-testid="theme">
              {page?.detection.theme || "Unknown"}
            </span>
          </div>
          {page && (
            <p className="confidence">
              {Math.round(page.detection.confidence * 100)}% detection
              confidence · {page.modifiedElements} elements adjusted
            </p>
          )}
          {!domain && (
            <p className="note">
              Open an HTTP or HTTPS website. Chrome settings, the Web Store and
              local files cannot be themed.
            </p>
          )}
        </section>
        <fieldset disabled={!ready || !domain}>
          <legend className="sr-only">Website preferences</legend>
          <Switch
            label="Enable on this website"
            checked={!excluded}
            onChange={(v) => void save({ domain: domain!, excluded: !v })}
          />
          <div className="section-label">
            <span>APPEARANCE</span>
            {domain && prefs.sites[domain] && (
              <button
                className="reset"
                onClick={() => void save({ domain, resetSite: true })}
              >
                Use global settings
              </button>
            )}
          </div>
          <div
            className="mode-picker"
            role="group"
            aria-label="Website appearance"
          >
            {(
              [
                ["auto", "Automatic"],
                ["dark", "Force Dark Mode"],
                ["original", "Force Original Appearance"],
              ] as [Mode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                aria-pressed={options.mode === mode}
                title={label}
                aria-label={label}
                onClick={() => site({ mode })}
              >
                {mode === "auto"
                  ? "Auto"
                  : mode === "dark"
                    ? "Dark"
                    : "Original"}
              </button>
            ))}
          </div>
          <Switch
            label="Automatic detection"
            checked={options.mode === "auto"}
            onChange={(v) => site({ mode: v ? "auto" : "dark" })}
          />
          <label className="slider-label" htmlFor="brightness">
            <span>Brightness</span>
            <output>{options.brightness}%</output>
          </label>
          <input
            id="brightness"
            type="range"
            min="75"
            max="125"
            value={options.brightness}
            onChange={(e) => site({ brightness: Number(e.target.value) })}
          />
          <label className="slider-label" htmlFor="contrast">
            <span>Contrast</span>
            <output>{options.contrast}%</output>
          </label>
          <input
            id="contrast"
            type="range"
            min="80"
            max="130"
            value={options.contrast}
            onChange={(e) => site({ contrast: Number(e.target.value) })}
          />
          <label className="select-label">
            Color preset
            <select
              value={options.preset}
              onChange={(e) =>
                site({ preset: e.target.value as Options["preset"] })
              }
            >
              <option value="neutral">Neutral · charcoal</option>
              <option value="midnight">Midnight · blue</option>
              <option value="warm">Warm · sepia</option>
              <option value="custom">Custom palette</option>
            </select>
          </label>
          {options.preset === "custom" && (
            <div className="color-grid">
              {Object.entries(options.customPalette).map(([key, value]) => (
                <label key={key}>
                  {key}
                  <input
                    type="color"
                    aria-label={key + " color"}
                    value={value}
                    onChange={(e) =>
                      site({
                        customPalette: {
                          ...options.customPalette,
                          [key]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <details>
          <summary>Global default settings</summary>
          <label className="select-label">
            Default appearance
            <select
              aria-label="Global default appearance"
              value={prefs.defaults.mode}
              onChange={(e) =>
                void save({ defaults: { mode: e.target.value as Mode } })
              }
            >
              <option value="auto">Automatic</option>
              <option value="dark">Always Dark</option>
              <option value="original">Original</option>
            </select>
          </label>
          <label className="select-label">
            Default preset
            <select
              aria-label="Global default preset"
              value={prefs.defaults.preset}
              onChange={(e) =>
                void save({
                  defaults: {
                    preset: e.target.value as Options["preset"],
                    customPalette: PALETTES.neutral,
                  },
                })
              }
            >
              <option value="neutral">Neutral</option>
              <option value="midnight">Midnight</option>
              <option value="warm">Warm</option>
            </select>
          </label>
          <button
            className="wide-button"
            onClick={() =>
              void save({
                defaults: {
                  brightness: options.brightness,
                  contrast: options.contrast,
                  preset: options.preset,
                  customPalette: options.customPalette,
                },
              })
            }
          >
            Use these colors and sliders as defaults
          </button>
        </details>
        <p className="note">
          Auto preserves existing dark themes. Mixed or uncertain pages stay
          original. Images are never inverted.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="save-status" aria-live="polite">
          {saving ? "Saving…" : "Preferences saved locally"}
        </div>
      </main>
      <footer>
        <span className="privacy-dot" />
        Private by design. On your device.
      </footer>
    </div>
  );
}
