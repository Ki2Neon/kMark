pub const DEFAULT_DESKTOP_SPLIT_RATIO: u32 = 50;
pub const MIN_DESKTOP_SPLIT_RATIO: u32 = 20;
pub const MAX_DESKTOP_SPLIT_RATIO: u32 = 80;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DesktopLayoutPreferences {
    desktop_split_ratio: u32,
}

impl Default for DesktopLayoutPreferences {
    fn default() -> Self {
        Self {
            desktop_split_ratio: DEFAULT_DESKTOP_SPLIT_RATIO,
        }
    }
}

impl DesktopLayoutPreferences {
    pub fn new(desktop_split_ratio: Option<u32>) -> Self {
        match desktop_split_ratio {
            Some(value) if (MIN_DESKTOP_SPLIT_RATIO..=MAX_DESKTOP_SPLIT_RATIO).contains(&value) => {
                Self {
                    desktop_split_ratio: value,
                }
            }
            _ => Self::default(),
        }
    }

    pub fn desktop_split_ratio(&self) -> u32 {
        self.desktop_split_ratio
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DesktopLayoutPreferences, DEFAULT_DESKTOP_SPLIT_RATIO, MAX_DESKTOP_SPLIT_RATIO,
        MIN_DESKTOP_SPLIT_RATIO,
    };

    #[test]
    fn uses_default_ratio_for_missing_or_invalid_values() {
        assert_eq!(
            DesktopLayoutPreferences::new(None).desktop_split_ratio(),
            DEFAULT_DESKTOP_SPLIT_RATIO
        );
        assert_eq!(
            DesktopLayoutPreferences::new(Some(MIN_DESKTOP_SPLIT_RATIO - 1)).desktop_split_ratio(),
            DEFAULT_DESKTOP_SPLIT_RATIO
        );
        assert_eq!(
            DesktopLayoutPreferences::new(Some(MAX_DESKTOP_SPLIT_RATIO + 1)).desktop_split_ratio(),
            DEFAULT_DESKTOP_SPLIT_RATIO
        );
    }

    #[test]
    fn keeps_valid_ratio() {
        assert_eq!(
            DesktopLayoutPreferences::new(Some(64)).desktop_split_ratio(),
            64
        );
    }
}
