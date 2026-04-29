import {
  DEFAULT_PREVIEW_PREFERENCES,
  type PreviewDisplayMode,
  type PreviewPreferences,
} from "../../domain/preview";
import { type PreviewPreferencesGateway } from "./previewPreferencesPorts";

type PreviewPreferencesControllerDependencies = {
  readonly preferencesGateway: PreviewPreferencesGateway;
};

export class PreviewPreferencesController {
  readonly #preferencesGateway: PreviewPreferencesGateway;

  constructor(dependencies: PreviewPreferencesControllerDependencies) {
    this.#preferencesGateway = dependencies.preferencesGateway;
  }

  createInitialState(): PreviewPreferences {
    return DEFAULT_PREVIEW_PREFERENCES;
  }

  async loadPreferences(): Promise<PreviewPreferences> {
    return this.#preferencesGateway.loadPreferences();
  }

  async persist(previewPreferences: PreviewPreferences): Promise<PreviewPreferences> {
    return this.#preferencesGateway.persistPreferences(previewPreferences);
  }

  subscribeToPreferences(
    callback: (previewPreferences: PreviewPreferences) => void,
  ): Promise<() => void> {
    return this.#preferencesGateway.listenForPreferencesChanged(callback);
  }

  changePreviewDisplayMode(
    currentPreviewPreferences: PreviewPreferences,
    previewDisplayMode: PreviewDisplayMode,
  ): PreviewPreferences {
    if (currentPreviewPreferences.previewDisplayMode === previewDisplayMode) {
      return currentPreviewPreferences;
    }

    return {
      ...currentPreviewPreferences,
      previewDisplayMode,
    };
  }

  changePreviewVisibility(
    currentPreviewPreferences: PreviewPreferences,
    isPreviewVisible: boolean,
  ): PreviewPreferences {
    if (currentPreviewPreferences.isPreviewVisible === isPreviewVisible) {
      return currentPreviewPreferences;
    }

    return {
      ...currentPreviewPreferences,
      isPreviewVisible,
    };
  }
}
