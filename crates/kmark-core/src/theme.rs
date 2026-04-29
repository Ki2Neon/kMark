#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppThemeId {
    VscodeDark,
    VscodeLight,
    GithubDark,
    GithubLight,
    Dracula,
    NightOwl,
    Monokai,
    Paper,
}

impl Default for AppThemeId {
    fn default() -> Self {
        Self::VscodeDark
    }
}

impl AppThemeId {
    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "vscode-dark" => Some(Self::VscodeDark),
            "vscode-light" => Some(Self::VscodeLight),
            "github-dark" => Some(Self::GithubDark),
            "github-light" => Some(Self::GithubLight),
            "dracula" => Some(Self::Dracula),
            "night-owl" => Some(Self::NightOwl),
            "monokai" => Some(Self::Monokai),
            "paper" => Some(Self::Paper),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::VscodeDark => "vscode-dark",
            Self::VscodeLight => "vscode-light",
            Self::GithubDark => "github-dark",
            Self::GithubLight => "github-light",
            Self::Dracula => "dracula",
            Self::NightOwl => "night-owl",
            Self::Monokai => "monokai",
            Self::Paper => "paper",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ThemePreferences {
    app_theme_id: AppThemeId,
    preview_theme_id: Option<String>,
    preview_uses_app_theme_colors: bool,
}

impl Default for ThemePreferences {
    fn default() -> Self {
        Self {
            app_theme_id: AppThemeId::VscodeDark,
            preview_theme_id: None,
            preview_uses_app_theme_colors: false,
        }
    }
}

impl ThemePreferences {
    pub fn new(
        app_theme_id: Option<&str>,
        preview_theme_id: Option<&str>,
        preview_uses_app_theme_colors: Option<bool>,
    ) -> Self {
        let defaults = Self::default();

        Self {
            app_theme_id: app_theme_id
                .and_then(AppThemeId::from_str)
                .unwrap_or(defaults.app_theme_id),
            preview_theme_id: preview_theme_id
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned),
            preview_uses_app_theme_colors: preview_uses_app_theme_colors
                .unwrap_or(defaults.preview_uses_app_theme_colors),
        }
    }

    pub fn app_theme_id(&self) -> AppThemeId {
        self.app_theme_id
    }

    pub fn preview_theme_id(&self) -> Option<&str> {
        self.preview_theme_id.as_deref()
    }

    pub fn preview_uses_app_theme_colors(&self) -> bool {
        self.preview_uses_app_theme_colors
    }
}
