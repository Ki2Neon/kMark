#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreviewDisplayMode {
    Standard,
    A4,
}

impl Default for PreviewDisplayMode {
    fn default() -> Self {
        Self::Standard
    }
}

impl PreviewDisplayMode {
    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "standard" => Some(Self::Standard),
            "a4" => Some(Self::A4),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Standard => "standard",
            Self::A4 => "a4",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreviewPreferences {
    preview_display_mode: PreviewDisplayMode,
    is_preview_visible: bool,
}

impl Default for PreviewPreferences {
    fn default() -> Self {
        Self {
            preview_display_mode: PreviewDisplayMode::Standard,
            is_preview_visible: true,
        }
    }
}

impl PreviewPreferences {
    pub fn new(preview_display_mode: Option<&str>, is_preview_visible: Option<bool>) -> Self {
        let defaults = Self::default();

        Self {
            preview_display_mode: preview_display_mode
                .and_then(PreviewDisplayMode::from_str)
                .unwrap_or(defaults.preview_display_mode),
            is_preview_visible: is_preview_visible.unwrap_or(defaults.is_preview_visible),
        }
    }

    pub fn preview_display_mode(&self) -> PreviewDisplayMode {
        self.preview_display_mode
    }

    pub fn is_preview_visible(&self) -> bool {
        self.is_preview_visible
    }
}
