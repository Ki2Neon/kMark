import { type PreviewPreferences } from "../../domain/preview";

export type PreviewPreferencesGateway = {
  loadPreferences(): Promise<PreviewPreferences>;
  persistPreferences(previewPreferences: PreviewPreferences): Promise<PreviewPreferences>;
  listenForPreferencesChanged(
    callback: (previewPreferences: PreviewPreferences) => void,
  ): Promise<() => void>;
};
