import { type EditorPreferences } from "../../domain/editorPreferences";

export type EditorPreferencesGateway = {
  createDefault(): EditorPreferences;
  load(): Promise<EditorPreferences>;
  normalize(editorPreferences: EditorPreferences): EditorPreferences;
  persist(editorPreferences: EditorPreferences): Promise<EditorPreferences>;
  listen(callback: (editorPreferences: EditorPreferences) => void): Promise<() => void>;
};

export type WindowsStartupTrayResidentGateway = {
  supportsToggle(): boolean;
};
