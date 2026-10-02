use std::path::PathBuf;

#[cfg(not(feature = "e2e"))]
use tauri::Manager;
use tauri::{AppHandle, Runtime};

/// Resolves infrastructure state storage. E2E builds require an isolated workspace.
pub(crate) fn app_config_dir<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
    #[cfg(feature = "e2e")]
    {
        let _ = app;
        return std::env::var_os("KMARK_E2E_DATA_DIR")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .ok_or(tauri::Error::UnknownPath);
    }

    #[cfg(not(feature = "e2e"))]
    app.path().app_config_dir()
}
