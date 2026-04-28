import { type PreviewPreferencesGateway } from "../../application/previewPreferences/previewPreferencesPorts";
import {
  APP_INSTANCE_PRESENCE_HEARTBEAT_MS,
  PREVIEW_PREFERENCES_STORAGE_KEY,
  countActiveAppInstances,
  getInstancePreviewVisibilityStorageKey,
  isAppInstancePresenceStorageKey,
  loadInstancePreviewVisibility,
  loadPreviewPreferences,
  persistInstancePreviewVisibility,
  persistPreviewDisplayMode,
  persistPreviewPreferences,
  persistSingletonPreviewVisibility,
  removeAppInstancePresence,
  touchAppInstancePresence,
} from "../../infra/previewPreferences";

export function createBrowserPreviewPreferencesGateway(): PreviewPreferencesGateway {
  return {
    appInstancePresenceHeartbeatMs: APP_INSTANCE_PRESENCE_HEARTBEAT_MS,
    preferencesStorageKey: PREVIEW_PREFERENCES_STORAGE_KEY,
    countActiveAppInstances() {
      return countActiveAppInstances();
    },
    getInstancePreviewVisibilityStorageKey(instanceId) {
      return getInstancePreviewVisibilityStorageKey(instanceId);
    },
    isAppInstancePresenceStorageKey(key) {
      return isAppInstancePresenceStorageKey(key);
    },
    loadInstancePreviewVisibility(instanceId) {
      return loadInstancePreviewVisibility(instanceId);
    },
    loadPreferences() {
      return loadPreviewPreferences();
    },
    persistInstancePreviewVisibility(instanceId, isPreviewVisible) {
      persistInstancePreviewVisibility(instanceId, isPreviewVisible);
    },
    persistPreferences(previewPreferences) {
      persistPreviewPreferences(previewPreferences);
    },
    persistPreviewDisplayMode(previewDisplayMode) {
      persistPreviewDisplayMode(previewDisplayMode);
    },
    persistSingletonPreviewVisibility(isPreviewVisible) {
      persistSingletonPreviewVisibility(isPreviewVisible);
    },
    removeAppInstancePresence(instanceId) {
      removeAppInstancePresence(instanceId);
    },
    touchAppInstancePresence(instanceId) {
      return touchAppInstancePresence(instanceId);
    },
  };
}
