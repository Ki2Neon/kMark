use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
};

use kmark_core::ensure_markdown_file_name;
use similar::TextDiff;

use crate::model::DocumentSession;
use crate::{
    ApplicationError, ApplicationErrorCode, ApplicationEvent, DocumentFileRepository,
    DocumentSnapshot, ProposalStatus, SessionProposal, SessionProposalInput, TextEdit,
};

pub trait ApplicationEventSink: Send + Sync {
    fn publish(&self, event: &ApplicationEvent);
}

#[derive(Default)]
pub struct NoopApplicationEventSink;

impl ApplicationEventSink for NoopApplicationEventSink {
    fn publish(&self, _event: &ApplicationEvent) {}
}

#[derive(Default)]
struct ApplicationState {
    next_id: u64,
    sessions: HashMap<String, DocumentSession>,
    session_proposals: HashMap<String, SessionProposal>,
}

pub struct ApplicationService {
    instance_id: String,
    state: Mutex<ApplicationState>,
    file_repository: Arc<dyn DocumentFileRepository>,
    event_sink: Arc<dyn ApplicationEventSink>,
}

impl ApplicationService {
    pub fn new(
        instance_id: impl Into<String>,
        file_repository: Arc<dyn DocumentFileRepository>,
        event_sink: Arc<dyn ApplicationEventSink>,
    ) -> Self {
        Self {
            instance_id: instance_id.into(),
            state: Mutex::new(ApplicationState::default()),
            file_repository,
            event_sink,
        }
    }

    pub fn instance_id(&self) -> &str {
        &self.instance_id
    }

    pub fn register_frontend_session(
        &self,
        window_label: String,
        file_name: String,
        file_path: Option<String>,
        content: String,
        is_dirty: bool,
    ) -> Result<DocumentSnapshot, ApplicationError> {
        let disk_file = file_path
            .as_deref()
            .and_then(|path| self.file_repository.read_utf8(Path::new(path)).ok());
        let normalized_path = disk_file
            .as_ref()
            .map(|file| file.absolute_path.clone())
            .or_else(|| file_path.map(PathBuf::from));

        let mut state = self.lock_state();
        if let Some(existing_id) = normalized_path.as_ref().and_then(|path| {
            state
                .sessions
                .values()
                .find(|session| {
                    session
                        .file_path
                        .as_ref()
                        .is_some_and(|candidate| same_path(candidate, path))
                })
                .map(|session| session.id.clone())
        }) {
            let session = state
                .sessions
                .get_mut(&existing_id)
                .expect("session resolved above");
            session.attached_window_label = Some(window_label);
            return Ok(session.snapshot(&self.instance_id));
        }

        let session_id = next_id(&self.instance_id, &mut state, "session");
        let session = DocumentSession {
            id: session_id.clone(),
            revision: 1,
            file_name: ensure_markdown_file_name(&file_name),
            file_path: normalized_path,
            content,
            is_dirty,
            attached_window_label: Some(window_label),
            persisted_fingerprint: disk_file.map(|file| file.fingerprint),
            pending_proposal_id: None,
        };
        let snapshot = session.snapshot(&self.instance_id);
        state.sessions.insert(session_id, session);
        Ok(snapshot)
    }

    pub fn sync_frontend_session(
        &self,
        session_id: &str,
        expected_revision: u64,
        file_name: String,
        file_path: Option<String>,
        content: String,
        is_dirty: bool,
    ) -> Result<DocumentSnapshot, ApplicationError> {
        let next_file_name = ensure_markdown_file_name(&file_name);
        let requested_path = file_path.map(PathBuf::from);
        let disk_file = if !is_dirty {
            requested_path
                .as_deref()
                .and_then(|path| self.file_repository.read_utf8(path).ok())
        } else {
            None
        };
        let next_file_path = disk_file
            .as_ref()
            .map(|file| file.absolute_path.clone())
            .or(requested_path);

        let mut state = self.lock_state();
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(session_not_found)?;
        ensure_revision(session.revision, expected_revision)?;
        if session.file_name == next_file_name
            && session.file_path == next_file_path
            && session.content == content
            && session.is_dirty == is_dirty
        {
            return Ok(session.snapshot(&self.instance_id));
        }
        let path_changed = session.file_path != next_file_path;
        session.file_name = next_file_name;
        session.file_path = next_file_path;
        session.content = content;
        session.is_dirty = is_dirty;
        if let Some(file) = disk_file {
            session.persisted_fingerprint = Some(file.fingerprint);
        } else if path_changed {
            session.persisted_fingerprint = None;
        }
        session.revision = next_revision(session.revision)?;
        let snapshot = session.snapshot(&self.instance_id);
        drop(state);
        self.publish_changed(&snapshot);
        Ok(snapshot)
    }

    pub fn detach_window(&self, window_label: &str) {
        for session in self.lock_state().sessions.values_mut() {
            if session.attached_window_label.as_deref() == Some(window_label) {
                session.attached_window_label = None;
            }
        }
    }

    pub fn attach_session(
        &self,
        session_id: &str,
        window_label: String,
    ) -> Result<DocumentSnapshot, ApplicationError> {
        let mut state = self.lock_state();
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(session_not_found)?;
        session.attached_window_label = Some(window_label);
        Ok(session.snapshot(&self.instance_id))
    }

    pub fn reserve_session_window(
        &self,
        session_id: &str,
        window_label: String,
    ) -> Result<bool, ApplicationError> {
        let mut state = self.lock_state();
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(session_not_found)?;
        if session.attached_window_label.is_some() {
            return Ok(false);
        }
        session.attached_window_label = Some(window_label);
        Ok(true)
    }

    pub fn activate_window(&self, _window_label: &str) {}

    pub fn sessions(&self) -> Vec<DocumentSnapshot> {
        let mut sessions = self
            .lock_state()
            .sessions
            .values()
            .map(|session| session.snapshot(&self.instance_id))
            .collect::<Vec<_>>();
        sessions.sort_by(|left, right| left.session_id.cmp(&right.session_id));
        sessions
    }

    pub fn session(&self, session_id: &str) -> Result<DocumentSnapshot, ApplicationError> {
        self.lock_state()
            .sessions
            .get(session_id)
            .map(|session| session.snapshot(&self.instance_id))
            .ok_or_else(session_not_found)
    }

    pub fn session_for_ui(&self, session_id: &str) -> Result<DocumentSnapshot, ApplicationError> {
        self.session(session_id)
    }

    pub fn session_window_label(
        &self,
        session_id: &str,
    ) -> Result<Option<String>, ApplicationError> {
        self.lock_state()
            .sessions
            .get(session_id)
            .map(|session| session.attached_window_label.clone())
            .ok_or_else(session_not_found)
    }

    pub fn session_has_attached_window(&self, session_id: &str) -> Result<bool, ApplicationError> {
        self.session_window_label(session_id)
            .map(|label| label.is_some())
    }

    pub fn create_session(&self, suggested_file_name: String) -> DocumentSnapshot {
        let mut state = self.lock_state();
        let session_id = next_id(&self.instance_id, &mut state, "session");
        let session = DocumentSession {
            id: session_id.clone(),
            revision: 1,
            file_name: ensure_markdown_file_name(&suggested_file_name),
            file_path: None,
            content: String::new(),
            is_dirty: false,
            attached_window_label: None,
            persisted_fingerprint: None,
            pending_proposal_id: None,
        };
        let snapshot = session.snapshot(&self.instance_id);
        state.sessions.insert(session_id, session);
        drop(state);
        self.request_presentation(&snapshot.session_id);
        snapshot
    }

    pub fn open_session(&self, absolute_path: &Path) -> Result<DocumentSnapshot, ApplicationError> {
        validate_document_path(absolute_path)?;
        let file = self.file_repository.read_utf8(absolute_path)?;
        validate_document_path(&file.absolute_path)?;

        let mut state = self.lock_state();
        if let Some(snapshot) = state
            .sessions
            .values()
            .find(|session| {
                session
                    .file_path
                    .as_ref()
                    .is_some_and(|path| same_path(path, &file.absolute_path))
            })
            .map(|session| session.snapshot(&self.instance_id))
        {
            drop(state);
            self.request_presentation(&snapshot.session_id);
            return Ok(snapshot);
        }

        let file_name = file
            .absolute_path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| "untitled.md".to_owned());
        let session_id = next_id(&self.instance_id, &mut state, "session");
        let session = DocumentSession {
            id: session_id.clone(),
            revision: 1,
            file_name,
            file_path: Some(file.absolute_path),
            content: file.content,
            is_dirty: false,
            attached_window_label: None,
            persisted_fingerprint: Some(file.fingerprint),
            pending_proposal_id: None,
        };
        let snapshot = session.snapshot(&self.instance_id);
        state.sessions.insert(session_id, session);
        drop(state);
        self.request_presentation(&snapshot.session_id);
        Ok(snapshot)
    }

    pub fn save_session(
        &self,
        session_id: &str,
        expected_revision: u64,
        destination: Option<&Path>,
    ) -> Result<DocumentSnapshot, ApplicationError> {
        if let Some(path) = destination {
            validate_document_path(path)?;
        }
        let mut state = self.lock_state();
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(session_not_found)?;
        ensure_revision(session.revision, expected_revision)?;
        if session.pending_proposal_id.is_some() {
            return Err(ApplicationError::new(
                ApplicationErrorCode::ProposalPending,
                "document session has a pending proposal",
            ));
        }
        let target = destination
            .map(Path::to_path_buf)
            .or_else(|| session.file_path.clone())
            .ok_or_else(|| {
                ApplicationError::new(
                    ApplicationErrorCode::InvalidState,
                    "untitled document requires a save destination",
                )
            })?;
        validate_document_path(&target)?;

        let overwrites_persisted = session
            .file_path
            .as_ref()
            .is_some_and(|path| same_path(path, &target));
        if overwrites_persisted {
            let expected = session.persisted_fingerprint.as_ref().ok_or_else(|| {
                ApplicationError::new(
                    ApplicationErrorCode::InvalidState,
                    "saved document fingerprint is unavailable",
                )
            })?;
            let current = self.file_repository.fingerprint(&target)?;
            if &current != expected {
                return Err(ApplicationError::new(
                    ApplicationErrorCode::DiskFileChanged,
                    "document file changed on disk after it was opened",
                ));
            }
        }

        let written = self.file_repository.write_utf8(&target, &session.content)?;
        session.file_path = Some(written.absolute_path.clone());
        session.file_name = written
            .absolute_path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| session.file_name.clone());
        session.persisted_fingerprint = Some(written.fingerprint);
        session.is_dirty = false;
        session.revision = next_revision(session.revision)?;
        let snapshot = session.snapshot(&self.instance_id);
        drop(state);
        self.publish_changed(&snapshot);
        Ok(snapshot)
    }

    pub fn create_session_proposal(
        &self,
        session_id: &str,
        input: SessionProposalInput,
    ) -> Result<SessionProposal, ApplicationError> {
        let mut state = self.lock_state();
        let session = state
            .sessions
            .get(session_id)
            .ok_or_else(session_not_found)?;
        if session.pending_proposal_id.is_some() {
            return Err(ApplicationError::new(
                ApplicationErrorCode::ProposalPending,
                "document session already has a pending proposal",
            ));
        }
        ensure_revision(session.revision, input.expected_revision)?;
        let proposed_content = apply_text_edits(&session.content, &input.operations)?;
        let base_content = session.content.clone();
        let base_revision = session.revision;
        let base_content_hash = stable_content_hash(&base_content);
        let proposal_id = next_id(&self.instance_id, &mut state, "proposal");
        let proposal = SessionProposal {
            id: proposal_id.clone(),
            session_id: session_id.to_owned(),
            base_revision,
            base_content_hash,
            status: ProposalStatus::Pending,
            operations: input.operations,
            unified_diff: unified_diff(&base_content, &proposed_content),
        };
        state
            .sessions
            .get_mut(session_id)
            .expect("session checked above")
            .pending_proposal_id = Some(proposal_id.clone());
        state
            .session_proposals
            .insert(proposal_id.clone(), proposal.clone());
        drop(state);
        self.event_sink
            .publish(&ApplicationEvent::SessionProposalCreated {
                session_id: session_id.to_owned(),
                proposal_id,
            });
        Ok(proposal)
    }

    pub fn session_proposal(&self, proposal_id: &str) -> Result<SessionProposal, ApplicationError> {
        self.lock_state()
            .session_proposals
            .get(proposal_id)
            .cloned()
            .ok_or_else(proposal_not_found)
    }

    pub fn accept_session_proposal(
        &self,
        proposal_id: &str,
    ) -> Result<DocumentSnapshot, ApplicationError> {
        let mut state = self.lock_state();
        let proposal = state
            .session_proposals
            .get(proposal_id)
            .cloned()
            .ok_or_else(proposal_not_found)?;
        if proposal.status != ProposalStatus::Pending {
            return Err(ApplicationError::new(
                ApplicationErrorCode::InvalidState,
                "proposal is not pending",
            ));
        }
        let session = state
            .sessions
            .get_mut(&proposal.session_id)
            .ok_or_else(session_not_found)?;
        if session.revision != proposal.base_revision
            || stable_content_hash(&session.content) != proposal.base_content_hash
        {
            session.pending_proposal_id = None;
            state
                .session_proposals
                .get_mut(proposal_id)
                .expect("proposal checked above")
                .status = ProposalStatus::StaleProposal;
            return Err(ApplicationError::new(
                ApplicationErrorCode::StaleProposal,
                "proposal base revision is stale",
            ));
        }
        session.content = apply_text_edits(&session.content, &proposal.operations)?;
        session.is_dirty = true;
        session.pending_proposal_id = None;
        session.revision = next_revision(session.revision)?;
        let snapshot = session.snapshot(&self.instance_id);
        state
            .session_proposals
            .get_mut(proposal_id)
            .expect("proposal checked above")
            .status = ProposalStatus::Accepted;
        drop(state);
        self.publish_changed(&snapshot);
        Ok(snapshot)
    }

    pub fn reject_session_proposal(&self, proposal_id: &str) -> Result<(), ApplicationError> {
        let mut state = self.lock_state();
        let session_id = {
            let proposal = state
                .session_proposals
                .get_mut(proposal_id)
                .ok_or_else(proposal_not_found)?;
            if proposal.status != ProposalStatus::Pending {
                return Err(ApplicationError::new(
                    ApplicationErrorCode::InvalidState,
                    "proposal is not pending",
                ));
            }
            proposal.status = ProposalStatus::Rejected;
            proposal.session_id.clone()
        };
        if let Some(session) = state.sessions.get_mut(&session_id) {
            session.pending_proposal_id = None;
        }
        Ok(())
    }

    pub fn pending_proposals(&self) -> Vec<SessionProposal> {
        let mut proposals = self
            .lock_state()
            .session_proposals
            .values()
            .filter(|proposal| proposal.status == ProposalStatus::Pending)
            .cloned()
            .collect::<Vec<_>>();
        proposals.sort_by(|left, right| left.id.cmp(&right.id));
        proposals
    }

    fn publish_changed(&self, snapshot: &DocumentSnapshot) {
        self.event_sink.publish(&ApplicationEvent::SessionChanged {
            session_id: snapshot.session_id.clone(),
            revision: snapshot.revision,
        });
    }

    fn request_presentation(&self, session_id: &str) {
        self.event_sink
            .publish(&ApplicationEvent::SessionPresentationRequested {
                session_id: session_id.to_owned(),
            });
    }

    fn lock_state(&self) -> MutexGuard<'_, ApplicationState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn validate_document_path(path: &Path) -> Result<(), ApplicationError> {
    if !path.is_absolute() {
        return Err(ApplicationError::new(
            ApplicationErrorCode::InvalidAbsolutePath,
            "document path must be absolute",
        ));
    }
    let supported = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown")
        });
    if !supported {
        return Err(ApplicationError::new(
            ApplicationErrorCode::UnsupportedFileType,
            "Kmark can open and save Markdown files only",
        ));
    }
    Ok(())
}

fn same_path(left: &Path, right: &Path) -> bool {
    #[cfg(windows)]
    {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

fn next_id(instance_id: &str, state: &mut ApplicationState, kind: &str) -> String {
    state.next_id = state.next_id.saturating_add(1);
    format!("{instance_id}-{kind}-{}", state.next_id)
}

fn next_revision(revision: u64) -> Result<u64, ApplicationError> {
    revision.checked_add(1).ok_or_else(|| {
        ApplicationError::new(
            ApplicationErrorCode::InvalidState,
            "document revision exhausted",
        )
    })
}

fn ensure_revision(current: u64, expected: u64) -> Result<(), ApplicationError> {
    if current == expected {
        Ok(())
    } else {
        Err(ApplicationError::revision_conflict(current))
    }
}

fn apply_text_edits(content: &str, operations: &[TextEdit]) -> Result<String, ApplicationError> {
    let mut ordered = operations.to_vec();
    ordered.sort_by_key(|operation| (operation.start, operation.end));
    let mut previous_end = 0usize;
    for operation in &ordered {
        if operation.start > operation.end
            || operation.end > content.len()
            || !content.is_char_boundary(operation.start)
            || !content.is_char_boundary(operation.end)
            || operation.start < previous_end
        {
            return Err(ApplicationError::new(
                ApplicationErrorCode::InvalidEditRange,
                "text edit range is invalid or overlaps another range",
            ));
        }
        previous_end = operation.end;
    }
    let mut next = content.to_owned();
    for operation in ordered.iter().rev() {
        next.replace_range(operation.start..operation.end, &operation.text);
    }
    Ok(next)
}

fn unified_diff(base: &str, proposed: &str) -> String {
    TextDiff::from_lines(base, proposed)
        .unified_diff()
        .context_radius(3)
        .header("current", "proposed")
        .to_string()
}

fn stable_content_hash(content: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in content.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn session_not_found() -> ApplicationError {
    ApplicationError::new(
        ApplicationErrorCode::SessionNotFound,
        "document session not found",
    )
}

fn proposal_not_found() -> ApplicationError {
    ApplicationError::new(ApplicationErrorCode::ProposalNotFound, "proposal not found")
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        path::{Path, PathBuf},
        sync::{Arc, Mutex},
    };

    use crate::{
        ApplicationError, ApplicationErrorCode, DocumentFileRepository, FileFingerprint,
        ReadFileResult, SessionProposalInput, TextEdit,
    };

    use super::{ApplicationService, NoopApplicationEventSink};

    #[derive(Default)]
    struct MemoryRepository {
        files: Mutex<HashMap<PathBuf, String>>,
    }

    impl MemoryRepository {
        fn with_file(path: PathBuf, content: &str) -> Self {
            Self {
                files: Mutex::new(HashMap::from([(path, content.to_owned())])),
            }
        }

        fn result(path: &Path, content: String) -> ReadFileResult {
            ReadFileResult {
                absolute_path: path.to_path_buf(),
                fingerprint: FileFingerprint {
                    identity: path.to_string_lossy().into_owned(),
                    sha256: super::stable_content_hash(&content),
                    byte_length: content.len() as u64,
                },
                content,
                modified_at_epoch_ms: None,
            }
        }
    }

    impl DocumentFileRepository for MemoryRepository {
        fn read_utf8(&self, path: &Path) -> Result<ReadFileResult, ApplicationError> {
            self.files
                .lock()
                .unwrap()
                .get(path)
                .cloned()
                .map(|content| Self::result(path, content))
                .ok_or_else(|| {
                    ApplicationError::new(ApplicationErrorCode::FileNotFound, "not found")
                })
        }

        fn fingerprint(&self, path: &Path) -> Result<FileFingerprint, ApplicationError> {
            self.read_utf8(path).map(|file| file.fingerprint)
        }

        fn write_utf8(
            &self,
            path: &Path,
            content: &str,
        ) -> Result<ReadFileResult, ApplicationError> {
            self.files
                .lock()
                .unwrap()
                .insert(path.to_path_buf(), content.to_owned());
            Ok(Self::result(path, content.to_owned()))
        }
    }

    fn service(repository: Arc<MemoryRepository>) -> ApplicationService {
        ApplicationService::new("instance", repository, Arc::new(NoopApplicationEventSink))
    }

    fn absolute(name: &str) -> PathBuf {
        std::env::temp_dir().join(name)
    }

    #[test]
    fn creates_blank_clean_untitled_session() {
        let session =
            service(Arc::new(MemoryRepository::default())).create_session("created".to_owned());
        assert_eq!(session.revision, 1);
        assert_eq!(session.file_name, "created.md");
        assert_eq!(session.file_path, None);
        assert_eq!(session.content, "");
        assert!(!session.is_dirty);
    }

    #[test]
    fn opens_canonical_document_once() {
        let path = absolute("kmark-open-once.md");
        let service = service(Arc::new(MemoryRepository::with_file(path.clone(), "alpha")));
        let first = service.open_session(&path).unwrap();
        let second = service.open_session(&path).unwrap();
        assert_eq!(first.session_id, second.session_id);
        assert_eq!(service.sessions().len(), 1);
    }

    #[test]
    fn reserves_only_one_window_for_a_session() {
        let service = service(Arc::new(MemoryRepository::default()));
        let session = service.create_session("note.md".to_owned());

        assert!(service
            .reserve_session_window(&session.session_id, "window-a".to_owned())
            .unwrap());
        assert!(!service
            .reserve_session_window(&session.session_id, "window-b".to_owned())
            .unwrap());
        assert_eq!(
            service.session_window_label(&session.session_id).unwrap(),
            Some("window-a".to_owned())
        );

        service.detach_window("window-a");
        assert!(service
            .reserve_session_window(&session.session_id, "window-b".to_owned())
            .unwrap());
    }

    #[test]
    fn rejects_accept_when_session_revision_changed_after_proposal() {
        let service = service(Arc::new(MemoryRepository::default()));
        let session = service.create_session("note.md".to_owned());
        service
            .sync_frontend_session(
                &session.session_id,
                session.revision,
                "note.md".to_owned(),
                None,
                "alpha".to_owned(),
                true,
            )
            .unwrap();
        let session = service.session(&session.session_id).unwrap();
        let proposal = service
            .create_session_proposal(
                &session.session_id,
                SessionProposalInput {
                    expected_revision: session.revision,
                    operations: vec![TextEdit {
                        start: 0,
                        end: 5,
                        text: "beta".to_owned(),
                    }],
                },
            )
            .unwrap();
        service
            .sync_frontend_session(
                &session.session_id,
                session.revision,
                "note.md".to_owned(),
                None,
                "local edit".to_owned(),
                true,
            )
            .unwrap();
        let error = service.accept_session_proposal(&proposal.id).unwrap_err();
        assert_eq!(error.code(), ApplicationErrorCode::StaleProposal);
        assert_eq!(
            service
                .session_proposal(&proposal.id)
                .unwrap()
                .status
                .as_str(),
            "stale_proposal"
        );
    }

    #[test]
    fn saves_with_revision_and_disk_fingerprint_guards() {
        let path = absolute("kmark-save.md");
        let repository = Arc::new(MemoryRepository::with_file(path.clone(), "alpha"));
        let service = service(repository.clone());
        let session = service.open_session(&path).unwrap();
        let edited = service
            .sync_frontend_session(
                &session.session_id,
                session.revision,
                session.file_name,
                session.file_path,
                "beta".to_owned(),
                true,
            )
            .unwrap();
        let saved = service
            .save_session(&edited.session_id, edited.revision, None)
            .unwrap();
        assert_eq!(saved.revision, edited.revision + 1);
        assert!(!saved.is_dirty);
        assert_eq!(repository.read_utf8(&path).unwrap().content, "beta");
        let error = service
            .save_session(&saved.session_id, edited.revision, None)
            .unwrap_err();
        assert_eq!(error.code(), ApplicationErrorCode::RevisionConflict);
    }

    #[test]
    fn rejects_save_while_edit_proposal_is_pending() {
        let service = service(Arc::new(MemoryRepository::default()));
        let session = service.create_session("note.md".to_owned());
        let session = service
            .sync_frontend_session(
                &session.session_id,
                session.revision,
                session.file_name,
                None,
                "alpha".to_owned(),
                true,
            )
            .unwrap();
        service
            .create_session_proposal(
                &session.session_id,
                SessionProposalInput {
                    expected_revision: session.revision,
                    operations: vec![TextEdit {
                        start: 0,
                        end: 5,
                        text: "beta".to_owned(),
                    }],
                },
            )
            .unwrap();

        let error = service
            .save_session(
                &session.session_id,
                session.revision,
                Some(&absolute("pending.md")),
            )
            .unwrap_err();

        assert_eq!(error.code(), ApplicationErrorCode::ProposalPending);
    }

    #[test]
    fn rejects_non_absolute_and_non_markdown_open_paths() {
        let service = service(Arc::new(MemoryRepository::default()));
        assert_eq!(
            service
                .open_session(Path::new("note.md"))
                .unwrap_err()
                .code(),
            ApplicationErrorCode::InvalidAbsolutePath
        );
        assert_eq!(
            service
                .open_session(&absolute("note.txt"))
                .unwrap_err()
                .code(),
            ApplicationErrorCode::UnsupportedFileType
        );
    }

    #[test]
    fn rejects_non_utf8_boundary_edits() {
        let service = service(Arc::new(MemoryRepository::default()));
        let session = service.create_session("note.md".to_owned());
        let session = service
            .sync_frontend_session(
                &session.session_id,
                1,
                "note.md".to_owned(),
                None,
                "あいう".to_owned(),
                true,
            )
            .unwrap();
        let error = service
            .create_session_proposal(
                &session.session_id,
                SessionProposalInput {
                    expected_revision: session.revision,
                    operations: vec![TextEdit {
                        start: 1,
                        end: 3,
                        text: String::new(),
                    }],
                },
            )
            .unwrap_err();
        assert_eq!(error.code(), ApplicationErrorCode::InvalidEditRange);
    }
}
