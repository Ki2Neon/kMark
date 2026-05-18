use crate::{ensure_markdown_file_name, StartupEditMode, StoredEdit};

pub const DEFAULT_MARKDOWN: &str = "## 操作説明\n\n- 左で書く\n- 右で読む\n- Ctrl / Cmd + S で保存\n- Ctrl / Cmd + O で開く\n- Ctrl / Cmd + Shift + B でメニューを開閉\n- Ctrl / Cmd + P で印刷";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditorState {
    content: String,
    file_name: String,
    is_dirty: bool,
    last_saved_at: Option<u64>,
    error_message: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditorStats {
    words: usize,
    characters: usize,
    lines: usize,
    reading_minutes: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EditorStateAction {
    BootstrapLoaded(EditorState),
    ContentChanged(String),
    DocumentLoaded {
        file_name: String,
        content: String,
        loaded_at: Option<u64>,
    },
    DocumentReset,
    SaveSucceeded {
        file_name: String,
        saved_at: u64,
    },
    ErrorRaised(String),
    ErrorCleared,
}

impl EditorState {
    pub fn new(
        content: impl Into<String>,
        file_name: impl Into<String>,
        is_dirty: bool,
        last_saved_at: Option<u64>,
        error_message: Option<String>,
    ) -> Self {
        Self {
            content: content.into(),
            file_name: ensure_markdown_file_name(&file_name.into()),
            is_dirty,
            last_saved_at,
            error_message: error_message
                .map(|message| message.trim().to_owned())
                .filter(|message| !message.is_empty()),
        }
    }

    pub fn content(&self) -> &str {
        &self.content
    }

    pub fn file_name(&self) -> &str {
        &self.file_name
    }

    pub fn is_dirty(&self) -> bool {
        self.is_dirty
    }

    pub fn last_saved_at(&self) -> Option<u64> {
        self.last_saved_at
    }

    pub fn error_message(&self) -> Option<&str> {
        self.error_message.as_deref()
    }
}

impl EditorStats {
    pub fn words(&self) -> usize {
        self.words
    }

    pub fn characters(&self) -> usize {
        self.characters
    }

    pub fn lines(&self) -> usize {
        self.lines
    }

    pub fn reading_minutes(&self) -> usize {
        self.reading_minutes
    }
}

pub fn create_initial_editor_state() -> EditorState {
    EditorState {
        content: DEFAULT_MARKDOWN.to_owned(),
        file_name: ensure_markdown_file_name(""),
        is_dirty: false,
        last_saved_at: None,
        error_message: None,
    }
}

pub fn create_blank_editor_state() -> EditorState {
    EditorState {
        content: String::new(),
        file_name: ensure_markdown_file_name(""),
        is_dirty: false,
        last_saved_at: None,
        error_message: None,
    }
}

pub fn create_startup_editor_state(
    startup_edit_mode: StartupEditMode,
    _stored_edit: Option<&StoredEdit>,
) -> EditorState {
    if startup_edit_mode == StartupEditMode::Blank {
        return create_blank_editor_state();
    }

    create_initial_editor_state()
}

pub fn reduce_editor_state(state: &EditorState, action: &EditorStateAction) -> EditorState {
    match action {
        EditorStateAction::BootstrapLoaded(next_state) => next_state.clone(),
        EditorStateAction::ContentChanged(content) => {
            if state.content == *content {
                return state.clone();
            }

            EditorState {
                content: content.clone(),
                file_name: state.file_name.clone(),
                is_dirty: true,
                last_saved_at: state.last_saved_at,
                error_message: None,
            }
        }
        EditorStateAction::DocumentLoaded {
            file_name,
            content,
            loaded_at,
        } => EditorState {
            content: content.clone(),
            file_name: ensure_markdown_file_name(file_name),
            is_dirty: false,
            last_saved_at: *loaded_at,
            error_message: None,
        },
        EditorStateAction::DocumentReset => create_initial_editor_state(),
        EditorStateAction::SaveSucceeded {
            file_name,
            saved_at,
        } => EditorState {
            content: state.content.clone(),
            file_name: ensure_markdown_file_name(file_name),
            is_dirty: false,
            last_saved_at: Some(*saved_at),
            error_message: None,
        },
        EditorStateAction::ErrorRaised(message) => EditorState {
            content: state.content.clone(),
            file_name: state.file_name.clone(),
            is_dirty: state.is_dirty,
            last_saved_at: state.last_saved_at,
            error_message: Some(message.clone()),
        },
        EditorStateAction::ErrorCleared => {
            if state.error_message.is_none() {
                return state.clone();
            }

            EditorState {
                content: state.content.clone(),
                file_name: state.file_name.clone(),
                is_dirty: state.is_dirty,
                last_saved_at: state.last_saved_at,
                error_message: None,
            }
        }
    }
}

pub fn derive_editor_stats(content: &str) -> EditorStats {
    let trimmed_content = content.trim();
    let words = if trimmed_content.is_empty() {
        0
    } else {
        trimmed_content.split_whitespace().count()
    };
    let characters = content.chars().count();
    let lines = if content.is_empty() {
        1
    } else {
        content.split('\n').count()
    };

    EditorStats {
        words,
        characters,
        lines,
        reading_minutes: if words == 0 {
            0
        } else {
            usize::max(1, words.div_ceil(200))
        },
    }
}

#[cfg(test)]
mod tests {
    use crate::StoredEdit;

    use super::{
        create_blank_editor_state, create_initial_editor_state, create_startup_editor_state,
        derive_editor_stats, reduce_editor_state, EditorStateAction,
    };

    #[test]
    fn creates_startup_state_without_reopening_stored_edit() {
        let stored_edit =
            StoredEdit::new("notes", "hello", Some("C:\\notes.md".to_owned()), Some(7));
        let editor_state =
            create_startup_editor_state(crate::StartupEditMode::StartPage, Some(&stored_edit));

        assert_eq!(editor_state, create_initial_editor_state());
    }

    #[test]
    fn reduces_editor_state() {
        let state = create_initial_editor_state();
        let changed_state = reduce_editor_state(
            &state,
            &EditorStateAction::ContentChanged("changed".to_owned()),
        );

        assert_eq!(changed_state.content(), "changed");
        assert!(changed_state.is_dirty());

        let reset_state = reduce_editor_state(&changed_state, &EditorStateAction::DocumentReset);

        assert_eq!(reset_state, create_initial_editor_state());
    }

    #[test]
    fn derives_editor_stats() {
        let stats = derive_editor_stats("alpha beta\ngamma");

        assert_eq!(stats.words(), 3);
        assert_eq!(stats.lines(), 2);
        assert_eq!(stats.reading_minutes(), 1);
    }

    #[test]
    fn creates_blank_editor_state() {
        let editor_state = create_blank_editor_state();

        assert_eq!(editor_state.content(), "");
        assert_eq!(editor_state.file_name(), "untitled.md");
    }
}
