import { type RecentFileStore } from "../../application/editorSession/editorSessionPorts";
import { loadRecentFiles, recordRecentFile } from "../../infra/recentFiles";

export function createBrowserRecentFileStore(): RecentFileStore {
  return {
    load: loadRecentFiles,
    record: recordRecentFile,
  };
}
