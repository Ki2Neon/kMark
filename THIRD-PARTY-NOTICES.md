# Third-Party Notices

kMark itself is licensed under MIT. Third-party components keep their own licenses.

This file records the dependency licenses confirmed in this repository on 2026-04-22.

## Notes

- `dompurify` is dual-licensed under `MPL-2.0 OR Apache-2.0`. For kMark distribution, the Apache-2.0 option is selected.
- Tauri crates and packages used directly by this app are `MIT OR Apache-2.0`.
- Some Rust transitive dependencies include `MPL-2.0`. Those do not prevent kMark itself from using MIT, but their original license terms still apply to those third-party components.

## Direct production npm dependencies

| Package | License |
| --- | --- |
| @codemirror/autocomplete | MIT |
| @codemirror/commands | MIT |
| @codemirror/lang-markdown | MIT |
| @codemirror/language | MIT |
| @codemirror/state | MIT |
| @codemirror/view | MIT |
| @lezer/highlight | MIT |
| @tauri-apps/api | Apache-2.0 OR MIT |
| @tauri-apps/plugin-opener | Apache-2.0 OR MIT |
| @uiw/react-codemirror | MIT |
| dompurify | MPL-2.0 OR Apache-2.0 |
| markdown-it | MIT |
| react | MIT |
| react-dom | MIT |

## Direct Rust dependencies

| Package | License |
| --- | --- |
| serde | MIT OR Apache-2.0 |
| serde_json | MIT OR Apache-2.0 |
| tauri | Apache-2.0 OR MIT |
| tauri-build | Apache-2.0 OR MIT |
| tauri-plugin-autostart | Apache-2.0 OR MIT |
| tauri-plugin-opener | Apache-2.0 OR MIT |
| tauri-plugin-single-instance | Apache-2.0 OR MIT |
| thiserror | MIT OR Apache-2.0 |

## Selected transitive licenses worth noting

| License family | Notes |
| --- | --- |
| MPL-2.0 | Present in Rust transitive dependencies such as `cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext`, and `selectors` |
| BSD-2-Clause / BSD-3-Clause | Present in some bundled/transitive packages |
| ISC | Present in some bundled/transitive packages |
| Zlib | Present in some Rust transitive packages |
| Unicode-3.0 | Present in some Rust transitive packages |

## Verification commands

The following commands were used to verify the dependency licenses in this repository:

```powershell
pnpm licenses list --prod
Push-Location src-tauri
cargo metadata --format-version 1 --locked
Pop-Location
```