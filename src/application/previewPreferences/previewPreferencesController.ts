import { type PreviewDisplayMode, type PreviewPreferences } from "../../domain/preview";
import {
  type AppInstanceGateway,
  type PreviewPreferencesGateway,
} from "./previewPreferencesPorts";

type PreviewPreferencesControllerDependencies = {
  readonly appInstanceGateway: AppInstanceGateway;
  readonly preferencesGateway: PreviewPreferencesGateway;
};

type HandleStorageChangeOptions = {
  readonly appInstanceId: string | null;
  readonly currentPreviewPreferences: PreviewPreferences;
  readonly key: string | null;
  readonly manageVisibilityByAppInstance: boolean;
};

export class PreviewPreferencesController {
  readonly #appInstanceGateway: AppInstanceGateway;
  readonly #preferencesGateway: PreviewPreferencesGateway;

  constructor(dependencies: PreviewPreferencesControllerDependencies) {
    this.#appInstanceGateway = dependencies.appInstanceGateway;
    this.#preferencesGateway = dependencies.preferencesGateway;
  }

  createState(): PreviewPreferences {
    return this.#preferencesGateway.loadPreferences();
  }

  getAppInstancePresenceHeartbeatMs(): number {
    return this.#preferencesGateway.appInstancePresenceHeartbeatMs;
  }

  async resolveAppInstanceId(manageVisibilityByAppInstance: boolean): Promise<string | null> {
    if (!manageVisibilityByAppInstance) {
      return null;
    }

    return this.#appInstanceGateway.resolveAppInstanceId();
  }

  persist(previewPreferences: PreviewPreferences, manageVisibilityByAppInstance: boolean): void {
    if (manageVisibilityByAppInstance) {
      this.#preferencesGateway.persistPreviewDisplayMode(previewPreferences.previewDisplayMode);
      return;
    }

    this.#preferencesGateway.persistPreferences(previewPreferences);
  }

  syncManagedPreviewVisibility(
    currentPreviewPreferences: PreviewPreferences,
    appInstanceId: string,
  ): PreviewPreferences {
    const storedInstancePreviewVisibility = this.#preferencesGateway.loadInstancePreviewVisibility(appInstanceId);

    if (storedInstancePreviewVisibility === null) {
      this.#preferencesGateway.persistInstancePreviewVisibility(
        appInstanceId,
        currentPreviewPreferences.isPreviewVisible,
      );

      return currentPreviewPreferences;
    }

    if (currentPreviewPreferences.isPreviewVisible === storedInstancePreviewVisibility) {
      return currentPreviewPreferences;
    }

    return {
      ...currentPreviewPreferences,
      isPreviewVisible: storedInstancePreviewVisibility,
    };
  }

  syncPresence(appInstanceId: string, isPreviewVisible: boolean): void {
    const activeAppInstanceCount = this.#preferencesGateway.touchAppInstancePresence(appInstanceId);

    if (activeAppInstanceCount <= 1) {
      this.#preferencesGateway.persistSingletonPreviewVisibility(isPreviewVisible);
    }
  }

  cleanupPresence(appInstanceId: string): void {
    this.#preferencesGateway.removeAppInstancePresence(appInstanceId);
  }

  persistManagedVisibility(appInstanceId: string, isPreviewVisible: boolean): void {
    this.#preferencesGateway.persistInstancePreviewVisibility(appInstanceId, isPreviewVisible);

    if (this.#preferencesGateway.countActiveAppInstances() <= 1) {
      this.#preferencesGateway.persistSingletonPreviewVisibility(isPreviewVisible);
    }
  }

  handleStorageChange({
    appInstanceId,
    currentPreviewPreferences,
    key,
    manageVisibilityByAppInstance,
  }: HandleStorageChangeOptions): PreviewPreferences | null {
    if (key === this.#preferencesGateway.preferencesStorageKey) {
      const nextPreviewPreferences = this.#preferencesGateway.loadPreferences();
      const nextIsPreviewVisible = manageVisibilityByAppInstance
        ? currentPreviewPreferences.isPreviewVisible
        : nextPreviewPreferences.isPreviewVisible;

      return currentPreviewPreferences.previewDisplayMode === nextPreviewPreferences.previewDisplayMode
        && currentPreviewPreferences.isPreviewVisible === nextIsPreviewVisible
        ? currentPreviewPreferences
        : {
          previewDisplayMode: nextPreviewPreferences.previewDisplayMode,
          isPreviewVisible: nextIsPreviewVisible,
        };
    }

    if (!manageVisibilityByAppInstance || appInstanceId === null) {
      return null;
    }

    const instancePreviewVisibilityStorageKey =
      this.#preferencesGateway.getInstancePreviewVisibilityStorageKey(appInstanceId);

    if (key === instancePreviewVisibilityStorageKey) {
      const nextInstancePreviewVisibility =
        this.#preferencesGateway.loadInstancePreviewVisibility(appInstanceId);

      if (nextInstancePreviewVisibility === null) {
        return currentPreviewPreferences;
      }

      return currentPreviewPreferences.isPreviewVisible === nextInstancePreviewVisibility
        ? currentPreviewPreferences
        : {
          ...currentPreviewPreferences,
          isPreviewVisible: nextInstancePreviewVisibility,
        };
    }

    if (key === null || this.#preferencesGateway.isAppInstancePresenceStorageKey(key)) {
      if (this.#preferencesGateway.countActiveAppInstances() <= 1) {
        this.#preferencesGateway.persistSingletonPreviewVisibility(currentPreviewPreferences.isPreviewVisible);
      }

      return currentPreviewPreferences;
    }

    return null;
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
