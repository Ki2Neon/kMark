import { type AppInstanceGateway } from "../../application/previewPreferences/previewPreferencesPorts";
import { resolveAppInstanceId } from "../../infra/previewWindow";

export function createBrowserAppInstanceGateway(): AppInstanceGateway {
  return {
    async resolveAppInstanceId() {
      return resolveAppInstanceId();
    },
  };
}
