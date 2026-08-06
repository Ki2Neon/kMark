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
    plantuml_https_hosts: Vec<String>,
}

impl Default for PreviewPreferences {
    fn default() -> Self {
        Self {
            preview_display_mode: PreviewDisplayMode::Standard,
            is_preview_visible: true,
            plantuml_https_hosts: Vec::new(),
        }
    }
}

impl PreviewPreferences {
    pub fn new(
        preview_display_mode: Option<&str>,
        is_preview_visible: Option<bool>,
        plantuml_https_hosts: Option<&[String]>,
    ) -> Self {
        let defaults = Self::default();

        Self {
            preview_display_mode: preview_display_mode
                .and_then(PreviewDisplayMode::from_str)
                .unwrap_or(defaults.preview_display_mode),
            is_preview_visible: is_preview_visible.unwrap_or(defaults.is_preview_visible),
            plantuml_https_hosts: plantuml_https_hosts
                .and_then(|hosts| normalize_plantuml_https_hosts(hosts).ok())
                .unwrap_or_default(),
        }
    }

    pub fn preview_display_mode(&self) -> PreviewDisplayMode {
        self.preview_display_mode
    }

    pub fn is_preview_visible(&self) -> bool {
        self.is_preview_visible
    }

    pub fn plantuml_https_hosts(&self) -> &[String] {
        &self.plantuml_https_hosts
    }
}

pub fn normalize_plantuml_https_hosts(hosts: &[String]) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    for raw_host in hosts {
        let host = raw_host.trim().to_ascii_lowercase();
        if !is_valid_https_host(&host) {
            return Err(format!("invalid PlantUML HTTPS host: {raw_host}"));
        }
        let host = host.strip_suffix(":443").unwrap_or(&host).to_owned();
        if !normalized.contains(&host) {
            normalized.push(host);
        }
    }
    Ok(normalized)
}

fn is_valid_https_host(value: &str) -> bool {
    if value.is_empty()
        || value.contains(['/', '\\', '@', '*', '?', '#'])
        || value.chars().any(char::is_whitespace)
    {
        return false;
    }
    let (hostname, port) = match value.rsplit_once(':') {
        Some((hostname, port)) if !hostname.contains(':') => (hostname, Some(port)),
        _ => (value, None),
    };
    if let Some(port) = port {
        if port.parse::<u16>().ok().filter(|port| *port > 0).is_none() {
            return false;
        }
    }
    hostname.len() <= 253
        && hostname.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '-')
        })
}

#[cfg(test)]
mod tests {
    use super::{normalize_plantuml_https_hosts, PreviewPreferences};

    #[test]
    fn normalizes_exact_plantuml_https_hosts() {
        assert_eq!(
            normalize_plantuml_https_hosts(&[
                " CDN.Example.test:8443 ".to_owned(),
                "cdn.example.test:8443".to_owned(),
                "DEFAULT.example.test:443".to_owned(),
            ]),
            Ok(vec![
                "cdn.example.test:8443".to_owned(),
                "default.example.test".to_owned(),
            ])
        );
        assert!(normalize_plantuml_https_hosts(&["*.example.test".to_owned()]).is_err());
        assert!(normalize_plantuml_https_hosts(&["https://example.test".to_owned()]).is_err());
    }

    #[test]
    fn old_preferences_default_to_empty_host_list() {
        assert!(PreviewPreferences::new(None, None, None)
            .plantuml_https_hosts()
            .is_empty());
    }
}
