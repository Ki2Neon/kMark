use crate::infra::take_json_state_recovery_notices;

#[tauri::command]
pub fn take_state_recovery_notices() -> Vec<String> {
    take_json_state_recovery_notices()
}
