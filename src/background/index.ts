import { DEFAULTS, domainFor, updatePreferences } from "../storage/preferences";
import type { SettingsUpdate } from "../shared/types";
let writes: Promise<unknown> = Promise.resolve();
chrome.runtime.onMessage.addListener(
  (message: SettingsUpdate, sender, respond) => {
    if (message?.type !== "settings:update") return false;
    if (
      sender.id !== chrome.runtime.id ||
      !sender.url?.startsWith(chrome.runtime.getURL(""))
    ) {
      respond({
        ok: false,
        error: "Settings can only be changed from ShadeShift.",
      });
      return false;
    }
    writes = writes
      .catch(() => {})
      .then(async () => {
        const stored = await chrome.storage.local.get("settings");
        const settings = updatePreferences(stored.settings, message);
        await chrome.storage.local.set({ settings });
        return settings;
      });
    void writes
      .then((settings) => respond({ ok: true, settings }))
      .catch(() =>
        respond({ ok: false, error: "Could not save preferences." }),
      );
    return true;
  },
);
chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    const stored = await chrome.storage.local.get("settings");
    if (!stored.settings)
      await chrome.storage.local.set({ settings: DEFAULTS });
    for (const tab of await chrome.tabs.query({})) {
      if (tab.id && tab.url && domainFor(tab.url))
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ["content.js"],
          });
        } catch {
          /* Chrome-protected or navigated tabs are left alone. */
        }
    }
  })().catch(() => {});
});
