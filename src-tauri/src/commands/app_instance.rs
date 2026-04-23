#[tauri::command]
pub fn current_app_instance_id() -> String {
    format!("process-{}", std::process::id())
}