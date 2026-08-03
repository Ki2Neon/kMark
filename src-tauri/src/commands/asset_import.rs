use std::path::PathBuf;

use kmark_contract::{
    ImportedAssetKindPayload, ImportedMarkdownAssetPayload, MarkdownAssetDataPayload,
    MarkdownPathSuggestionEntryKindPayload, MarkdownPathSuggestionFilterPayload,
    MarkdownPathSuggestionPayload,
};
use tauri::State;

use super::error::CommandErrorPayload;
use crate::{
    usecase::{
        import_markdown_asset_data as import_markdown_asset_data_usecase, import_markdown_assets,
        list_markdown_path_suggestions as list_markdown_path_suggestions_usecase,
        ImportMarkdownAssetsError, ImportedAssetKind, MarkdownAssetData,
        MarkdownPathSuggestionEntryKind, MarkdownPathSuggestionFilter,
    },
    AppState,
};

fn imported_asset_kind_payload(asset_kind: ImportedAssetKind) -> ImportedAssetKindPayload {
    match asset_kind {
        ImportedAssetKind::Image => ImportedAssetKindPayload::Image,
        ImportedAssetKind::Video => ImportedAssetKindPayload::Video,
        ImportedAssetKind::Model => ImportedAssetKindPayload::Model,
    }
}

impl From<MarkdownPathSuggestionFilterPayload> for MarkdownPathSuggestionFilter {
    fn from(payload: MarkdownPathSuggestionFilterPayload) -> Self {
        match payload {
            MarkdownPathSuggestionFilterPayload::All => Self::All,
            MarkdownPathSuggestionFilterPayload::Extensions { extensions } => {
                Self::Extensions(extensions)
            }
        }
    }
}

fn markdown_path_suggestion_entry_kind_payload(
    entry_kind: MarkdownPathSuggestionEntryKind,
) -> MarkdownPathSuggestionEntryKindPayload {
    match entry_kind {
        MarkdownPathSuggestionEntryKind::Directory => {
            MarkdownPathSuggestionEntryKindPayload::Directory
        }
        MarkdownPathSuggestionEntryKind::File => MarkdownPathSuggestionEntryKindPayload::File,
    }
}

fn markdown_path_suggestion_payload(
    suggestion: crate::usecase::MarkdownPathSuggestion,
) -> MarkdownPathSuggestionPayload {
    MarkdownPathSuggestionPayload {
        label: suggestion.label,
        insert_text: suggestion.insert_text,
        relative_path: suggestion.relative_path,
        entry_kind: markdown_path_suggestion_entry_kind_payload(suggestion.entry_kind),
    }
}

fn imported_markdown_asset_payload(
    asset: crate::usecase::ImportedMarkdownAsset,
) -> ImportedMarkdownAssetPayload {
    ImportedMarkdownAssetPayload {
        original_path: asset.original_path.to_string_lossy().into_owned(),
        copied_path: asset.copied_path.to_string_lossy().into_owned(),
        relative_path: asset.relative_path,
        markdown_text: asset.markdown_text,
        asset_kind: imported_asset_kind_payload(asset.asset_kind),
    }
}

impl From<MarkdownAssetDataPayload> for MarkdownAssetData {
    fn from(payload: MarkdownAssetDataPayload) -> Self {
        Self {
            file_name: payload.file_name,
            mime_type: payload.mime_type,
            bytes: payload.bytes,
        }
    }
}

#[tauri::command]
pub fn import_markdown_asset_files(
    state: State<'_, AppState>,
    markdown_file_path: String,
    dropped_file_paths: Vec<String>,
) -> Result<Vec<ImportedMarkdownAssetPayload>, CommandErrorPayload> {
    let markdown_path = PathBuf::from(markdown_file_path);
    let dropped_paths = dropped_file_paths
        .into_iter()
        .map(PathBuf::from)
        .collect::<Vec<_>>();

    import_markdown_assets(&state.asset_repository, &markdown_path, &dropped_paths)
        .map(|assets| {
            assets
                .into_iter()
                .map(imported_markdown_asset_payload)
                .collect()
        })
        .map_err(CommandErrorPayload::from)
}

#[tauri::command]
pub fn import_markdown_asset_data(
    state: State<'_, AppState>,
    markdown_file_path: String,
    files: Vec<MarkdownAssetDataPayload>,
) -> Result<Vec<ImportedMarkdownAssetPayload>, CommandErrorPayload> {
    let markdown_path = PathBuf::from(markdown_file_path);
    let files = files.into_iter().map(Into::into).collect::<Vec<_>>();

    import_markdown_asset_data_usecase(&state.asset_repository, &markdown_path, &files)
        .map(|assets| {
            assets
                .into_iter()
                .map(imported_markdown_asset_payload)
                .collect()
        })
        .map_err(CommandErrorPayload::from)
}

#[tauri::command]
pub fn list_markdown_path_suggestions(
    state: State<'_, AppState>,
    markdown_file_path: String,
    input: String,
    filter: MarkdownPathSuggestionFilterPayload,
) -> Vec<MarkdownPathSuggestionPayload> {
    let markdown_path = PathBuf::from(markdown_file_path);

    list_markdown_path_suggestions_usecase(
        &state.asset_repository,
        &markdown_path,
        &input,
        filter.into(),
    )
    .into_iter()
    .map(markdown_path_suggestion_payload)
    .collect()
}

impl From<ImportMarkdownAssetsError> for CommandErrorPayload {
    fn from(error: ImportMarkdownAssetsError) -> Self {
        match error {
            ImportMarkdownAssetsError::MarkdownNotSaved => Self::new(
                "markdown_not_saved",
                "アセットを取り込むには、先にMarkdownファイルを保存してください。",
            ),
            ImportMarkdownAssetsError::UnsupportedMarkdownPath(path) => Self::with_detail(
                "unsupported_markdown_path",
                "保存済みMarkdownファイルのパスが無効です。",
                path,
            ),
            ImportMarkdownAssetsError::MarkdownFolderNotFound(path) => Self::with_detail(
                "markdown_folder_not_found",
                "Markdownファイルのフォルダーが見つかりません。",
                path,
            ),
            ImportMarkdownAssetsError::DroppedFileNotFound(path) => Self::with_detail(
                "dropped_file_not_found",
                "ドロップされたファイルが見つかりません。",
                path,
            ),
            ImportMarkdownAssetsError::DroppedDirectoryUnsupported(path) => Self::with_detail(
                "dropped_directory_unsupported",
                "フォルダのドロップにはまだ対応していません。",
                path,
            ),
            ImportMarkdownAssetsError::UnsupportedAssetType(path) => Self::with_detail(
                "unsupported_asset_type",
                "現在取り込めるアセットは画像、動画、3Dモデルファイルのみです。",
                path,
            ),
            ImportMarkdownAssetsError::InvalidDroppedFileName(path) => Self::with_detail(
                "invalid_dropped_file_name",
                "アセットのファイル名を解決できません。",
                path,
            ),
            ImportMarkdownAssetsError::DestinationNameExhausted(path) => Self::with_detail(
                "asset_destination_name_exhausted",
                "重複しないアセット名を生成できません。",
                path,
            ),
            ImportMarkdownAssetsError::CopyFailed {
                source_path,
                destination_path,
                source,
            } => Self::with_detail(
                "asset_copy_failed",
                format!(
                    "アセットのコピーに失敗しました: {}",
                    file_name_or_path(&source_path)
                ),
                format!("{source_path} -> {destination_path}: {source}"),
            ),
            ImportMarkdownAssetsError::WriteFailed {
                file_name,
                destination_path,
                source,
            } => Self::with_detail(
                "asset_write_failed",
                format!("アセットの書き込みに失敗しました: {file_name}"),
                format!("{destination_path}: {source}"),
            ),
        }
    }
}

fn file_name_or_path(path: &str) -> &str {
    path.rsplit(['/', '\\'])
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or(path)
}
