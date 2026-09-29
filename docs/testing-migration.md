# Test migration ledger

Every listed legacy runner was removed after its replacement passed. Each row has status `verified → removed`: the named replacement ran successfully before deletion of that legacy file. The relevant behavior is the migration unit, not the filename. Verification at migration: Rust Core/Application 272 tests, Vitest Unit 74 tests, Vitest Browser 15 tests, Performance Node 3 and Browser 12 tests. Real Tauri E2E is a newly added layer, not a legacy-runner replacement.

| Legacy file | Guarantee | New layer |
| --- | --- | --- |
| `tools/test-session-preview-state.mjs` | section patch application and state | `tests/unit/session-preview-state.test.mjs` |
| `tools/test-session-preview-wasm.mjs` | WASM section diff, dirty equality | Rust Native + Browser WASM integration |
| `tools/test-session-preview-ui.mjs` | SSR-rendered Preview structure | Vitest Browser Preview structure |
| `tools/test-session-preview-browser.mjs` | DOM/page identity, TOC, scroll, visibility, Mermaid, drag, dirty; 200-page measurement | Vitest Browser functional + Performance 200-page |
| `tools/test-a4-preview-pages.mjs` | A4 fit/valign math and SSR page structure | `tests/unit/a4-page-fit.test.mjs` + Vitest Browser layout/structure |
| `tools/test-a4-layout-browser.mjs` | measured fit/valign geometry | Vitest Browser layout |
| `tools/test-editor-syntax-theme.mjs` | theme mapping | `tests/unit/editor-syntax-theme.test.mjs` |
| `tools/test-editor-syntax-theme-browser.mjs` | computed syntax colors | Vitest Browser theme |
| `tools/test-editor-mutation-queue.mjs` | serialization, retry, UTF-16 line endings | `tests/unit/editor-mutation-queue.test.mjs` + Rust Native |
| `tools/test-editor-shift-wheel.mjs` | wheel mapping | `tests/unit/editor-shift-wheel.test.mjs` |
| `tools/test-table-insert.mjs` | table and picker geometry | `tests/unit/table-insert.test.mjs` |
| `tools/test-kmark-completion-context.mjs` | completion context | `tests/unit/kmark-completion-context.test.mjs` |
| `tools/test-kmark-scope-display.mjs` | scope display mapping | `tests/unit/kmark-scope-display.test.mjs` |
| `tools/test-mermaid-source.mjs` | Mermaid source/SVG normalization | `tests/unit/mermaid-source.test.mjs` + Browser Mermaid |
| `tools/test-mermaid-theme-contrast.mjs` | theme contrast tokens | `tests/unit/mermaid-theme-contrast.test.mjs` |
| `tools/test-plantuml-core-contract.mjs` | pinned local renderer contract | `tests/unit/plantuml-assets.test.mjs` |
| `tools/test-plantuml-stdlib.mjs` | bundled stdlib hash/listing/no network | `tests/unit/plantuml-assets.test.mjs` + Browser PlantUML |
| `tools/test-plantuml-policy.mjs` | SVG cache and incremental plan | `tests/unit/plantuml-policy.test.mjs` |
| `tools/test-plantuml-rendering.mjs` | actual local SVG render | Vitest Browser PlantUML |
| `tools/test-plantuml-wasm-integration.mjs` | WASM/PlantUML policy path | Vitest Browser Worker/WASM/PlantUML |
| `tools/test-preview-native-drag.mjs` | pan/drag policy | `tests/unit/preview-native-drag.test.mjs` + Vitest Browser drag |
| `tools/benchmark-kmark-validation.mjs` | validation assertions and 50/100/200-page timings | `tests/unit/kmark-validation.test.mjs` + Performance |
| `tools/benchmark-session-preview.mjs` | WASM Preview timing | Performance WASM |
| `tools/benchmark-editor-session.mjs` | EditorSession throughput | `tests/perf/editor-session.perf.browser.test.ts` |

`tools/test-plantuml-preview-browser.mjs` was named in the request but is absent in this checkout. Its specified Worker → WASM → local PlantUML → React DOM guarantee is covered by the new Browser PlantUML integration test.

The old Vite process spawner, port scan, Edge/CDP client, temporary Browser profile and fixed polling loops were in the removed legacy scripts. The new Browser lifecycle belongs to Vitest and Playwright. Old Browser HTML fixtures were moved under `tests/fixtures/browser` or removed if unused. Historical Node/WASM benchmark numbers must not be used as numerical baselines for the new headless Chromium results.
