import { syncWindowTitle } from "../../infra/windowTitle";

export type WindowTitleGateway = {
  setTitle(title: string): void;
};

export function createBrowserWindowTitleGateway(): WindowTitleGateway {
  return {
    setTitle(title) {
      syncWindowTitle(title);
    },
  };
}
