use std::{
    ffi::{OsStr, OsString},
    io,
    path::{Component, Path, PathBuf},
};

use kmark_core::is_supported_markdown_path;

use crate::ports::AssetRepository;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "ogg", "mov", "m4v"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImportedAssetKind {
    Image,
    Video,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportedMarkdownAsset {
    pub original_path: PathBuf,
    pub copied_path: PathBuf,
    pub relative_path: String,
    pub markdown_text: String,
    pub asset_kind: ImportedAssetKind,
}

#[derive(Debug, thiserror::Error)]
pub enum ImportMarkdownAssetsError {
    #[error("markdown asset import requires a saved markdown file")]
    MarkdownNotSaved,
    #[error("unsupported markdown file path: {0}")]
    UnsupportedMarkdownPath(String),
    #[error("markdown document folder not found: {0}")]
    MarkdownFolderNotFound(String),
    #[error("dropped file not found: {0}")]
    DroppedFileNotFound(String),
    #[error("dropped directories are not supported: {0}")]
    DroppedDirectoryUnsupported(String),
    #[error("unsupported dropped asset type: {0}")]
    UnsupportedAssetType(String),
    #[error("dropped asset file name is invalid: {0}")]
    InvalidDroppedFileName(String),
    #[error("asset file name collision could not be resolved: {0}")]
    DestinationNameExhausted(String),
    #[error("failed to copy dropped asset from {source_path} to {destination_path}: {source}")]
    CopyFailed {
        source_path: String,
        destination_path: String,
        source: io::Error,
    },
}

pub fn import_markdown_assets<R>(
    repository: &R,
    markdown_file_path: &Path,
    dropped_file_paths: &[PathBuf],
) -> Result<Vec<ImportedMarkdownAsset>, ImportMarkdownAssetsError>
where
    R: AssetRepository,
{
    validate_markdown_path(repository, markdown_file_path)?;
    let markdown_directory = resolve_markdown_directory(repository, markdown_file_path)?;
    let valid_source_paths = validate_dropped_asset_paths(repository, dropped_file_paths)?;

    valid_source_paths
        .iter()
        .map(|source_path| import_one_asset(repository, &markdown_directory, source_path))
        .collect()
}

fn validate_markdown_path<R>(
    repository: &R,
    markdown_file_path: &Path,
) -> Result<(), ImportMarkdownAssetsError>
where
    R: AssetRepository,
{
    if markdown_file_path.as_os_str().is_empty() {
        return Err(ImportMarkdownAssetsError::MarkdownNotSaved);
    }

    if !is_supported_markdown_path(markdown_file_path) {
        return Err(ImportMarkdownAssetsError::UnsupportedMarkdownPath(
            display_path(markdown_file_path),
        ));
    }

    if !repository.is_file(markdown_file_path) {
        return Err(ImportMarkdownAssetsError::MarkdownNotSaved);
    }

    Ok(())
}

fn resolve_markdown_directory<R>(
    repository: &R,
    markdown_file_path: &Path,
) -> Result<PathBuf, ImportMarkdownAssetsError>
where
    R: AssetRepository,
{
    let Some(markdown_directory) = markdown_file_path.parent() else {
        return Err(ImportMarkdownAssetsError::MarkdownFolderNotFound(
            display_path(markdown_file_path),
        ));
    };

    if !repository.is_dir(markdown_directory) {
        return Err(ImportMarkdownAssetsError::MarkdownFolderNotFound(
            display_path(markdown_directory),
        ));
    }

    Ok(markdown_directory.to_path_buf())
}

fn validate_dropped_asset_paths<R>(
    repository: &R,
    dropped_file_paths: &[PathBuf],
) -> Result<Vec<PathBuf>, ImportMarkdownAssetsError>
where
    R: AssetRepository,
{
    let mut valid_paths = Vec::with_capacity(dropped_file_paths.len());

    for dropped_file_path in dropped_file_paths {
        if repository.is_dir(dropped_file_path) {
            return Err(ImportMarkdownAssetsError::DroppedDirectoryUnsupported(
                display_path(dropped_file_path),
            ));
        }

        if !repository.is_file(dropped_file_path) {
            return Err(ImportMarkdownAssetsError::DroppedFileNotFound(
                display_path(dropped_file_path),
            ));
        }

        if imported_asset_kind_for_path(dropped_file_path).is_none() {
            return Err(ImportMarkdownAssetsError::UnsupportedAssetType(
                display_path(dropped_file_path),
            ));
        }

        valid_paths.push(dropped_file_path.to_path_buf());
    }

    Ok(valid_paths)
}

fn import_one_asset<R>(
    repository: &R,
    markdown_directory: &Path,
    source_path: &Path,
) -> Result<ImportedMarkdownAsset, ImportMarkdownAssetsError>
where
    R: AssetRepository,
{
    let file_name = source_path.file_name().ok_or_else(|| {
        ImportMarkdownAssetsError::InvalidDroppedFileName(display_path(source_path))
    })?;
    let direct_destination_path = markdown_directory.join(file_name);
    let copied_path =
        if should_reference_existing_destination(repository, source_path, &direct_destination_path)
        {
            direct_destination_path
        } else {
            copy_to_non_conflicting_path(repository, source_path, markdown_directory, file_name)?
        };
    let relative_path = to_markdown_relative_path(markdown_directory, &copied_path);
    let asset_kind = imported_asset_kind_for_path(source_path).ok_or_else(|| {
        ImportMarkdownAssetsError::UnsupportedAssetType(display_path(source_path))
    })?;

    Ok(ImportedMarkdownAsset {
        original_path: source_path.to_path_buf(),
        copied_path,
        relative_path: relative_path.clone(),
        markdown_text: format!("![]({})", markdown_destination(&relative_path)),
        asset_kind,
    })
}

fn copy_to_non_conflicting_path<R>(
    repository: &R,
    source_path: &Path,
    destination_directory: &Path,
    file_name: &OsStr,
) -> Result<PathBuf, ImportMarkdownAssetsError>
where
    R: AssetRepository,
{
    let mut index = 0_u32;

    loop {
        let candidate_path = numbered_destination_path(destination_directory, file_name, index);

        if repository.exists(&candidate_path) {
            index = index.checked_add(1).ok_or_else(|| {
                ImportMarkdownAssetsError::DestinationNameExhausted(display_path(source_path))
            })?;
            continue;
        }

        match repository.copy_new_file(source_path, &candidate_path) {
            Ok(()) => return Ok(candidate_path),
            Err(source) if source.kind() == io::ErrorKind::AlreadyExists => {
                index = index.checked_add(1).ok_or_else(|| {
                    ImportMarkdownAssetsError::DestinationNameExhausted(display_path(source_path))
                })?;
            }
            Err(source) => {
                return Err(ImportMarkdownAssetsError::CopyFailed {
                    source_path: display_path(source_path),
                    destination_path: display_path(&candidate_path),
                    source,
                });
            }
        }
    }
}

fn should_reference_existing_destination<R>(
    repository: &R,
    source: &Path,
    destination: &Path,
) -> bool
where
    R: AssetRepository,
{
    if is_same_existing_file(repository, source, destination) {
        return true;
    }

    repository.is_file(destination)
        && repository
            .has_same_file_content(source, destination)
            .unwrap_or(false)
}

fn is_same_existing_file<R>(repository: &R, left: &Path, right: &Path) -> bool
where
    R: AssetRepository,
{
    let Ok(left_path) = repository.canonicalize(left) else {
        return false;
    };
    let Ok(right_path) = repository.canonicalize(right) else {
        return false;
    };

    left_path == right_path
}

fn numbered_destination_path(
    destination_directory: &Path,
    file_name: &OsStr,
    index: u32,
) -> PathBuf {
    if index == 0 {
        return destination_directory.join(file_name);
    }

    let file_path = Path::new(file_name);
    let mut numbered_file_name = OsString::new();

    numbered_file_name.push(file_path.file_stem().unwrap_or(file_name));
    numbered_file_name.push(format!("_{index}"));

    if let Some(extension) = file_path.extension() {
        numbered_file_name.push(".");
        numbered_file_name.push(extension);
    }

    destination_directory.join(numbered_file_name)
}

fn is_image_path(path: &Path) -> bool {
    has_extension(path, IMAGE_EXTENSIONS)
}

fn is_video_path(path: &Path) -> bool {
    has_extension(path, VIDEO_EXTENSIONS)
}

fn imported_asset_kind_for_path(path: &Path) -> Option<ImportedAssetKind> {
    if is_image_path(path) {
        return Some(ImportedAssetKind::Image);
    }

    if is_video_path(path) {
        return Some(ImportedAssetKind::Video);
    }

    None
}

fn has_extension(path: &Path, extensions: &[&str]) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .map(|extension| {
            let lower_extension = extension.to_ascii_lowercase();
            extensions.contains(&lower_extension.as_str())
        })
        .unwrap_or(false)
}

fn to_markdown_relative_path(markdown_directory: &Path, copied_path: &Path) -> String {
    let relative_path = copied_path
        .strip_prefix(markdown_directory)
        .ok()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| {
            copied_path
                .file_name()
                .map(Path::new)
                .unwrap_or(copied_path)
        });
    let normalized_path = relative_path
        .components()
        .filter_map(markdown_component_text)
        .collect::<Vec<_>>()
        .join("/");

    if normalized_path.is_empty() {
        copied_path.to_string_lossy().replace('\\', "/")
    } else {
        normalized_path
    }
}

fn markdown_component_text(component: Component<'_>) -> Option<String> {
    match component {
        Component::Normal(value) => Some(value.to_string_lossy().into_owned()),
        Component::CurDir => Some(".".to_owned()),
        Component::ParentDir => Some("..".to_owned()),
        _ => None,
    }
}

fn markdown_destination(relative_path: &str) -> String {
    if !needs_angle_destination(relative_path) {
        return relative_path.to_owned();
    }

    format!(
        "<{}>",
        relative_path.replace('<', "%3C").replace('>', "%3E")
    )
}

fn needs_angle_destination(relative_path: &str) -> bool {
    relative_path
        .chars()
        .any(|value| value.is_whitespace() || matches!(value, '(' | ')' | '<' | '>'))
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::infra::FileSystemAssetRepository;

    use super::{import_markdown_assets, is_image_path, is_video_path, ImportedAssetKind};

    #[test]
    fn copies_image_next_to_markdown_and_returns_image_markdown() {
        let sandbox = create_temp_test_directory();
        let project = sandbox.join("project");
        let source = sandbox.join("source");
        fs::create_dir_all(&project).expect("failed to create project directory");
        fs::create_dir_all(&source).expect("failed to create source directory");
        let markdown_path = project.join("note.md");
        let image_path = source.join("logo.png");
        fs::write(&markdown_path, "# note").expect("failed to write markdown");
        fs::write(&image_path, "image").expect("failed to write image");

        let imported = import_markdown_assets(
            &FileSystemAssetRepository,
            &markdown_path,
            &[image_path.clone()],
        )
        .expect("asset import should succeed");

        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].relative_path, "logo.png");
        assert_eq!(imported[0].markdown_text, "![](logo.png)");
        assert_eq!(imported[0].asset_kind, ImportedAssetKind::Image);
        assert_eq!(
            fs::read(project.join("logo.png")).expect("failed to read copied image"),
            b"image"
        );
    }

    #[test]
    fn copies_video_next_to_markdown_and_returns_video_markdown() {
        let sandbox = create_temp_test_directory();
        let project = sandbox.join("project");
        let source = sandbox.join("source");
        fs::create_dir_all(&project).expect("failed to create project directory");
        fs::create_dir_all(&source).expect("failed to create source directory");
        let markdown_path = project.join("note.md");
        let video_path = source.join("demo.mp4");
        fs::write(&markdown_path, "# note").expect("failed to write markdown");
        fs::write(&video_path, "video").expect("failed to write video");

        let imported = import_markdown_assets(
            &FileSystemAssetRepository,
            &markdown_path,
            &[video_path.clone()],
        )
        .expect("asset import should succeed");

        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].relative_path, "demo.mp4");
        assert_eq!(imported[0].markdown_text, "![](demo.mp4)");
        assert_eq!(imported[0].asset_kind, ImportedAssetKind::Video);
        assert_eq!(
            fs::read(project.join("demo.mp4")).expect("failed to read copied video"),
            b"video"
        );
    }

    #[test]
    fn appends_number_when_destination_name_exists() {
        let sandbox = create_temp_test_directory();
        let project = sandbox.join("project");
        let source = sandbox.join("source");
        fs::create_dir_all(&project).expect("failed to create project directory");
        fs::create_dir_all(&source).expect("failed to create source directory");
        let markdown_path = project.join("note.md");
        let image_path = source.join("logo.png");
        fs::write(&markdown_path, "# note").expect("failed to write markdown");
        fs::write(project.join("logo.png"), "existing").expect("failed to write existing image");
        fs::write(&image_path, "new").expect("failed to write image");

        let imported = import_markdown_assets(
            &FileSystemAssetRepository,
            &markdown_path,
            &[image_path.clone()],
        )
        .expect("asset import should succeed");

        assert_eq!(imported[0].relative_path, "logo_1.png");
        assert_eq!(
            fs::read(project.join("logo.png")).expect("failed to read existing image"),
            b"existing"
        );
        assert_eq!(
            fs::read(project.join("logo_1.png")).expect("failed to read copied image"),
            b"new"
        );
    }

    #[test]
    fn references_same_named_existing_file_when_content_matches() {
        let sandbox = create_temp_test_directory();
        let project = sandbox.join("project");
        let source = sandbox.join("source");
        fs::create_dir_all(&project).expect("failed to create project directory");
        fs::create_dir_all(&source).expect("failed to create source directory");
        let markdown_path = project.join("note.md");
        let image_path = source.join("logo.png");
        fs::write(&markdown_path, "# note").expect("failed to write markdown");
        fs::write(project.join("logo.png"), "image").expect("failed to write existing image");
        fs::write(&image_path, "image").expect("failed to write image");

        let imported = import_markdown_assets(
            &FileSystemAssetRepository,
            &markdown_path,
            &[image_path.clone()],
        )
        .expect("asset import should succeed");

        assert_eq!(imported[0].relative_path, "logo.png");
        assert_eq!(imported[0].markdown_text, "![](logo.png)");
        assert_eq!(imported[0].copied_path, project.join("logo.png"));
        assert!(!project.join("logo_1.png").exists());
    }

    #[test]
    fn references_same_directory_file_without_copying() {
        let sandbox = create_temp_test_directory();
        let markdown_path = sandbox.join("note.md");
        let image_path = sandbox.join("logo.png");
        fs::write(&markdown_path, "# note").expect("failed to write markdown");
        fs::write(&image_path, "image").expect("failed to write image");

        let imported = import_markdown_assets(
            &FileSystemAssetRepository,
            &markdown_path,
            &[image_path.clone()],
        )
        .expect("asset import should succeed");

        assert_eq!(imported[0].relative_path, "logo.png");
        assert_eq!(imported[0].copied_path, image_path);
    }

    #[test]
    fn rejects_non_media_assets_for_initial_scope() {
        let sandbox = create_temp_test_directory();
        let markdown_path = sandbox.join("note.md");
        let pdf_path = sandbox.join("manual.pdf");
        fs::write(&markdown_path, "# note").expect("failed to write markdown");
        fs::write(&pdf_path, "pdf").expect("failed to write pdf");

        assert!(
            import_markdown_assets(&FileSystemAssetRepository, &markdown_path, &[pdf_path])
                .is_err()
        );
    }

    #[test]
    fn detects_supported_image_and_video_extensions_case_insensitively() {
        assert!(is_image_path(&PathBuf::from("PHOTO.WEBP")));
        assert!(is_image_path(&PathBuf::from("icon.SVG")));
        assert!(is_video_path(&PathBuf::from("movie.MP4")));
        assert!(is_video_path(&PathBuf::from("clip.WEBM")));
        assert!(!is_video_path(&PathBuf::from("movie.avi")));
    }

    #[test]
    fn wraps_markdown_destination_when_file_name_contains_spaces() {
        let sandbox = create_temp_test_directory();
        let markdown_path = sandbox.join("note.md");
        let image_path = sandbox.join("plot chart.png");
        fs::write(&markdown_path, "# note").expect("failed to write markdown");
        fs::write(&image_path, "image").expect("failed to write image");

        let imported =
            import_markdown_assets(&FileSystemAssetRepository, &markdown_path, &[image_path])
                .expect("asset import should succeed");

        assert_eq!(imported[0].relative_path, "plot chart.png");
        assert_eq!(imported[0].markdown_text, "![](<plot chart.png>)");
    }

    fn create_temp_test_directory() -> PathBuf {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let directory =
            std::env::temp_dir().join(format!("kmark-asset-import-test-{unique_suffix}"));
        fs::create_dir_all(&directory).expect("failed to create temp directory");
        directory
    }
}
