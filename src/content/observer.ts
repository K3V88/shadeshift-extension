export class PageObserver {
  private observer: MutationObserver;
  private roots = new Set<ShadowRoot>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private doc: Document,
    private changed: (roots: Element[]) => void,
    private ignored: (name: string) => boolean,
  ) {
    this.observer = new MutationObserver((records) => {
      const roots = new Set<Element>();
      for (const r of records) {
        if (r.type === "attributes" && this.ignored(r.attributeName || ""))
          continue;
        if (r.type === "attributes" && r.target instanceof Element)
          roots.add(r.target);
        for (const node of r.addedNodes)
          if (node instanceof Element) roots.add(node);
        if (r.removedNodes.length && r.target instanceof Element)
          roots.add(r.target);
      }
      if (roots.size) {
        this.pending.push(...roots);
        if (!this.timer)
          this.timer = setTimeout(() => {
            this.timer = undefined;
            const values = [...new Set(this.pending)];
            this.pending = [];
            this.changed(values.filter((e) => e.isConnected));
            this.prune();
          }, 100);
      }
    });
    this.observe(doc);
  }
  private pending: Element[] = [];
  private observe(root: Document | ShadowRoot) {
    this.observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: undefined,
    });
  }
  addShadow(root: ShadowRoot) {
    if (this.roots.has(root)) return;
    this.roots.add(root);
    this.observe(root);
  }
  private prune() {
    if ([...this.roots].some((r) => !r.host.isConnected)) {
      this.observer.disconnect();
      this.observe(this.doc);
      for (const root of this.roots) {
        if (root.host.isConnected) this.observe(root);
        else this.roots.delete(root);
      }
    }
  }
  stop() {
    clearTimeout(this.timer);
    this.pending = [];
    this.observer.disconnect();
    this.roots.clear();
  }
}
