import { invoke, isTauri } from "@tauri-apps/api/core";

const AUTOSTART_ENABLE_COMMAND = "plugin:autostart|enable";
const AUTOSTART_DISABLE_COMMAND = "plugin:autostart|disable";
const AUTOSTART_IS_ENABLED_COMMAND = "plugin:autostart|is_enabled";

type NavigatorWithUserAgentData = Navigator & {
  readonly userAgentData?: {
    readonly platform?: string;
  };
};

function isWindowsEnvironment(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const navigatorWithUserAgentData = navigator as NavigatorWithUserAgentData;
  const platform = navigatorWithUserAgentData.userAgentData?.platform;

  if (typeof platform === "string" && /windows/iu.test(platform)) {
    return true;
  }

  return /windows/iu.test(navigator.userAgent);
}

export function supportsWindowsStartupTrayResidentToggle(): boolean {
  return isTauri() && isWindowsEnvironment();
}

export async function syncWindowsStartupTrayResidentPreference(enabled: boolean): Promise<void> {
  if (!supportsWindowsStartupTrayResidentToggle()) {
    return;
  }

  try {
    const currentEnabled = await invoke<boolean>(AUTOSTART_IS_ENABLED_COMMAND);

    if (currentEnabled === enabled) {
      return;
    }

    await invoke(enabled ? AUTOSTART_ENABLE_COMMAND : AUTOSTART_DISABLE_COMMAND);
  } catch {
    // Ignore plugin sync failures so the local preference stays editable.
  }
}