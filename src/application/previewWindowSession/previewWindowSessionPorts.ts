export type {
  PreviewWindowEditJumpRequest,
  PreviewWindowSnapshot,
} from "../../domain/previewWindow";

import type {
  PreviewWindowEditJumpRequest,
  PreviewWindowSnapshot,
} from "../../domain/previewWindow";

export type PreviewWindowSessionGateway = {
  openWindow(snapshot: PreviewWindowSnapshot, activeSourceLine: number | null): Promise<void>;
  syncState(snapshot: PreviewWindowSnapshot, activeSourceLine: number | null): Promise<void>;
  listenForEditJumpRequests(
    callback: (previewWindowEditJumpRequest: PreviewWindowEditJumpRequest) => void,
  ): Promise<() => void>;
};
