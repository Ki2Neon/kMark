import { type AppThemeId, type ThemePreferences } from "../../domain/theme";
import { type ThemePreferencesGateway } from "./appThemePorts";

type AppThemeControllerDependencies = {
  readonly gateway: ThemePreferencesGateway;
};

export class AppThemeController {
  readonly #gateway: ThemePreferencesGateway;

  constructor(dependencies: AppThemeControllerDependencies) {
    this.#gateway = dependencies.gateway;
  }

  createState(): ThemePreferences {
    return this.#gateway.load();
  }

  persist(themePreferences: ThemePreferences): void {
    this.#gateway.persist(themePreferences);
  }

  matchesStorageKey(key: string | null): boolean {
    return key === this.#gateway.storageKey;
  }

  loadFromStorage(currentThemePreferences: ThemePreferences): ThemePreferences {
    const nextThemePreferences = this.#gateway.load();

    return currentThemePreferences.appThemeId === nextThemePreferences.appThemeId
      && currentThemePreferences.previewThemeId === nextThemePreferences.previewThemeId
      && currentThemePreferences.previewUsesAppThemeColors === nextThemePreferences.previewUsesAppThemeColors
      ? currentThemePreferences
      : nextThemePreferences;
  }

  changeAppTheme(currentThemePreferences: ThemePreferences, appThemeId: AppThemeId): ThemePreferences {
    if (currentThemePreferences.appThemeId === appThemeId) {
      return currentThemePreferences;
    }

    return {
      ...currentThemePreferences,
      appThemeId,
    };
  }

  changePreviewUsesAppThemeColors(
    currentThemePreferences: ThemePreferences,
    previewUsesAppThemeColors: boolean,
  ): ThemePreferences {
    if (currentThemePreferences.previewUsesAppThemeColors === previewUsesAppThemeColors) {
      return currentThemePreferences;
    }

    return {
      ...currentThemePreferences,
      previewUsesAppThemeColors,
    };
  }
}
