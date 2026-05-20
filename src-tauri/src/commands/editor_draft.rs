use tauri::{AppHandle, Runtime, State};

use super::error::CommandErrorPayload;
use crate::{dto::EditorDraftPayload, infra::persist_editor_draft, AppState};
use kmark_core::StoredEdit;

#[tauri::command]
pub fn get_editor_draft(
    state: State<'_, AppState>,
) -> Result<Option<EditorDraftPayload>, CommandErrorPayload> {
    let editor_draft = state
        .editor_draft
        .lock()
        .map_err(|_| CommandErrorPayload::state_poisoned("editor draft"))?;

    Ok(editor_draft.as_ref().map(EditorDraftPayload::from))
}

#[tauri::command]
pub fn set_editor_draft<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    editor_draft: EditorDraftPayload,
) -> Result<EditorDraftPayload, CommandErrorPayload> {
    let next_editor_draft = StoredEdit::from(editor_draft);

    {
        let mut current_editor_draft = state
            .editor_draft
            .lock()
            .map_err(|_| CommandErrorPayload::state_poisoned("editor draft"))?;
        *current_editor_draft = Some(next_editor_draft.clone());
    }

    persist_editor_draft(&app, &next_editor_draft).map_err(CommandErrorPayload::from)?;

    Ok(EditorDraftPayload::from(&next_editor_draft))
}
