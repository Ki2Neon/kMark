import {
  loadDesktopStateRecoveryNotices,
  subscribeStateStorageIssues,
  type StateStorageIssue,
} from "../../infra/stateRecovery";

export type StateRecoveryGateway = {
  load(): Promise<void>;
  subscribe(callback: (issue: StateStorageIssue) => void): () => void;
};

export function createBrowserStateRecoveryGateway(): StateRecoveryGateway {
  return {
    load: loadDesktopStateRecoveryNotices,
    subscribe: subscribeStateStorageIssues,
  };
}
