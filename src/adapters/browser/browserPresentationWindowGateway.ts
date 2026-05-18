import { type PresentationWindowGateway } from "../../application/presentationWindow/presentationWindowPorts";
import {
  loadPresentationSnapshot,
  openPresentationWindow,
  resolvePresentationSnapshotKeyFromUrl,
} from "../../infra/presentationWindow";

export function createBrowserPresentationWindowGateway(): PresentationWindowGateway {
  return {
    async open(snapshot) {
      await openPresentationWindow(snapshot);
    },

    load(snapshotKey) {
      return loadPresentationSnapshot(snapshotKey);
    },
  };
}

export function resolveBrowserPresentationSnapshotKeyFromUrl(): string | null {
  return resolvePresentationSnapshotKeyFromUrl();
}
