import { type WindowsStartupTrayResidentGateway } from "../../application/editorPreferences/editorPreferencesPorts";
import { supportsWindowsStartupTrayResidentToggle } from "../../infra/windowsStartupTrayResident";

export function createBrowserWindowsStartupTrayResidentGateway(): WindowsStartupTrayResidentGateway {
  return {
    supportsToggle() {
      return supportsWindowsStartupTrayResidentToggle();
    },
  };
}
