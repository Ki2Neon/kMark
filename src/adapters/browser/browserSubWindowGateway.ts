import { type SubWindowGateway } from "../../application/subWindow/subWindowPorts";
import {
  listenForSubWindowStateChanged,
  listenForSubWindowSourceLineSelection,
  loadSubWindowState,
  loadTauriSubWindowState,
  openSubWindow,
  publishSubWindowState,
  requestSubWindowSourceLineSelection,
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

    async requestSourceLineSelection(request) {
      await requestSubWindowSourceLineSelection(request);
    },

    async listenSourceLineSelection(callback) {
      return listenForSubWindowSourceLineSelection(callback);
    },
  };
}

export function resolveBrowserSubWindowTarget(): { readonly stateKey: string | null } | null {
  return resolveSubWindowTarget();
}
