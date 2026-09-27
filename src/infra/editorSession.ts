import {
  type ApplyEditorMutationBatchRequestPayload,
  type EditorMutationAckPayload,
  type EditorMutationBatchPayload,
  type DocumentSessionPayload,
  type MarkEditorSessionSavedRequestPayload,
} from "../contracts/generated";
import { invokeTauriCommand } from "./tauriCommand";

export function applyEditorMutationBatch(
  sessionId: string,
  batch: EditorMutationBatchPayload,
): Promise<EditorMutationAckPayload> {
  const request: ApplyEditorMutationBatchRequestPayload = {
    sessionId,
    batch,
  };
  return invokeTauriCommand(
    "apply_editor_mutation_batch",
    { request },
    "Editor変更を適用できませんでした。",
  );
}

export function markEditorSessionSaved(
  sessionId: string,
  fileName: string,
  filePath: string | null,
): Promise<DocumentSessionPayload> {
  const request: MarkEditorSessionSavedRequestPayload = {
    sessionId,
    fileName,
    filePath,
  };
  return invokeTauriCommand(
    "mark_editor_session_saved",
    { request },
    "Editor Sessionの保存状態を更新できませんでした。",
  );
}
