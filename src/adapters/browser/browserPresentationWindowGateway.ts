import { type PresentationWindowGateway } from "../../application/presentationWindow/presentationWindowPorts";
import {
  loadPresentationSnapshot,
  loadTauriPresentationSnapshot,
  openPresentationWindow,
  resolvePresentationWindowTarget,
} from "../../infra/presentationWindow";
import { isTauri } from "../../runtime/runtime";

export function createBrowserPresentationWindowGateway(): PresentationWindowGateway {
  return {
    async open(snapshot) {
      await openPresentationWindow(snapshot);
    },

    async load(snapshotKey) {
      if (isTauri()) {
        return loadTauriPresentationSnapshot();
      }

      if (snapshotKey === null) {
        return null;
      }

      return loadPresentationSnapshot(snapshotKey);
    },
  };
}

export function resolveBrowserPresentationWindowTarget(): { readonly snapshotKey: string | null } | null {
  return resolvePresentationWindowTarget();
}
