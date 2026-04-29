use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PreviewDisplayMode {
    #[serde(rename = "standard")]
    Standard,
    #[serde(rename = "a4")]
    A4,
}

impl Default for PreviewDisplayMode {
    fn default() -> Self {
        Self::Standard
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPreferences {
    pub preview_display_mode: PreviewDisplayMode,
    pub is_preview_visible: bool,
}

impl Default for PreviewPreferences {
    fn default() -> Self {
        Self {
            preview_display_mode: PreviewDisplayMode::Standard,
            is_preview_visible: true,
        }
    }
}
