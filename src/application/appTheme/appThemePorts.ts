import { type ThemePreferences } from "../../domain/theme";

export type ThemePreferencesGateway = {
  createDefault(): ThemePreferences;
  load(): Promise<ThemePreferences>;
  normalize(themePreferences: ThemePreferences): ThemePreferences;
  persist(themePreferences: ThemePreferences): Promise<ThemePreferences>;
  listen(callback: (themePreferences: ThemePreferences) => void): Promise<() => void>;
};
