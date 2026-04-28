import { type DesktopWorkspaceSplitGateway } from "../../application/desktopWorkspaceSplit/desktopWorkspaceSplitPorts";
import {
  DEFAULT_DESKTOP_SPLIT_RATIO,
  MAX_DESKTOP_SPLIT_RATIO,
  MIN_DESKTOP_SPLIT_RATIO,
  loadDesktopSplitRatio,
  persistDesktopSplitRatio,
} from "../../infra/editorLayout";

export function createBrowserEditorLayoutGateway(): DesktopWorkspaceSplitGateway {
  return {
    defaultRatio: DEFAULT_DESKTOP_SPLIT_RATIO,
    loadRatio() {
      return loadDesktopSplitRatio();
    },
    maximumRatio: MAX_DESKTOP_SPLIT_RATIO,
    minimumRatio: MIN_DESKTOP_SPLIT_RATIO,
    persistRatio(splitRatio) {
      persistDesktopSplitRatio(splitRatio);
    },
  };
}
