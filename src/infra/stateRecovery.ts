import { isTauri } from "../runtime/runtime";
import { invokeTauriCommand } from "./tauriCommand";

export type StateStorageIssue = {
  readonly fatal: boolean;
  readonly message: string;
};

const TAKE_STATE_RECOVERY_NOTICES_COMMAND = "take_state_recovery_notices";
const listeners = new Set<(issue: StateStorageIssue) => void>();
const pendingIssues: StateStorageIssue[] = [];

export function reportStateStorageIssue(issue: StateStorageIssue): void {
  if (pendingIssues.some((pendingIssue) => pendingIssue.fatal === issue.fatal && pendingIssue.message === issue.message)) {
    return;
  }

  if (listeners.size === 0) {
    pendingIssues.push(issue);
    return;
  }

  listeners.forEach((listener) => listener(issue));
}

export function subscribeStateStorageIssues(
  listener: (issue: StateStorageIssue) => void,
): () => void {
  listeners.add(listener);
  pendingIssues.splice(0).forEach(listener);
  return () => listeners.delete(listener);
}

export async function loadDesktopStateRecoveryNotices(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  const notices = await invokeTauriCommand<readonly string[]>(
    TAKE_STATE_RECOVERY_NOTICES_COMMAND,
    {},
    "保存データの回復結果を取得できませんでした。",
  );
  notices.forEach((message) => reportStateStorageIssue({ fatal: false, message }));
}
