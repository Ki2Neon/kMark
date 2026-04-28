import { useEffect } from "react";
import { createBrowserWindowTitleGateway } from "../../adapters/browser/browserWindowTitleGateway";

const windowTitleGateway = createBrowserWindowTitleGateway();

export function useWindowTitle(title: string) {
  useEffect(() => {
    windowTitleGateway.setTitle(title);
  }, [title]);
}
