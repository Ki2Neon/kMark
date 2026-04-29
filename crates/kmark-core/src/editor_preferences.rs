pub type AppFontId = String;
pub type EditFontId = String;

pub const DEFAULT_EDIT_FONT_SIZE_PX: u32 = 15;
pub const MIN_EDIT_FONT_SIZE_PX: u32 = 10;
pub const MAX_EDIT_FONT_SIZE_PX: u32 = 36;

const DEFAULT_APP_FONT_ID: &str = "Aptos";
const DEFAULT_EDIT_FONT_ID: &str = "Iosevka Term";
const DEFAULT_APP_FONT_FAMILY: &str = "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif";
const DEFAULT_EDIT_FONT_FAMILY: &str =
    "\"Iosevka Term\", \"Cascadia Code\", Consolas, monospace";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MultiCursorModifier {
    Alt,
    CtrlCmd,
}

impl Default for MultiCursorModifier {
    fn default() -> Self {
        Self::Alt
    }
}

impl MultiCursorModifier {
    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "alt" => Some(Self::Alt),
            "ctrlCmd" => Some(Self::CtrlCmd),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Alt => "alt",
            Self::CtrlCmd => "ctrlCmd",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartupEditMode {
    StartPage,
    Blank,
    LastOpenedFile,
}

impl Default for StartupEditMode {
    fn default() -> Self {
        Self::LastOpenedFile
    }
}

impl StartupEditMode {
    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "start-page" => Some(Self::StartPage),
            "blank" => Some(Self::Blank),
            "last-opened-file" => Some(Self::LastOpenedFile),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::StartPage => "start-page",
            Self::Blank => "blank",
            Self::LastOpenedFile => "last-opened-file",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditorPreferences {
    app_font_id: AppFontId,
    edit_font_id: EditFontId,
    edit_font_size_px: u32,
    multi_cursor_modifier: MultiCursorModifier,
    show_line_numbers: bool,
    startup_edit_mode: StartupEditMode,
    windows_startup_tray_resident_enabled: bool,
}

impl Default for EditorPreferences {
    fn default() -> Self {
        Self {
            app_font_id: DEFAULT_APP_FONT_ID.to_owned(),
            edit_font_id: DEFAULT_EDIT_FONT_ID.to_owned(),
            edit_font_size_px: DEFAULT_EDIT_FONT_SIZE_PX,
            multi_cursor_modifier: MultiCursorModifier::Alt,
            show_line_numbers: false,
            startup_edit_mode: StartupEditMode::LastOpenedFile,
            windows_startup_tray_resident_enabled: true,
        }
    }
}

impl EditorPreferences {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        app_font_id: Option<&str>,
        edit_font_id: Option<&str>,
        edit_font_size_px: Option<u32>,
        multi_cursor_modifier: Option<&str>,
        show_line_numbers: Option<bool>,
        startup_edit_mode: Option<&str>,
        windows_startup_tray_resident_enabled: Option<bool>,
    ) -> Self {
        let defaults = Self::default();

        Self {
            app_font_id: normalize_font_id(app_font_id, DEFAULT_APP_FONT_ID, &[
                ("aptos", "Aptos"),
                ("segoe-ui", "Segoe UI"),
                ("yu-gothic", "Yu Gothic UI"),
                ("meiryo", "Meiryo"),
                ("biz-udp", "BIZ UDPGothic"),
            ]),
            edit_font_id: normalize_font_id(edit_font_id, DEFAULT_EDIT_FONT_ID, &[
                ("iosevka", "Iosevka Term"),
                ("cascadia", "Cascadia Code"),
                ("consolas", "Consolas"),
                ("aptos", "Aptos"),
                ("yu-gothic", "Yu Gothic UI"),
                ("meiryo", "Meiryo"),
            ]),
            edit_font_size_px: clamp_edit_font_size_px(
                edit_font_size_px.unwrap_or(defaults.edit_font_size_px),
            ),
            multi_cursor_modifier: multi_cursor_modifier
                .and_then(MultiCursorModifier::from_str)
                .unwrap_or(defaults.multi_cursor_modifier),
            show_line_numbers: show_line_numbers.unwrap_or(defaults.show_line_numbers),
            startup_edit_mode: startup_edit_mode
                .and_then(StartupEditMode::from_str)
                .unwrap_or(defaults.startup_edit_mode),
            windows_startup_tray_resident_enabled: windows_startup_tray_resident_enabled
                .unwrap_or(defaults.windows_startup_tray_resident_enabled),
        }
    }

    pub fn app_font_id(&self) -> &str {
        &self.app_font_id
    }

    pub fn edit_font_id(&self) -> &str {
        &self.edit_font_id
    }

    pub fn edit_font_size_px(&self) -> u32 {
        self.edit_font_size_px
    }

    pub fn multi_cursor_modifier(&self) -> MultiCursorModifier {
        self.multi_cursor_modifier
    }

    pub fn show_line_numbers(&self) -> bool {
        self.show_line_numbers
    }

    pub fn startup_edit_mode(&self) -> StartupEditMode {
        self.startup_edit_mode
    }

    pub fn windows_startup_tray_resident_enabled(&self) -> bool {
        self.windows_startup_tray_resident_enabled
    }
}

pub fn resolve_app_font_family(app_font_id: &str) -> String {
    resolve_known_font_family(
        app_font_id,
        &[
            ("aptos", DEFAULT_APP_FONT_FAMILY),
            (
                "segoe ui",
                "\"Segoe UI Variable\", \"Segoe UI\", sans-serif",
            ),
            (
                "segoe ui variable",
                "\"Segoe UI Variable\", \"Segoe UI\", sans-serif",
            ),
            ("yu gothic ui", "\"Yu Gothic UI\", \"Yu Gothic\", sans-serif"),
            ("meiryo", "\"Meiryo\", sans-serif"),
            (
                "biz udpgothic",
                "\"BIZ UDPGothic\", \"Yu Gothic UI\", sans-serif",
            ),
            (
                "biz udp gothic",
                "\"BIZ UDPGothic\", \"Yu Gothic UI\", sans-serif",
            ),
            ("noto sans jp", "\"Noto Sans JP\", sans-serif"),
            ("inter", "Inter, \"Segoe UI Variable\", \"Segoe UI\", sans-serif"),
            ("sans-serif", "sans-serif"),
            ("serif", "serif"),
            ("monospace", "monospace"),
        ],
        DEFAULT_APP_FONT_FAMILY,
    )
}

pub fn resolve_edit_font_family(edit_font_id: &str) -> String {
    resolve_known_font_family(
        edit_font_id,
        &[
            ("iosevka term", DEFAULT_EDIT_FONT_FAMILY),
            ("cascadia code", "\"Cascadia Code\", Consolas, monospace"),
            ("consolas", "\"Consolas\", \"Courier New\", monospace"),
            ("aptos", DEFAULT_APP_FONT_FAMILY),
            ("yu gothic ui", "\"Yu Gothic UI\", \"Yu Gothic\", sans-serif"),
            ("meiryo", "\"Meiryo\", sans-serif"),
            ("fira code", "\"Fira Code\", Consolas, monospace"),
            ("jetbrains mono", "\"JetBrains Mono\", Consolas, monospace"),
            ("monospace", "monospace"),
            ("sans-serif", "sans-serif"),
        ],
        DEFAULT_EDIT_FONT_FAMILY,
    )
}

pub fn sanitize_font_preference(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len());
    let mut previous_was_whitespace = false;

    for character in value.chars() {
        let normalized = match character {
            '\u{0000}'..='\u{001f}' | ';' => ' ',
            _ => character,
        };

        if normalized.is_whitespace() {
            if !previous_was_whitespace {
                sanitized.push(' ');
            }
            previous_was_whitespace = true;
            continue;
        }

        sanitized.push(normalized);
        previous_was_whitespace = false;
    }

    sanitized.trim().to_owned()
}

fn normalize_font_id(
    value: Option<&str>,
    fallback: &str,
    legacy_values: &[(&str, &str)],
) -> String {
    let Some(value) = value else {
        return fallback.to_owned();
    };

    let sanitized = sanitize_font_preference(value);
    if sanitized.is_empty() {
        return fallback.to_owned();
    }

    let normalized = sanitized.to_ascii_lowercase();
    legacy_values
        .iter()
        .find_map(|(legacy_value, display_value)| {
            if normalized == *legacy_value {
                Some((*display_value).to_owned())
            } else {
                None
            }
        })
        .unwrap_or(sanitized)
}

fn clamp_edit_font_size_px(value: u32) -> u32 {
    value.clamp(MIN_EDIT_FONT_SIZE_PX, MAX_EDIT_FONT_SIZE_PX)
}

fn normalize_font_family(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\'') {
        return value.to_owned();
    }

    if value.chars().any(char::is_whitespace) {
        format!("\"{value}\"")
    } else {
        value.to_owned()
    }
}

fn resolve_known_font_family(
    value: &str,
    known_families: &[(&str, &str)],
    fallback: &str,
) -> String {
    let sanitized_value = sanitize_font_preference(value);

    if sanitized_value.is_empty() {
        return fallback.to_owned();
    }

    let normalized_value = sanitized_value.to_ascii_lowercase();
    known_families
        .iter()
        .find_map(|(key, family)| {
            if normalized_value == *key {
                Some((*family).to_owned())
            } else {
                None
            }
        })
        .unwrap_or_else(|| normalize_font_family(&sanitized_value))
}

#[cfg(test)]
mod tests {
    use super::{resolve_app_font_family, resolve_edit_font_family, sanitize_font_preference};

    #[test]
    fn sanitizes_font_preference() {
        assert_eq!(sanitize_font_preference("  Aptos;\n"), "Aptos");
    }

    #[test]
    fn resolves_font_families() {
        assert_eq!(
            resolve_app_font_family("aptos"),
            "\"Aptos\", \"Segoe UI Variable\", \"Segoe UI\", sans-serif"
        );
        assert_eq!(
            resolve_edit_font_family("JetBrains Mono"),
            "\"JetBrains Mono\", Consolas, monospace"
        );
    }
}
