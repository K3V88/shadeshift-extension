import { detect } from "./detector";
import { Transformer } from "./transformer";
import { PageObserver } from "./observer";
import {
  domainFor,
  readPreferences,
  resolveOptions,
} from "../storage/preferences";
import type { Detection, PageReport, Preferences } from "../shared/types";
declare global {
  var __shadeShift: { dispose: () => void } | undefined;
}
function boot() {
  // Only the top document and same-origin descendant frames participate.
  let url = location.href;
  try {
    if (window.top && window.top !== window) {
      if (
        window.top.location.origin !== location.origin &&
        location.protocol !== "about:"
      )
        return;
      url = window.top.location.href;
    }
  } catch {
    return;
  }
  const domain = domainFor(url);
  if (!domain) return;
  globalThis.__shadeShift?.dispose();
  let preferences: Preferences;
  let transformer: Transformer | undefined;
  let disposed = false;
  let lastOptions = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let detection: Detection = {
    theme: "Unknown",
    confidence: 0,
    lightCoverage: 0,
    darkCoverage: 0,
    averageContrast: 0,
    prefersDark: false,
    reasons: ["Waiting for visible page content."],
  };
  function analyze() {
    if (disposed || !preferences) return;
    detection = transformer
      ? transformer.withOriginal(() => detect(document))
      : detect(document);
    apply();
  }
  function schedule() {
    if (!timer)
      timer = setTimeout(() => {
        timer = undefined;
        analyze();
      }, 160);
  }
  function apply() {
    const options = resolveOptions(preferences, domain!);
    const should =
      preferences.enabled &&
      !preferences.excluded.includes(domain!) &&
      options.mode !== "original" &&
      (options.mode === "dark" ||
        (detection.theme === "Light" && detection.confidence >= 0.72));
    if (should) {
      if (!transformer) {
        transformer = new Transformer(document, options);
        transformer.onShadow = (root) => observer.addShadow(root);
        transformer.enqueue(document.documentElement);
        lastOptions = JSON.stringify(options);
      } else if (lastOptions !== JSON.stringify(options)) {
        transformer.configure(options);
        lastOptions = JSON.stringify(options);
      }
    } else {
      transformer?.stop();
      transformer = undefined;
    }
  }
  function report(): PageReport {
    const options = resolveOptions(preferences, domain!);
    const disabled =
      !preferences.enabled ||
      preferences.excluded.includes(domain!) ||
      options.mode === "original";
    return {
      domain: domain!,
      detection,
      active: !!transformer,
      modifiedElements: transformer?.count || 0,
      processing: transformer?.busy || false,
      mode: options.mode,
      status: disabled
        ? "Disabled"
        : transformer
          ? "Dark Mode Active"
          : detection.theme === "Dark"
            ? "Not Needed"
            : "Uncertain",
    };
  }
  const receive = (
    message: { type?: string },
    _sender: chrome.runtime.MessageSender,
    respond: (value: unknown) => void,
  ) => {
    if (message.type === "page:get" && preferences) {
      respond(report());
    }
    return false;
  };
  const changed = (
    _changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local")
      void readPreferences().then((p) => {
        if (!disposed) {
          preferences = p;
          analyze();
        }
      });
  };
  const observer = new PageObserver(
    document,
    (roots) => {
      if (disposed) return;
      for (const root of roots) transformer?.enqueue(root);
      schedule();
    },
    (name) => name.startsWith("data-shadeshift-"),
  );
  const state = (event: Event) => {
    if (event.target instanceof Element) transformer?.enqueue(event.target);
  };
  const stateEvents = [
    "pointerover",
    "pointerout",
    "focusin",
    "focusout",
    "pointerdown",
    "pointerup",
  ];
  for (const e of stateEvents) document.addEventListener(e, state, true);
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", schedule);
  addEventListener("resize", schedule);
  addEventListener("popstate", schedule);
  addEventListener("hashchange", schedule);
  addEventListener("pageshow", schedule);
  document.addEventListener("load", schedule, true);
  const navigation = (window as Window & { navigation?: EventTarget })
    .navigation;
  navigation?.addEventListener("currententrychange", schedule);
  const ready = () => analyze();
  document.addEventListener("DOMContentLoaded", ready, { once: true });
  chrome.runtime.onMessage.addListener(receive);
  chrome.storage.onChanged.addListener(changed);
  void readPreferences()
    .then((p) => {
      if (disposed) return;
      preferences = p;
      requestAnimationFrame(analyze);
    })
    .catch(() => dispose());
  function dispose() {
    disposed = true;
    clearTimeout(timer);
    observer.stop();
    transformer?.stop();
    transformer = undefined;
    for (const e of stateEvents) document.removeEventListener(e, state, true);
    media.removeEventListener("change", schedule);
    removeEventListener("resize", schedule);
    removeEventListener("popstate", schedule);
    removeEventListener("hashchange", schedule);
    removeEventListener("pageshow", schedule);
    document.removeEventListener("load", schedule, true);
    document.removeEventListener("DOMContentLoaded", ready);
    navigation?.removeEventListener("currententrychange", schedule);
    chrome.runtime.onMessage.removeListener(receive);
    chrome.storage.onChanged.removeListener(changed);
  }
  globalThis.__shadeShift = { dispose };
}
boot();
