import {
  DEFAULT_DESKTOP_SPLIT_RATIO,
  MAX_DESKTOP_SPLIT_RATIO,
  MIN_DESKTOP_SPLIT_RATIO,
  loadDesktopSplitRatio,
  persistDesktopSplitRatio,
} from "../../infra/editorLayout";

export function createBrowserEditorLayoutGateway() {
  return {
    defaultDesktopSplitRatio: DEFAULT_DESKTOP_SPLIT_RATIO,
    loadDesktopSplitRatio,
    maximumDesktopSplitRatio: MAX_DESKTOP_SPLIT_RATIO,
    minimumDesktopSplitRatio: MIN_DESKTOP_SPLIT_RATIO,
    persistDesktopSplitRatio,
  };
}
