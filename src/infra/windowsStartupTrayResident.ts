import { isTauri } from "@tauri-apps/api/core";

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
