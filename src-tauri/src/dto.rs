pub use kmark_contract::{
    recent_file_from_payload, recent_file_payloads_from_recent_files, recent_files_from_payloads,
    DesktopLayoutPreferencesPayload, DocumentSessionPayload, EditorDraftPayload,
    EditorPreferencesPayload, ExternalApiPreferencesPayload, ExternalApiRootPayload,
    ExternalApiStatusPayload, ExternalProposalReviewPayload, FinalizeGeneratedSvgRequestPayload,
    FinalizeGeneratedSvgResultPayload, PendingExternalProposalsPayload, PreviewPreferencesPayload,
    RecentFilePayload, RegisterSubWindowSourceResponsePayload, StagedFileOperationPayload,
    SubWindowResolvedSourceStatePayload, SubWindowSelectionPayload,
    SubWindowSourceLineSelectionRequestPayload, SubWindowSourceStateChangedPayload,
    SubWindowSourceSummaryPayload, SubWindowSourcesSnapshotPayload, SubWindowStatePayload,
    ThemePreferencesPayload,
};

#[cfg(test)]
mod tests {
    use super::{EditorPreferencesPayload, PreviewPreferencesPayload};

    #[test]
    fn defaults_legacy_editor_preferences_to_line_wrapping() {
        let payload = serde_json::from_str::<EditorPreferencesPayload>(
            r#"{
                "appFontId": "Aptos",
                "editFontId": "Iosevka Term",
                "systemFontSizePx": 16,
                "editFontSizePx": 15,
                "multiCursorModifier": "alt",
                "showLineNumbers": false,
                "startupEditMode": "start-page",
                "windowsStartupTrayResidentEnabled": true
            }"#,
        )
        .expect("legacy editor preferences should deserialize");

        assert!(payload.line_wrapping_enabled);
    }

    #[test]
    fn defaults_legacy_preview_preferences_to_empty_plantuml_host_list() {
        let payload = serde_json::from_str::<PreviewPreferencesPayload>(
            r#"{"previewDisplayMode":"standard","isPreviewVisible":true}"#,
        )
        .expect("legacy preview preferences should deserialize");

        assert!(payload.plantuml_https_hosts.is_empty());
    }
}
