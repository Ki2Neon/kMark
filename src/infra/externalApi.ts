import {
  type DocumentSessionPayload,
  type ExternalApiPreferencesPayload,
  type ExternalApiRootPayload,
  type ExternalApiStatusPayload,
  type PendingExternalProposalsPayload,
} from "../contracts/generated";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";

export type ExternalDocumentSessionChangedEvent = {
  readonly sessionId: string;
  readonly revision: number;
};

export function getExternalApiPreferences(): Promise<ExternalApiPreferencesPayload> {
  return invokeTauriCommand(
    "get_external_api_preferences",
    {},
    "外部API設定を取得できませんでした。",
  );
}

export function setExternalApiPreferences(
  preferences: ExternalApiPreferencesPayload,
): Promise<ExternalApiPreferencesPayload> {
  return invokeTauriCommand(
    "set_external_api_preferences",
    { preferences },
    "外部API設定を保存できませんでした。",
  );
}

export function getExternalApiStatus(): Promise<ExternalApiStatusPayload> {
  return invokeTauriCommand(
    "get_external_api_status",
    {},
    "外部API状態を取得できませんでした。",
  );
}

export function pickExternalApiRoot(): Promise<ExternalApiRootPayload | null> {
  return invokeTauriCommand(
    "pick_external_api_root",
    {},
    "外部APIの公開Rootを選択できませんでした。",
  );
}

export function registerDocumentSession(input: {
  readonly fileName: string;
  readonly filePath: string | null;
  readonly content: string;
  readonly isDirty: boolean;
}): Promise<DocumentSessionPayload> {
  return invokeTauriCommand(
    "register_document_session",
    input,
    "Document Sessionを登録できませんでした。",
  );
}

export function attachDocumentSession(sessionId: string): Promise<DocumentSessionPayload> {
  return invokeTauriCommand(
    "attach_document_session",
    { sessionId },
    "Document Sessionへ接続できませんでした。",
  );
}

export function syncDocumentSession(input: {
  readonly sessionId: string;
  readonly expectedRevision: number;
  readonly fileName: string;
  readonly filePath: string | null;
  readonly content: string;
  readonly isDirty: boolean;
}): Promise<DocumentSessionPayload> {
  return invokeTauriCommand(
    "sync_document_session",
    input,
    "Document Sessionを同期できませんでした。",
  );
}

export function getDocumentSession(sessionId: string): Promise<DocumentSessionPayload> {
  return invokeTauriCommand(
    "get_document_session",
    { sessionId },
    "Document Sessionを取得できませんでした。",
  );
}

export function listenForDocumentSessionChanged(
  callback: (event: ExternalDocumentSessionChangedEvent) => void,
): Promise<() => void> {
  return listenTauriEvent("external-document-session-changed", callback);
}

export function getPendingExternalProposals(): Promise<PendingExternalProposalsPayload> {
  return invokeTauriCommand(
    "get_pending_external_proposals",
    {},
    "外部変更案を取得できませんでした。",
  );
}

export function listenForExternalProposalCreated(callback: () => void): Promise<() => void> {
  return listenTauriEvent("external-proposal-created", callback);
}

export function acceptExternalProposal(proposalId: string): Promise<DocumentSessionPayload> {
  return invokeTauriCommand(
    "accept_external_proposal",
    { proposalId },
    "外部変更案を適用できませんでした。",
  );
}

export function rejectExternalProposal(proposalId: string): Promise<void> {
  return invokeTauriCommand(
    "reject_external_proposal",
    { proposalId },
    "外部変更案を却下できませんでした。",
  );
}

export function commitStagedFileOperation(sessionId: string): Promise<DocumentSessionPayload> {
  return invokeTauriCommand(
    "commit_staged_file_operation",
    { sessionId },
    "File操作を確定できませんでした。",
  );
}

export function cancelStagedFileOperation(sessionId: string): Promise<DocumentSessionPayload> {
  return invokeTauriCommand(
    "cancel_staged_file_operation",
    { sessionId },
    "File操作を取消できませんでした。",
  );
}
