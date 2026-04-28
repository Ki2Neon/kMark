import { type ThemePreferences } from "../../domain/theme";

export type ThemePreferencesGateway = {
  readonly storageKey: string;
  load(): ThemePreferences;
  persist(themePreferences: ThemePreferences): void;
};
