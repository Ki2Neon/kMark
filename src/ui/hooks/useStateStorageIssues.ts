import { useEffect, useState } from "react";
import { createBrowserStateRecoveryGateway } from "../../adapters/browser/browserStateRecoveryGateway";

const stateRecoveryGateway = createBrowserStateRecoveryGateway();

export function useStateStorageIssues(): string | null {
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = stateRecoveryGateway.subscribe((issue) => {
      if (issue.fatal) {
        setFatalError(issue.message);
        return;
      }
      window.alert(issue.message);
    });
    void stateRecoveryGateway.load().catch((error: unknown) => {
      console.error(error);
    });
    return unsubscribe;
  }, []);

  return fatalError;
}
