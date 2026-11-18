# Validation

Validated on 18 November 2026 with Node 25.2.1, Vite 8.3.8, Vitest 4.1.12, and the installed Playwright Chromium build. Node 24 LTS is recommended for development.

| Check                                                | Result                       |
| ---------------------------------------------------- | ---------------------------- |
| TypeScript                                           | Pass                         |
| ESLint                                               | Pass                         |
| Vitest                                               | 37 tests pass                |
| Chromium extension integration                       | 14 tests pass                |
| Vite production build                                | Pass                         |
| Manifest, bundled entry points and PNG dimensions    | Pass                         |
| Production dependency audit (`npm audit --omit=dev`) | 0 vulnerabilities            |
| Existing OpenArticle workspace                       | Unchanged by ShadeShift work |

Browser coverage includes the actual toolbar popup and unchanged production manifest, light/native-dark/mixed/transparent pages, an implicit white browser canvas, native system-dark canvas, form and border colors, preserved media, basic gradients, modern CSS color formats, dynamic content, SPA changes, an open shadow root, same-origin frame theming, deliberate cross-origin exclusion, reversible Original mode, global/site controls, presets and brightness, settings persistence across an actual browser restart, unsupported Chrome pages, and a 1,200-element insertion that settles without mutation feedback. Tests use local deterministic fixtures; no third-party site compatibility claims are inferred.

Screenshots in this directory are generated from the real built popup and a local fixture. The screenshot popup is opened as an extension tab to capture its complete layout; functional integration tests open the actual toolbar popup.

## Dependency audit limitation

The full development-tree audit reports 12 high-severity dependency entries tracing to one upstream [picomatch ReDoS advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). The latest picomatch version available from npm during validation was 4.0.7 and was still covered by that advisory. These are development-tool dependencies, not code bundled into ShadeShift. Vite development mode binds to loopback, and tests/builds use repository-controlled patterns. A patched upstream package should be adopted when available; no forced downgrade, ignored peer dependency, or claim of a clean full audit is made.

Earlier critical Vitest/tinypool and mocker advisories were addressed by upgrading to the compatible patched toolchain. The installed runtime dependency audit reports zero vulnerabilities.

## Practical limits

These checks do not guarantee compatibility with every webpage. Complex gradients, images containing text, filters, pseudo-elements, author-important styles, browser-native UI, and closed shadow roots remain limitations. The extension targets readable generated colors without claiming WCAG compliance for arbitrary composited content. Use Original mode on incompatible sites.
