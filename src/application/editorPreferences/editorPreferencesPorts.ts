import { type EditorPreferences } from "../../domain/editorPreferences";

export type EditorPreferencesGateway = {
  load(): EditorPreferences;
  persist(editorPreferences: EditorPreferences): void;
};

export type WindowsStartupTrayResidentGateway = {
  supportsToggle(): boolean;
  syncPreference(enabled: boolean): Promise<void>;
};
