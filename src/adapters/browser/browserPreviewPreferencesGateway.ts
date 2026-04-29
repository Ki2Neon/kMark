import { type PreviewPreferencesGateway } from "../../application/previewPreferences/previewPreferencesPorts";
import {
  listenForPreviewPreferencesChanged,
  loadPreviewPreferences,
  persistPreviewPreferences,
} from "../../infra/previewPreferences";

export function createBrowserPreviewPreferencesGateway(): PreviewPreferencesGateway {
  return {
    async loadPreferences() {
      return loadPreviewPreferences();
    },
    async persistPreferences(previewPreferences) {
      return persistPreviewPreferences(previewPreferences);
    },
    async listenForPreferencesChanged(callback) {
      return listenForPreviewPreferencesChanged(callback);
    },
  };
}
