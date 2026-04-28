import { type WindowsStartupTrayResidentGateway } from "../../application/editorPreferences/editorPreferencesPorts";
import {
  supportsWindowsStartupTrayResidentToggle,
  syncWindowsStartupTrayResidentPreference,
} from "../../infra/windowsStartupTrayResident";

export function createBrowserWindowsStartupTrayResidentGateway(): WindowsStartupTrayResidentGateway {
  return {
    supportsToggle() {
      return supportsWindowsStartupTrayResidentToggle();
    },
    async syncPreference(enabled) {
      await syncWindowsStartupTrayResidentPreference(enabled);
    },
  };
}
