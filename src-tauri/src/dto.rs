use kmark_core::{
    DesktopLayoutPreferences, EditorPreferences, PreviewPreferences,
    PreviewWindowEditJumpRequest, PreviewWindowSnapshot, PreviewWindowState, StoredEdit,
    ThemePreferences,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePreferencesPayload {
    pub app_theme_id: String,
    pub preview_theme_id: Option<String>,
    pub preview_uses_app_theme_colors: bool,
}

impl From<ThemePreferencesPayload> for ThemePreferences {
    fn from(payload: ThemePreferencesPayload) -> Self {
        ThemePreferences::new(
            Some(&payload.app_theme_id),
            payload.preview_theme_id.as_deref(),
            Some(payload.preview_uses_app_theme_colors),
        )
    }
}

impl From<&ThemePreferences> for ThemePreferencesPayload {
    fn from(theme_preferences: &ThemePreferences) -> Self {
        Self {
            app_theme_id: theme_preferences.app_theme_id().as_str().to_owned(),
            preview_theme_id: theme_preferences.preview_theme_id().map(ToOwned::to_owned),
            preview_uses_app_theme_colors: theme_preferences.preview_uses_app_theme_colors(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLayoutPreferencesPayload {
    pub desktop_split_ratio: u32,
}

impl From<DesktopLayoutPreferencesPayload> for DesktopLayoutPreferences {
    fn from(payload: DesktopLayoutPreferencesPayload) -> Self {
        DesktopLayoutPreferences::new(Some(payload.desktop_split_ratio))
    }
}

impl From<&DesktopLayoutPreferences> for DesktopLayoutPreferencesPayload {
    fn from(desktop_layout_preferences: &DesktopLayoutPreferences) -> Self {
        Self {
            desktop_split_ratio: desktop_layout_preferences.desktop_split_ratio(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorPreferencesPayload {
    pub app_font_id: String,
    pub edit_font_id: String,
    pub edit_font_size_px: u32,
    pub multi_cursor_modifier: String,
    pub show_line_numbers: bool,
    pub startup_edit_mode: String,
    pub windows_startup_tray_resident_enabled: bool,
}

impl From<EditorPreferencesPayload> for EditorPreferences {
    fn from(payload: EditorPreferencesPayload) -> Self {
        EditorPreferences::new(
            Some(&payload.app_font_id),
            Some(&payload.edit_font_id),
            Some(payload.edit_font_size_px),
            Some(&payload.multi_cursor_modifier),
            Some(payload.show_line_numbers),
            Some(&payload.startup_edit_mode),
            Some(payload.windows_startup_tray_resident_enabled),
        )
    }
}

impl From<&EditorPreferences> for EditorPreferencesPayload {
    fn from(editor_preferences: &EditorPreferences) -> Self {
        Self {
            app_font_id: editor_preferences.app_font_id().to_owned(),
            edit_font_id: editor_preferences.edit_font_id().to_owned(),
            edit_font_size_px: editor_preferences.edit_font_size_px(),
            multi_cursor_modifier: editor_preferences.multi_cursor_modifier().as_str().to_owned(),
            show_line_numbers: editor_preferences.show_line_numbers(),
            startup_edit_mode: editor_preferences.startup_edit_mode().as_str().to_owned(),
            windows_startup_tray_resident_enabled: editor_preferences
                .windows_startup_tray_resident_enabled(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorDraftPayload {
    pub file_name: String,
    pub content: String,
    pub saved_at: Option<u64>,
}

impl From<EditorDraftPayload> for StoredEdit {
    fn from(payload: EditorDraftPayload) -> Self {
        StoredEdit::new(payload.file_name, payload.content, payload.saved_at)
    }
}

impl From<&StoredEdit> for EditorDraftPayload {
    fn from(stored_edit: &StoredEdit) -> Self {
        Self {
            file_name: stored_edit.file_name().to_owned(),
            content: stored_edit.content().to_owned(),
            saved_at: stored_edit.saved_at(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPreferencesPayload {
    pub preview_display_mode: String,
    pub is_preview_visible: bool,
}

impl From<PreviewPreferencesPayload> for PreviewPreferences {
    fn from(payload: PreviewPreferencesPayload) -> Self {
        PreviewPreferences::new(
            Some(&payload.preview_display_mode),
            Some(payload.is_preview_visible),
        )
    }
}

impl From<&PreviewPreferences> for PreviewPreferencesPayload {
    fn from(preview_preferences: &PreviewPreferences) -> Self {
        Self {
            preview_display_mode: preview_preferences
                .preview_display_mode()
                .as_str()
                .to_owned(),
            is_preview_visible: preview_preferences.is_preview_visible(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewWindowSnapshotPayload {
    pub content: String,
    pub file_name: String,
    pub file_path: Option<String>,
}

impl From<PreviewWindowSnapshotPayload> for PreviewWindowSnapshot {
    fn from(payload: PreviewWindowSnapshotPayload) -> Self {
        PreviewWindowSnapshot::new(payload.content, payload.file_name, payload.file_path)
    }
}

impl From<&PreviewWindowSnapshot> for PreviewWindowSnapshotPayload {
    fn from(preview_window_snapshot: &PreviewWindowSnapshot) -> Self {
        Self {
            content: preview_window_snapshot.content().to_owned(),
            file_name: preview_window_snapshot.file_name().to_owned(),
            file_path: preview_window_snapshot.file_path().map(ToOwned::to_owned),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewWindowStatePayload {
    pub snapshot: PreviewWindowSnapshotPayload,
    pub active_source_line: Option<u32>,
}

impl From<PreviewWindowStatePayload> for PreviewWindowState {
    fn from(payload: PreviewWindowStatePayload) -> Self {
        PreviewWindowState::new(payload.snapshot.into(), payload.active_source_line)
    }
}

impl From<&PreviewWindowState> for PreviewWindowStatePayload {
    fn from(preview_window_state: &PreviewWindowState) -> Self {
        Self {
            snapshot: PreviewWindowSnapshotPayload::from(preview_window_state.snapshot()),
            active_source_line: preview_window_state.active_source_line(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewWindowEditJumpRequestPayload {
    pub line_number: u32,
    pub request_id: u64,
}

impl From<&PreviewWindowEditJumpRequest> for PreviewWindowEditJumpRequestPayload {
    fn from(preview_window_edit_jump_request: &PreviewWindowEditJumpRequest) -> Self {
        Self {
            line_number: preview_window_edit_jump_request.line_number(),
            request_id: preview_window_edit_jump_request.request_id(),
        }
    }
}
