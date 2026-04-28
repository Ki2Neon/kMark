import { type PreviewDisplayMode, type PreviewPreferences } from "../../domain/preview";

export type PreviewPreferencesGateway = {
  readonly appInstancePresenceHeartbeatMs: number;
  readonly preferencesStorageKey: string;
  countActiveAppInstances(): number;
  getInstancePreviewVisibilityStorageKey(instanceId: string): string | null;
  isAppInstancePresenceStorageKey(key: string | null): boolean;
  loadInstancePreviewVisibility(instanceId: string): boolean | null;
  loadPreferences(): PreviewPreferences;
  persistInstancePreviewVisibility(instanceId: string, isPreviewVisible: boolean): void;
  persistPreferences(previewPreferences: PreviewPreferences): void;
  persistPreviewDisplayMode(previewDisplayMode: PreviewDisplayMode): void;
  persistSingletonPreviewVisibility(isPreviewVisible: boolean): void;
  removeAppInstancePresence(instanceId: string): void;
  touchAppInstancePresence(instanceId: string): number;
};

export type AppInstanceGateway = {
  resolveAppInstanceId(): Promise<string>;
};
