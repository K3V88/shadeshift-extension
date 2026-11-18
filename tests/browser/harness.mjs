import { chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
export async function launch(profile) {
  const temporary = !profile;
  profile = profile || (await mkdtemp(join(tmpdir(), "shadeshift-")));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: process.env.HEADED !== "1",
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", {
    path: resolve("dist"),
  });
  for (let i = 0; i < 100; i++) {
    const { extensions } = await cdp.send("Extensions.getExtensions");
    if (extensions.some((e) => e.id === id && e.enabled)) break;
    await new Promise((r) => setTimeout(r, 30));
  }
  async function popup(source) {
    await source.bringToFront();
    const { targetInfos } = await cdp.send("Target.getTargets", {
      filter: [{ type: "tab", exclude: false }, { exclude: true }],
    });
    const tab = targetInfos.find((t) => t.url === source.url());
    if (!tab) throw new Error("Missing tab target");
    await cdp.send("Extensions.triggerAction", { id, targetId: tab.targetId });
    let target;
    for (let i = 0; i < 100; i++) {
      const targets = await cdp.send("Target.getTargets");
      target = targets.targetInfos.find(
        (t) => t.url === `chrome-extension://${id}/popup.html`,
      );
      if (target) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    if (!target) throw new Error("Popup did not open");
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: false,
    });
    let sequence = 0;
    const pending = new Map();
    const receive = (e) => {
      if (e.sessionId !== sessionId) return;
      const reply = JSON.parse(e.message);
      const task = pending.get(reply.id);
      if (task) {
        clearTimeout(task.timer);
        pending.delete(reply.id);
        if (reply.error) task.reject(new Error(reply.error.message));
        else task.resolve(reply.result);
      }
    };
    cdp.on("Target.receivedMessageFromTarget", receive);
    async function evaluate(fn, arg) {
      const requestId = ++sequence;
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("Popup evaluation timed out"));
        }, 10000);
        pending.set(requestId, { resolve, reject, timer });
        cdp
          .send("Target.sendMessageToTarget", {
            sessionId,
            message: JSON.stringify({
              id: requestId,
              method: "Runtime.evaluate",
              params: {
                expression: `(${fn.toString()})(${JSON.stringify(arg) ?? "undefined"})`,
                awaitPromise: true,
                returnByValue: true,
              },
            }),
          })
          .catch(reject);
      });
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.exception?.description ||
            result.exceptionDetails.text,
        );
      return result.result.value;
    }
    for (let i = 0; i < 100; i++) {
      if (
        await evaluate(() => {
          const control = document.querySelector("[role=switch]");
          return !!control && !control.disabled;
        })
      )
        break;
      await new Promise((r) => setTimeout(r, 30));
    }
    return {
      evaluate,
      async close() {
        cdp.off("Target.receivedMessageFromTarget", receive);
        await cdp
          .send("Target.closeTarget", { targetId: target.targetId })
          .catch(() => {});
      },
    };
  }
  return {
    context,
    cdp,
    id,
    profile,
    popup,
    async close() {
      await context.close();
      if (temporary) await rm(profile, { recursive: true, force: true });
    },
  };
}
