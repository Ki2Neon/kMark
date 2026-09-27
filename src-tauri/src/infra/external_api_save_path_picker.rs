use std::path::PathBuf;

use kmark_application::{ApplicationError, ApplicationErrorCode};
use kmark_rest::SavePathPicker;
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;

pub(crate) struct TauriSavePathPicker<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> TauriSavePathPicker<R> {
    pub(crate) fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: Runtime> SavePathPicker for TauriSavePathPicker<R> {
    fn pick_save_path(
        &self,
        suggested_file_name: &str,
    ) -> Result<Option<PathBuf>, ApplicationError> {
        self.app
            .dialog()
            .file()
            .add_filter("Markdown", &["md", "markdown"])
            .set_file_name(suggested_file_name)
            .blocking_save_file()
            .map(|path| {
                path.into_path().map_err(|error| {
                    ApplicationError::new(
                        ApplicationErrorCode::IoFailed,
                        format!("failed to resolve selected save path: {error}"),
                    )
                })
            })
            .transpose()
    }
}
