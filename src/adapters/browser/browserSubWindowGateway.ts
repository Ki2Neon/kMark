import { type SubWindowGateway } from "../../application/subWindow/subWindowPorts";
import {
  activateSubWindowSource,
  getSubWindowSources,
  getSubWindowSourceState,
  listenForSubWindowSourcesChanged,
  listenForSubWindowSourceStateChanged,
  listenForSubWindowSourceLineSelection,
  openSubWindow,
  publishSubWindowSourceState,
  registerSubWindowSource,
  requestSubWindowSourceLineSelection,
  resolveSubWindowTarget,
  unregisterSubWindowSource,
} from "../../infra/subWindow";

export function createBrowserSubWindowGateway(): SubWindowGateway {
  return {
    async activateSource(sourceId) {
      await activateSubWindowSource(sourceId);
    },

    async getSources() {
      return getSubWindowSources();
    },

    async getSourceState(selection) {
      return getSubWindowSourceState(selection);
    },

    async listenSourceStateChanged(callback) {
      return listenForSubWindowSourceStateChanged(callback);
    },

    async listenSourcesChanged(callback) {
      return listenForSubWindowSourcesChanged(callback);
    },

    async open() {
      await openSubWindow();
    },

    async publishSourceState(sourceId, state) {
      await publishSubWindowSourceState(sourceId, state);
    },

    async registerSource(state) {
      return registerSubWindowSource(state);
    },

    async requestSourceLineSelection(request) {
      await requestSubWindowSourceLineSelection(request);
    },

    async listenSourceLineSelection(callback) {
      return listenForSubWindowSourceLineSelection(callback);
    },

    async unregisterSource(sourceId) {
      await unregisterSubWindowSource(sourceId);
    },
  };
}

export function resolveBrowserSubWindowTarget(): { readonly stateKey: string | null } | null {
  return resolveSubWindowTarget();
}
