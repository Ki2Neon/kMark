import { type PreviewPreferences } from "../../domain/preview";

export type PreviewPreferencesGateway = {
  createDefault(): PreviewPreferences;
  loadPreferences(): Promise<PreviewPreferences>;
  normalize(previewPreferences: PreviewPreferences): PreviewPreferences;
  persistPreferences(previewPreferences: PreviewPreferences): Promise<PreviewPreferences>;
  listenForPreferencesChanged(
    callback: (previewPreferences: PreviewPreferences) => void,
  ): Promise<() => void>;
};
