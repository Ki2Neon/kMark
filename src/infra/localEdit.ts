import { type StoredEdit } from "../domain/editor";
import { createWebJsonStateStore } from "./webStateStore";
import { invokeTauriCommand } from "./tauriCommand";
import { isTauri } from "@tauri-apps/api/core";
import { normalizeEditorDraftState } from "./webStateNormalization";

const GET_EDITOR_DRAFT_COMMAND = "get_editor_draft";
const SET_EDITOR_DRAFT_COMMAND = "set_editor_draft";
const EDITOR_DRAFT_FILE_NAME = "editor-draft.json";
const EDITOR_DRAFT_STORAGE_KEY = "kmark:state:editor-draft:v2";

const editorDraftStore = createWebJsonStateStore<StoredEdit | null>({
  fileName: EDITOR_DRAFT_FILE_NAME,
  storageKey: EDITOR_DRAFT_STORAGE_KEY,
  normalize: normalizeEditorDraftState,
});

export async function loadLocalEdit(): Promise<StoredEdit | null> {
  if (isTauri()) {
    return invokeTauriCommand<StoredEdit | null>(
      GET_EDITOR_DRAFT_COMMAND,
      {},
      "下書きの読込に失敗しました。",
    );
  }

  return editorDraftStore.load();
}

export async function persistLocalEdit(edit: StoredEdit): Promise<void> {
  if (isTauri()) {
    await invokeTauriCommand<StoredEdit>(
      SET_EDITOR_DRAFT_COMMAND,
      { editorDraft: edit },
      "下書きの保存に失敗しました。",
    );
    return;
  }

  await editorDraftStore.persist(edit);
}
