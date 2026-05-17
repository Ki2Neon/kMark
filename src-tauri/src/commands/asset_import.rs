use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use super::error::CommandErrorPayload;
use crate::{
    usecase::{
        import_markdown_assets,
        list_markdown_path_suggestions as list_markdown_path_suggestions_usecase,
        ImportMarkdownAssetsError, ImportedAssetKind, MarkdownPathSuggestionEntryKind,
        MarkdownPathSuggestionFilter,
    },
    AppState,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedMarkdownAssetPayload {
    original_path: String,
    copied_path: String,
    relative_path: String,
    markdown_text: String,
    asset_kind: ImportedAssetKindPayload,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportedAssetKindPayload {
    Image,
    Video,
    Model,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum MarkdownPathSuggestionFilterPayload {
    All,
    Extensions { extensions: Vec<String> },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MarkdownPathSuggestionEntryKindPayload {
    Directory,
    File,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownPathSuggestionPayload {
    label: String,
    insert_text: String,
    relative_path: String,
    entry_kind: MarkdownPathSuggestionEntryKindPayload,
}

impl From<ImportedAssetKind> for ImportedAssetKindPayload {
    fn from(asset_kind: ImportedAssetKind) -> Self {
        match asset_kind {
            ImportedAssetKind::Image => Self::Image,
            ImportedAssetKind::Video => Self::Video,
            ImportedAssetKind::Model => Self::Model,
        }
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

impl From<MarkdownPathSuggestionEntryKind> for MarkdownPathSuggestionEntryKindPayload {
    fn from(entry_kind: MarkdownPathSuggestionEntryKind) -> Self {
        match entry_kind {
            MarkdownPathSuggestionEntryKind::Directory => Self::Directory,
            MarkdownPathSuggestionEntryKind::File => Self::File,
        }
    }
}

impl From<crate::usecase::MarkdownPathSuggestion> for MarkdownPathSuggestionPayload {
    fn from(suggestion: crate::usecase::MarkdownPathSuggestion) -> Self {
        Self {
            label: suggestion.label,
            insert_text: suggestion.insert_text,
            relative_path: suggestion.relative_path,
            entry_kind: suggestion.entry_kind.into(),
        }
    }
}

impl From<crate::usecase::ImportedMarkdownAsset> for ImportedMarkdownAssetPayload {
    fn from(asset: crate::usecase::ImportedMarkdownAsset) -> Self {
        Self {
            original_path: asset.original_path.to_string_lossy().into_owned(),
            copied_path: asset.copied_path.to_string_lossy().into_owned(),
            relative_path: asset.relative_path,
            markdown_text: asset.markdown_text,
            asset_kind: asset.asset_kind.into(),
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
        .map(|assets| assets.into_iter().map(Into::into).collect())
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
    .map(Into::into)
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
                "現在ドロップできるアセットは画像、動画、3Dモデルファイルのみです。",
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
        }
    }
}

fn file_name_or_path(path: &str) -> &str {
    path.rsplit(['/', '\\'])
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or(path)
}
