import { type SubWindowGateway } from "../../application/subWindow/subWindowPorts";
import {
  listenForSubWindowStateChanged,
  loadSubWindowState,
  loadTauriSubWindowState,
  openSubWindow,
  publishSubWindowState,
  resolveSubWindowTarget,
} from "../../infra/subWindow";
import { isTauri } from "../../runtime/runtime";

export function createBrowserSubWindowGateway(): SubWindowGateway {
  return {
    async open(state) {
      await openSubWindow(state);
    },

    async load(stateKey) {
      if (isTauri()) {
        return loadTauriSubWindowState();
      }

      if (stateKey === null) {
        return null;
      }

      return loadSubWindowState(stateKey);
    },

    async listen(stateKey, callback) {
      return listenForSubWindowStateChanged(stateKey, callback);
    },

    async publish(state) {
      await publishSubWindowState(state);
    },
  };
}

export function resolveBrowserSubWindowTarget(): { readonly stateKey: string | null } | null {
  return resolveSubWindowTarget();
}
