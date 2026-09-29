# Test architecture

## Architecture Core

| Layer | Runner | Boundary and responsibility |
| --- | --- | --- |
| Rust Core | `cargo test` | `kmark-core` and `kmark-application`: documents, UTF-16 mutations, revision checks, dirty state, section patches, stale Preview rejection and error propagation. No WebView or Tauri dependency. |
| Frontend Unit | Vitest in Node | Pure TypeScript state, mapping, policy and adapter helpers. No DOM assertions. |
| Browser Integration | Vitest Browser with Playwright Chromium | React DOM, A4 physical pagination and print, layout, Worker, current-source WASM, Mermaid and local PlantUML renderer. No Tauri command mock is used as evidence of desktop integration. |
| Performance | Separate Vitest Browser suite | Browser/WASM/renderer timings and node counts. Records measurements; no fixed-time functional pass criterion. |

The Rust Core owns canonical document and revision rules. The WASM and desktop crates adapt that Core to their runtime. A Browser test selects the smallest observable rendering boundary; Core correctness is asserted natively rather than repeated through every adapter.

## Tauri Adapter

WebdriverIO with `@wdio/tauri-service` starts the actual Tauri binary and Windows WebView2. The E2E suite follows UI action → React → `invoke` → Rust command → Application/Core → filesystem → IPC result → React DOM. The build uses `target/e2e` to avoid locking an application started by `tauri dev`. The service uses a dedicated temporary workspace. The E2E build requires `KMARK_E2E_DATA_DIR` and stores application state there; WebView2 also uses a temporary data folder. The `e2e` Cargo feature exposes a read-only diagnostic snapshot only in that build. It must never expose a state mutation command.

No real Tauri E2E test may mock IPC, desktop Rust, or filesystem. Browser tests may stub their outer platform boundary when that boundary is unrelated to the behavior under test.

## Commands

| Command | Scope |
| --- | --- |
| `pnpm test` | Daily fast Rust Core + TypeScript Unit |
| `pnpm test:unit` | `cargo test` for Core/Application, then Vitest Unit |
| `pnpm test:browser` | Fresh WASM build, then Vitest Browser functional suite |
| `pnpm test:tauri` | E2E-feature Tauri build, then real desktop critical path |
| `pnpm test:perf` | Fresh WASM build, then Node and headless Browser performance measurements |
| `pnpm test:perf:tauri` | E2E-feature desktop build, then WebView2/IPC performance measurements |
| `pnpm test:ci` | Typecheck, lint, Rust fmt/Clippy, unit, Browser, Tauri smoke |
| `pnpm test:all` | Functional, Browser performance and Tauri performance suites |

Windows prerequisites: Rust stable with `wasm32-unknown-unknown`, `wasm-pack`, Node 24, pnpm 10, Microsoft Edge WebView2 Runtime and the Tauri Windows build prerequisites. Install dependencies with `pnpm install --frozen-lockfile`; install the managed browser with `pnpm exec playwright install chromium`. `test:browser` deliberately rebuilds `src/wasm/pkg` from the checked-out Rust source before running. CI does not accept an unavailable browser or desktop driver as a skip.

## Choose a test layer

| Failure origin | First regression test | Escalate when |
| --- | --- | --- |
| Rust algorithm, document, revision, patch | Rust Native | An adapter may change the outcome |
| Pure TS state, DTO or policy | Vitest Unit | DOM behavior is relevant |
| React DOM, CSS, layout, scroll | Vitest Browser | Desktop-only behavior is relevant |
| Worker, WASM, PlantUML, SVG | Vitest Browser | Real IPC is relevant |
| Tauri IPC, filesystem, desktop workflow | WebdriverIO Tauri | Keep a narrower Core test for the root cause |

Add shared source fixtures under `tests/fixtures/documents`; deterministic generators belong under `tests/fixtures/generators`. Tests needing filesystem state copy fixtures into their own temporary directory. Do not use a user's document or config directory.
Desktop save assertions compare the Rust draft's canonical LF content with the saved file after line-ending normalization, and verify the draft's `lineEnding` DTO separately.

## Debug workflow

1. Reproduce the bug. Pick the lowest layer that can observe the root cause.
2. Add a regression test and confirm it fails before editing product code.
3. Inspect failure artifacts and correlate session ID, operation ID and revision across frontend log, IPC, Rust log and diagnostic state.
4. Fix the owning layer; do not mask a backend bug with a frontend workaround.
5. Rerun the regression and nearby unit tests. Run Browser tests for DOM, Worker or WASM changes; run real Tauri E2E for IPC or filesystem changes.
6. Run relevant static checks (`cargo fmt --check`, Clippy, typecheck and lint). A single narrow passing test does not close the investigation.

Use state/revision-based waits with a bounded timeout and a diagnostic error. Functional tests must not synchronize through arbitrary sleeps. The two-frame boundary in a benchmark is a named measurement point, not a readiness condition.

## Failure artifacts

Browser tests write screenshot, frontend log, state, machine-readable result and Playwright trace on failure under `artifacts/browser/`. Desktop E2E writes artifacts below `artifacts/tauri/<test-name>/`, including screenshot, frontend and backend logs, a read-only state snapshot and machine-readable result. Inspect `state.json` with `frontend.log` and `backend.log` before rerunning; keep the original failure evidence. CI uploads artifacts from failed runs. `artifacts/` is local output and is excluded from Git.

Performance output belongs under `artifacts/perf/`. Browser timings describe headless Chromium with the Browser adapter. They do not measure WebView2, desktop Rust or real IPC. The Tauri benchmark has a separate result file and label. No benchmark timing currently fails a PR by crossing an absolute threshold.

Metric boundaries: `initialCommitMs` / `updateCommitMs` measure synchronous React `flushSync` render and effects; `initialPaginationReadyMs` / `updatePaginationReadyMs` measure through the physical-page DOM commit, including the scheduled pagination delay. `a4-one-source-overflow` separately measures direct Browser pagination for one source page that produces at least 20 or 200 physical pages. `scrollHeightReadMs` measures the A4 viewport `scrollHeight` read, which does not guarantee a forced layout; `updateTwoFramesMs` measures through two animation frames. `wasmInitialMs` / `wasmEditMs` measure the Rust WASM Markdown-to-HTML call; `plantumlInitialMs` / `plantumlUpdateMs` include local `@plantuml/core` SVG rendering and finalization. Tauri `editToRustRevisionMs` and `editToPreviewDomMs` begin at the WebDriver edit command and include driver overhead through the observed state or DOM condition. These values are not interchangeable.

## CI

`.github/workflows/test.yml` runs on PRs and main on Windows: typecheck/lint → Rust checks and Unit → fresh WASM Browser integration → real Tauri/WebView2 smoke. Browser or Tauri launch failure fails the job. `.github/workflows/performance.yml` records Browser and Tauri benchmarks nightly and on demand; PRs do not wait on those measurements.

The four runners are intentional: Rust `cargo test`, Vitest Unit, Vitest Browser with Playwright, and WebdriverIO Tauri. Do not add a second Browser control harness or a custom CDP launcher.
