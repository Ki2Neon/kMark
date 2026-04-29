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

  createInitialState(): ThemePreferences {
    return this.#gateway.createDefault();
  }

  async load(): Promise<ThemePreferences> {
    return this.#gateway.load();
  }

  async persist(themePreferences: ThemePreferences): Promise<ThemePreferences> {
    return this.#gateway.persist(themePreferences);
  }

  subscribeToPreferences(
    callback: (themePreferences: ThemePreferences) => void,
  ): Promise<() => void> {
    return this.#gateway.listen(callback);
  }

  createState(themePreferences: ThemePreferences): ThemePreferences {
    return themePreferences;
  }

  changeAppTheme(currentThemePreferences: ThemePreferences, appThemeId: AppThemeId): ThemePreferences {
    if (currentThemePreferences.appThemeId === appThemeId) {
      return currentThemePreferences;
    }

    return this.#gateway.normalize({
      ...currentThemePreferences,
      appThemeId,
    });
  }

  changePreviewUsesAppThemeColors(
    currentThemePreferences: ThemePreferences,
    previewUsesAppThemeColors: boolean,
  ): ThemePreferences {
    if (currentThemePreferences.previewUsesAppThemeColors === previewUsesAppThemeColors) {
      return currentThemePreferences;
    }

    return this.#gateway.normalize({
      ...currentThemePreferences,
      previewUsesAppThemeColors,
    });
  }
}
