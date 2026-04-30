#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PreviewWindowSnapshot {
    content: String,
    file_name: String,
    file_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PreviewWindowState {
    snapshot: PreviewWindowSnapshot,
    active_source_line: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreviewWindowEditJumpRequest {
    line_number: u32,
    request_id: u64,
}

impl PreviewWindowSnapshot {
    pub fn new(
        content: impl Into<String>,
        file_name: impl Into<String>,
        file_path: Option<String>,
    ) -> Self {
        Self {
            content: content.into(),
            file_name: file_name.into(),
            file_path: file_path
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty()),
        }
    }

    pub fn content(&self) -> &str {
        &self.content
    }

    pub fn file_name(&self) -> &str {
        &self.file_name
    }

    pub fn file_path(&self) -> Option<&str> {
        self.file_path.as_deref()
    }
}

impl PreviewWindowState {
    pub fn new(snapshot: PreviewWindowSnapshot, active_source_line: Option<u32>) -> Self {
        Self {
            snapshot,
            active_source_line: active_source_line.filter(|line_number| *line_number > 0),
        }
    }

    pub fn snapshot(&self) -> &PreviewWindowSnapshot {
        &self.snapshot
    }

    pub fn active_source_line(&self) -> Option<u32> {
        self.active_source_line
    }
}

impl PreviewWindowEditJumpRequest {
    pub fn new(line_number: u32, request_id: u64) -> Self {
        Self {
            line_number,
            request_id,
        }
    }

    pub fn line_number(&self) -> u32 {
        self.line_number
    }

    pub fn request_id(&self) -> u64 {
        self.request_id
    }
}
