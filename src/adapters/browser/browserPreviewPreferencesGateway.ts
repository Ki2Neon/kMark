import { type PreviewPreferencesGateway } from "../../application/previewPreferences/previewPreferencesPorts";
import {
  listenForPreviewPreferencesChanged,
  loadPreviewPreferences,
  persistPreviewPreferences,
} from "../../infra/previewPreferences";
import {
  createDefaultPreviewPreferences,
  normalizePreviewPreferences,
} from "./browserRustCore";

export function createBrowserPreviewPreferencesGateway(): PreviewPreferencesGateway {
  return {
    createDefault() {
      return createDefaultPreviewPreferences();
    },
    async loadPreferences() {
      return loadPreviewPreferences();
    },
    normalize(previewPreferences) {
      return normalizePreviewPreferences(previewPreferences);
    },
    async persistPreferences(previewPreferences) {
      return persistPreviewPreferences(previewPreferences);
    },
    async listenForPreferencesChanged(callback) {
      return listenForPreviewPreferencesChanged(callback);
    },
  };
}
