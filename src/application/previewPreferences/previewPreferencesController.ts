import {
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
    return this.#preferencesGateway.createDefault();
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

    return this.#preferencesGateway.normalize({
      ...currentPreviewPreferences,
      previewDisplayMode,
    });
  }

  changePreviewVisibility(
    currentPreviewPreferences: PreviewPreferences,
    isPreviewVisible: boolean,
  ): PreviewPreferences {
    if (currentPreviewPreferences.isPreviewVisible === isPreviewVisible) {
      return currentPreviewPreferences;
    }

    return this.#preferencesGateway.normalize({
      ...currentPreviewPreferences,
      isPreviewVisible,
    });
  }

  changePlantUmlHttpsHosts(
    currentPreviewPreferences: PreviewPreferences,
    plantumlHttpsHosts: readonly string[],
  ): PreviewPreferences {
    if (currentPreviewPreferences.plantumlHttpsHosts.length === plantumlHttpsHosts.length
      && currentPreviewPreferences.plantumlHttpsHosts.every((host, index) => host === plantumlHttpsHosts[index])) {
      return currentPreviewPreferences;
    }
    return this.#preferencesGateway.normalize({
      ...currentPreviewPreferences,
      plantumlHttpsHosts,
    });
  }
}
