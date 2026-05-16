import { type RecentFile } from "../domain/recentFiles";
import { isTauri } from "../runtime/runtime";
import { parseJsonPayload, recordRecentFileWithWasm } from "../wasm/kmarkWeb";
import { invokeTauriCommand } from "./tauriCommand";
import { createWebJsonStateStore } from "./webStateStore";
import { normalizeRecentFilesState } from "./webStateNormalization";

const GET_RECENT_FILES_COMMAND = "get_recent_files";
const RECORD_RECENT_FILE_COMMAND = "record_recent_file";
const RECENT_FILES_FILE_NAME = "recent-files.json";
const RECENT_FILES_STORAGE_KEY = "kmark:state:recent-files:v1";

const recentFilesStore = createWebJsonStateStore<readonly RecentFile[]>({
  fileName: RECENT_FILES_FILE_NAME,
  storageKey: RECENT_FILES_STORAGE_KEY,
  normalize: normalizeRecentFilesState,
});

export async function loadRecentFiles(): Promise<readonly RecentFile[]> {
  if (isTauri()) {
    return invokeTauriCommand<RecentFile[]>(
      GET_RECENT_FILES_COMMAND,
      {},
      "最近開いたファイルの読込に失敗しました。",
    );
  }

  return recentFilesStore.load();
}

export async function recordRecentFile(recentFile: RecentFile): Promise<readonly RecentFile[]> {
  if (isTauri()) {
    return invokeTauriCommand<RecentFile[]>(
      RECORD_RECENT_FILE_COMMAND,
      { recentFile },
      "最近開いたファイルの保存に失敗しました。",
    );
  }

  const currentRecentFiles = await recentFilesStore.load();
  const nextRecentFilesText = await recordRecentFileWithWasm(
    JSON.stringify(currentRecentFiles),
    recentFile,
  );

  return recentFilesStore.persist(parseJsonPayload<RecentFile[]>(nextRecentFilesText));
}
