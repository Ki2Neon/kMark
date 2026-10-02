import { config as base } from "../../wdio.conf.mjs";

export const config = {
  ...base,
  specs: ["./tauri.perf.mjs"],
  suites: { perf: ["./tauri.perf.mjs"] },
  mochaOpts: { ...base.mochaOpts, timeout: 180_000 },
};
