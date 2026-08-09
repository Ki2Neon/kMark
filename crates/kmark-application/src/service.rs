use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard},
};

use kmark_core::ensure_markdown_file_name;
use similar::TextDiff;

use crate::{
    ApplicationError, ApplicationErrorCode, ApplicationEvent, CreateDocumentProposal,
    CreateDocumentProposalInput, DocumentFileRepository, DocumentSession, DocumentSnapshot,
    FileEntry, InstanceProposalStatus, ProposalStatus, ReadFileResult, RegisteredRoot, SearchMatch,
    SessionProposal, SessionProposalInput, StagedFileOperation, StagedFileOperationKind, TextEdit,
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
    roots: Vec<RegisteredRoot>,
    sessions: HashMap<String, DocumentSession>,
    session_proposals: HashMap<String, SessionProposal>,
    create_proposals: HashMap<String, CreateDocumentProposal>,
    active_session_id: Option<String>,
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

    pub fn replace_roots(&self, roots: Vec<RegisteredRoot>) {
        self.lock_state().roots = roots;
    }

    pub fn roots(&self) -> Vec<RegisteredRoot> {
        self.lock_state().roots.clone()
    }

    pub fn register_frontend_session(
        &self,
        window_label: String,
        file_name: String,
        file_path: Option<String>,
        content: String,
        is_dirty: bool,
    ) -> Result<DocumentSnapshot, ApplicationError> {
        let roots = self.roots();
        let resolved_location = file_path.as_deref().and_then(|path| {
            self.file_repository
                .resolve_registered_path(&roots, PathBuf::from(path).as_path())
        });
        let persisted_fingerprint =
            resolved_location
                .as_ref()
                .and_then(|(root_id, relative_path)| {
                    roots
                        .iter()
                        .find(|root| root.id == *root_id)
                        .and_then(|root| self.file_repository.fingerprint(root, relative_path).ok())
                });

        let mut state = self.lock_state();
        let session_id = next_id(&self.instance_id, &mut state, "session");
        let (root_id, relative_path) = resolved_location
            .map(|(root_id, relative_path)| (Some(root_id), Some(relative_path)))
            .unwrap_or((None, None));
        let session = DocumentSession {
            id: session_id.clone(),
            revision: 1,
            file_name: ensure_markdown_file_name(&file_name),
            file_path: file_path.map(PathBuf::from),
            root_id: root_id.clone(),
            relative_path,
            content,
            is_dirty,
            externally_visible: root_id.is_some(),
            attached_window_label: Some(window_label),
            persisted_fingerprint,
            pending_proposal_id: None,
            staged_file_operation: None,
        };
        let snapshot = session.snapshot(&self.instance_id);
        state.active_session_id = Some(session_id.clone());
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
        let roots = self.roots();
        let resolved_location = file_path.as_deref().and_then(|path| {
            self.file_repository
                .resolve_registered_path(&roots, PathBuf::from(path).as_path())
        });
        let mut state = self.lock_state();
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(session_not_found)?;
        ensure_revision(session.revision, expected_revision)?;
        if matches!(
            session
                .staged_file_operation
                .as_ref()
                .map(|operation| &operation.kind),
            Some(StagedFileOperationKind::Delete)
        ) {
            return Err(ApplicationError::new(
                ApplicationErrorCode::DeleteStaged,
                "document editing is disabled while delete is staged",
            ));
        }

        let next_file_name = ensure_markdown_file_name(&file_name);
        let next_file_path = file_path.map(PathBuf::from);
        let (next_root_id, next_relative_path) = resolved_location
            .map(|(root_id, relative_path)| (Some(root_id), Some(relative_path)))
            .unwrap_or((None, None));
        if session.file_name == next_file_name
            && session.file_path == next_file_path
            && session.content == content
            && session.is_dirty == is_dirty
        {
            return Ok(session.snapshot(&self.instance_id));
        }

        session.file_name = next_file_name;
        session.file_path = next_file_path;
        session.root_id = next_root_id.clone();
        session.relative_path = next_relative_path;
        session.externally_visible = next_root_id.is_some() || session.externally_visible;
        session.content = content;
        session.is_dirty = is_dirty;
        session.revision = next_revision(session.revision)?;
        let snapshot = session.snapshot(&self.instance_id);
        self.event_sink.publish(&ApplicationEvent::SessionChanged {
            session_id: session_id.to_owned(),
            revision: snapshot.revision,
        });
        Ok(snapshot)
    }

    pub fn detach_window(&self, window_label: &str) {
        let mut state = self.lock_state();
        for session in state.sessions.values_mut() {
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
        let snapshot = session.snapshot(&self.instance_id);
        state.active_session_id = Some(session_id.to_owned());
        Ok(snapshot)
    }

    pub fn activate_window(&self, window_label: &str) {
        let mut state = self.lock_state();
        state.active_session_id = state
            .sessions
            .values()
            .find(|session| session.attached_window_label.as_deref() == Some(window_label))
            .map(|session| session.id.clone());
    }

    pub fn sessions(&self) -> Vec<DocumentSnapshot> {
        let state = self.lock_state();
        let mut sessions = state
            .sessions
            .values()
            .filter(|session| session.externally_visible)
            .map(|session| session.snapshot(&self.instance_id))
            .collect::<Vec<_>>();
        sessions.sort_by(|left, right| left.session_id.cmp(&right.session_id));
        sessions
    }

    pub fn current_session(&self) -> Option<DocumentSnapshot> {
        let state = self.lock_state();
        state
            .active_session_id
            .as_ref()
            .and_then(|session_id| state.sessions.get(session_id))
            .filter(|session| session.externally_visible)
            .map(|session| session.snapshot(&self.instance_id))
    }

    pub fn session(&self, session_id: &str) -> Result<DocumentSnapshot, ApplicationError> {
        self.lock_state()
            .sessions
            .get(session_id)
            .filter(|session| session.externally_visible)
            .map(|session| session.snapshot(&self.instance_id))
            .ok_or_else(session_not_found)
    }

    pub fn session_for_ui(&self, session_id: &str) -> Result<DocumentSnapshot, ApplicationError> {
        self.lock_state()
            .sessions
            .get(session_id)
            .map(|session| session.snapshot(&self.instance_id))
            .ok_or_else(session_not_found)
    }

    pub fn session_has_attached_window(&self, session_id: &str) -> Result<bool, ApplicationError> {
        self.lock_state()
            .sessions
            .get(session_id)
            .map(|session| session.attached_window_label.is_some())
            .ok_or_else(session_not_found)
    }

    pub fn read_file(
        &self,
        root_id: &str,
        relative_path: &str,
    ) -> Result<ReadFileResult, ApplicationError> {
        let root = self.root(root_id)?;
        self.file_repository.read_utf8(&root, relative_path)
    }

    pub fn list_entries(
        &self,
        root_id: &str,
        relative_directory: &str,
        limit: usize,
    ) -> Result<Vec<FileEntry>, ApplicationError> {
        let root = self.root(root_id)?;
        self.file_repository
            .list_entries(&root, relative_directory, limit.min(1_000))
    }

    pub fn search_files(
        &self,
        root_id: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchMatch>, ApplicationError> {
        let root = self.root(root_id)?;
        self.file_repository
            .search_utf8(&root, query, limit.min(500))
    }

    pub fn open_session(
        &self,
        root_id: &str,
        relative_path: &str,
    ) -> Result<DocumentSnapshot, ApplicationError> {
        let root = self.root(root_id)?;
        let file = self.file_repository.read_utf8(&root, relative_path)?;
        let file_name = PathBuf::from(&file.relative_path)
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| "untitled.md".to_owned());
        let mut state = self.lock_state();
        let session_id = next_id(&self.instance_id, &mut state, "session");
        let session = DocumentSession {
            id: session_id.clone(),
            revision: 1,
            file_name,
            file_path: Some(file.absolute_path),
            root_id: Some(root.id),
            relative_path: Some(file.relative_path),
            content: file.content,
            is_dirty: false,
            externally_visible: true,
            attached_window_label: None,
            persisted_fingerprint: Some(file.fingerprint),
            pending_proposal_id: None,
            staged_file_operation: None,
        };
        let snapshot = session.snapshot(&self.instance_id);
        state.sessions.insert(session_id, session);
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
            .filter(|session| session.externally_visible)
            .ok_or_else(session_not_found)?;
        if session.pending_proposal_id.is_some() {
            return Err(ApplicationError::new(
                ApplicationErrorCode::ProposalPending,
                "document session already has a pending proposal",
            ));
        }
        let expected_revision = proposal_expected_revision(&input);
        ensure_revision(session.revision, expected_revision)?;
        let base_content = session.content.clone();
        let kind = build_proposal_kind(session, input)?;
        let proposed_content = match &kind {
            crate::model::SessionProposalKind::TextEdit { operations } => {
                apply_text_edits(&base_content, operations)?
            }
            _ => base_content.clone(),
        };
        let base_revision = session.revision;
        let base_content_hash = stable_content_hash(&base_content);
        let proposal_id = next_id(&self.instance_id, &mut state, "proposal");
        let proposal = SessionProposal {
            id: proposal_id.clone(),
            session_id: session_id.to_owned(),
            base_revision,
            base_content_hash,
            status: ProposalStatus::Pending,
            kind,
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
        let proposal = self.session_proposal(proposal_id)?;
        if proposal.status != ProposalStatus::Pending {
            return Err(ApplicationError::new(
                ApplicationErrorCode::InvalidState,
                "proposal is not pending",
            ));
        }

        let fingerprint_for_stage = match &proposal.kind {
            crate::model::SessionProposalKind::RenameDocument { .. }
            | crate::model::SessionProposalKind::DeleteDocument => {
                let state = self.lock_state();
                let session = state
                    .sessions
                    .get(&proposal.session_id)
                    .ok_or_else(session_not_found)?;
                if session.revision != proposal.base_revision {
                    drop(state);
                    self.mark_proposal_stale(proposal_id, &proposal.session_id);
                    return Err(ApplicationError::new(
                        ApplicationErrorCode::StaleProposal,
                        "proposal base revision is stale",
                    ));
                }
                let root_id = session.root_id.clone().ok_or_else(|| {
                    ApplicationError::new(
                        ApplicationErrorCode::InvalidState,
                        "saved document root is required",
                    )
                })?;
                let relative_path = session.relative_path.clone().ok_or_else(|| {
                    ApplicationError::new(
                        ApplicationErrorCode::InvalidState,
                        "saved document path is required",
                    )
                })?;
                let expected = session.persisted_fingerprint.clone();
                drop(state);
                let current = self
                    .file_repository
                    .fingerprint(&self.root(&root_id)?, &relative_path)?;
                if expected
                    .as_ref()
                    .is_some_and(|expected| expected != &current)
                {
                    return Err(ApplicationError::new(
                        ApplicationErrorCode::DiskFileChanged,
                        "source file changed after the document was opened",
                    ));
                }
                Some((root_id, relative_path, current))
            }
            _ => None,
        };

        let mut state = self.lock_state();
        let current_revision = state
            .sessions
            .get(&proposal.session_id)
            .ok_or_else(session_not_found)?
            .revision;
        if current_revision != proposal.base_revision {
            drop(state);
            self.mark_proposal_stale(proposal_id, &proposal.session_id);
            return Err(ApplicationError::new(
                ApplicationErrorCode::StaleProposal,
                "proposal base revision is stale",
            ));
        }
        let session = state
            .sessions
            .get_mut(&proposal.session_id)
            .expect("session checked above");
        if stable_content_hash(&session.content) != proposal.base_content_hash {
            drop(state);
            self.mark_proposal_stale(proposal_id, &proposal.session_id);
            return Err(ApplicationError::new(
                ApplicationErrorCode::StaleProposal,
                "proposal base content is stale",
            ));
        }

        match &proposal.kind {
            crate::model::SessionProposalKind::TextEdit { operations } => {
                session.content = apply_text_edits(&session.content, operations)?;
                session.is_dirty = true;
            }
            crate::model::SessionProposalKind::RenameDocument {
                target_relative_path,
            } => {
                let (root_id, relative_path, fingerprint) = fingerprint_for_stage
                    .clone()
                    .expect("rename fingerprint resolved above");
                session.staged_file_operation = Some(StagedFileOperation {
                    kind: StagedFileOperationKind::Rename {
                        target_relative_path: target_relative_path.clone(),
                    },
                    source_root_id: root_id,
                    source_relative_path: relative_path,
                    source_fingerprint: fingerprint,
                    staged_at_revision: next_revision(session.revision)?,
                });
            }
            crate::model::SessionProposalKind::DeleteDocument => {
                let (root_id, relative_path, fingerprint) = fingerprint_for_stage
                    .clone()
                    .expect("delete fingerprint resolved above");
                session.staged_file_operation = Some(StagedFileOperation {
                    kind: StagedFileOperationKind::Delete,
                    source_root_id: root_id,
                    source_relative_path: relative_path,
                    source_fingerprint: fingerprint,
                    staged_at_revision: next_revision(session.revision)?,
                });
            }
        }
        session.revision = next_revision(session.revision)?;
        session.pending_proposal_id = None;
        let snapshot = session.snapshot(&self.instance_id);
        state
            .session_proposals
            .get_mut(proposal_id)
            .expect("proposal checked above")
            .status = ProposalStatus::Accepted;
        drop(state);
        self.event_sink.publish(&ApplicationEvent::SessionChanged {
            session_id: snapshot.session_id.clone(),
            revision: snapshot.revision,
        });
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

    pub fn create_document_proposal(
        &self,
        input: CreateDocumentProposalInput,
    ) -> CreateDocumentProposal {
        let mut state = self.lock_state();
        let proposal_id = next_id(&self.instance_id, &mut state, "create-proposal");
        let proposal = CreateDocumentProposal {
            id: proposal_id.clone(),
            suggested_file_name: ensure_markdown_file_name(&input.suggested_file_name),
            content: input.content.clone(),
            status: InstanceProposalStatus::Pending,
            unified_diff: unified_diff("", &input.content),
        };
        state
            .create_proposals
            .insert(proposal_id.clone(), proposal.clone());
        drop(state);
        self.event_sink
            .publish(&ApplicationEvent::InstanceProposalCreated { proposal_id });
        proposal
    }

    pub fn create_document_proposal_by_id(
        &self,
        proposal_id: &str,
    ) -> Result<CreateDocumentProposal, ApplicationError> {
        self.lock_state()
            .create_proposals
            .get(proposal_id)
            .cloned()
            .ok_or_else(proposal_not_found)
    }

    pub fn accept_create_document_proposal(
        &self,
        proposal_id: &str,
    ) -> Result<DocumentSnapshot, ApplicationError> {
        let mut state = self.lock_state();
        let proposal = state
            .create_proposals
            .get(proposal_id)
            .cloned()
            .ok_or_else(proposal_not_found)?;
        if proposal.status != InstanceProposalStatus::Pending {
            return Err(ApplicationError::new(
                ApplicationErrorCode::InvalidState,
                "proposal is not pending",
            ));
        }
        let session_id = next_id(&self.instance_id, &mut state, "session");
        let session = DocumentSession {
            id: session_id.clone(),
            revision: 1,
            file_name: proposal.suggested_file_name,
            file_path: None,
            root_id: None,
            relative_path: None,
            content: proposal.content,
            is_dirty: true,
            externally_visible: true,
            attached_window_label: None,
            persisted_fingerprint: None,
            pending_proposal_id: None,
            staged_file_operation: None,
        };
        let snapshot = session.snapshot(&self.instance_id);
        state.sessions.insert(session_id.clone(), session);
        state
            .create_proposals
            .get_mut(proposal_id)
            .expect("proposal checked above")
            .status = InstanceProposalStatus::Accepted { session_id };
        drop(state);
        self.event_sink.publish(&ApplicationEvent::SessionChanged {
            session_id: snapshot.session_id.clone(),
            revision: snapshot.revision,
        });
        Ok(snapshot)
    }

    pub fn reject_create_document_proposal(
        &self,
        proposal_id: &str,
    ) -> Result<(), ApplicationError> {
        let mut state = self.lock_state();
        let proposal = state
            .create_proposals
            .get_mut(proposal_id)
            .ok_or_else(proposal_not_found)?;
        if proposal.status != InstanceProposalStatus::Pending {
            return Err(ApplicationError::new(
                ApplicationErrorCode::InvalidState,
                "proposal is not pending",
            ));
        }
        proposal.status = InstanceProposalStatus::Rejected;
        Ok(())
    }

    pub fn pending_proposals(&self) -> (Vec<CreateDocumentProposal>, Vec<SessionProposal>) {
        let state = self.lock_state();
        let mut create = state
            .create_proposals
            .values()
            .filter(|proposal| proposal.status == InstanceProposalStatus::Pending)
            .cloned()
            .collect::<Vec<_>>();
        let mut session = state
            .session_proposals
            .values()
            .filter(|proposal| proposal.status == ProposalStatus::Pending)
            .cloned()
            .collect::<Vec<_>>();
        create.sort_by(|left, right| left.id.cmp(&right.id));
        session.sort_by(|left, right| left.id.cmp(&right.id));
        (create, session)
    }

    pub fn commit_staged_file_operation(
        &self,
        session_id: &str,
    ) -> Result<DocumentSnapshot, ApplicationError> {
        let (stage, content) = {
            let state = self.lock_state();
            let session = state
                .sessions
                .get(session_id)
                .ok_or_else(session_not_found)?;
            (
                session
                    .staged_file_operation
                    .clone()
                    .ok_or_else(staged_operation_not_found)?,
                session.content.clone(),
            )
        };
        let root = self.root(&stage.source_root_id)?;
        let current = self
            .file_repository
            .fingerprint(&root, &stage.source_relative_path)?;
        if current != stage.source_fingerprint {
            return Err(ApplicationError::new(
                ApplicationErrorCode::DiskFileChanged,
                "source file changed after the operation was staged",
            ));
        }

        let renamed = match &stage.kind {
            StagedFileOperationKind::Rename {
                target_relative_path,
            } => Some(self.file_repository.rename(
                &root,
                &stage.source_relative_path,
                target_relative_path,
            )?),
            StagedFileOperationKind::Delete => {
                self.file_repository
                    .move_to_trash(&root, &stage.source_relative_path)?;
                None
            }
        };

        let mut state = self.lock_state();
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(session_not_found)?;
        if session.staged_file_operation.as_ref() != Some(&stage) {
            return Err(ApplicationError::new(
                ApplicationErrorCode::InvalidState,
                "staged file operation changed while committing",
            ));
        }
        match renamed {
            Some(file) => {
                session.file_path = Some(file.absolute_path);
                session.relative_path = Some(file.relative_path.clone());
                session.file_name = PathBuf::from(file.relative_path)
                    .file_name()
                    .map(|value| value.to_string_lossy().into_owned())
                    .unwrap_or_else(|| session.file_name.clone());
                session.persisted_fingerprint = Some(file.fingerprint);
            }
            None => {
                session.file_path = None;
                session.root_id = None;
                session.relative_path = None;
                session.persisted_fingerprint = None;
                session.is_dirty = !content.is_empty();
            }
        }
        session.staged_file_operation = None;
        session.revision = next_revision(session.revision)?;
        let snapshot = session.snapshot(&self.instance_id);
        drop(state);
        self.event_sink.publish(&ApplicationEvent::SessionChanged {
            session_id: snapshot.session_id.clone(),
            revision: snapshot.revision,
        });
        Ok(snapshot)
    }

    pub fn cancel_staged_file_operation(
        &self,
        session_id: &str,
    ) -> Result<DocumentSnapshot, ApplicationError> {
        let mut state = self.lock_state();
        let session = state
            .sessions
            .get_mut(session_id)
            .ok_or_else(session_not_found)?;
        if session.staged_file_operation.take().is_none() {
            return Err(staged_operation_not_found());
        }
        session.revision = next_revision(session.revision)?;
        let snapshot = session.snapshot(&self.instance_id);
        drop(state);
        self.event_sink.publish(&ApplicationEvent::SessionChanged {
            session_id: snapshot.session_id.clone(),
            revision: snapshot.revision,
        });
        Ok(snapshot)
    }

    fn root(&self, root_id: &str) -> Result<RegisteredRoot, ApplicationError> {
        self.lock_state()
            .roots
            .iter()
            .find(|root| root.id == root_id)
            .cloned()
            .ok_or_else(|| {
                ApplicationError::new(
                    ApplicationErrorCode::RootNotFound,
                    "registered root not found",
                )
            })
    }

    fn mark_proposal_stale(&self, proposal_id: &str, session_id: &str) {
        let mut state = self.lock_state();
        if let Some(proposal) = state.session_proposals.get_mut(proposal_id) {
            proposal.status = ProposalStatus::StaleProposal;
        }
        if let Some(session) = state.sessions.get_mut(session_id) {
            session.pending_proposal_id = None;
        }
    }

    fn lock_state(&self) -> MutexGuard<'_, ApplicationState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
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

fn proposal_expected_revision(input: &SessionProposalInput) -> u64 {
    match input {
        SessionProposalInput::TextEdit {
            expected_revision, ..
        }
        | SessionProposalInput::RenameDocument {
            expected_revision, ..
        }
        | SessionProposalInput::DeleteDocument { expected_revision } => *expected_revision,
    }
}

fn build_proposal_kind(
    session: &DocumentSession,
    input: SessionProposalInput,
) -> Result<crate::model::SessionProposalKind, ApplicationError> {
    match input {
        SessionProposalInput::TextEdit { operations, .. } => {
            let _ = apply_text_edits(&session.content, &operations)?;
            Ok(crate::model::SessionProposalKind::TextEdit { operations })
        }
        SessionProposalInput::RenameDocument {
            target_relative_path,
            ..
        } => {
            if session.root_id.is_none() || session.relative_path.is_none() {
                return Err(ApplicationError::new(
                    ApplicationErrorCode::InvalidState,
                    "saved document is required for rename",
                ));
            }
            Ok(crate::model::SessionProposalKind::RenameDocument {
                target_relative_path,
            })
        }
        SessionProposalInput::DeleteDocument { .. } => {
            if session.root_id.is_none() || session.relative_path.is_none() {
                return Err(ApplicationError::new(
                    ApplicationErrorCode::InvalidState,
                    "saved document is required for delete",
                ));
            }
            Ok(crate::model::SessionProposalKind::DeleteDocument)
        }
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
    // FNV-1a is used only as an in-memory stale-content guard. Disk identity uses SHA-256.
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

fn staged_operation_not_found() -> ApplicationError {
    ApplicationError::new(
        ApplicationErrorCode::StagedOperationNotFound,
        "staged file operation not found",
    )
}

#[cfg(test)]
mod tests {
    use std::{path::Path, sync::Arc};

    use crate::{
        ApplicationError, ApplicationErrorCode, CreateDocumentProposalInput,
        DocumentFileRepository, FileEntry, FileFingerprint, ReadFileResult, RegisteredRoot,
        SearchMatch, SessionProposalInput, TextEdit,
    };

    use super::{ApplicationService, NoopApplicationEventSink};

    struct EmptyRepository;

    impl DocumentFileRepository for EmptyRepository {
        fn read_utf8(
            &self,
            _root: &RegisteredRoot,
            _relative_path: &str,
        ) -> Result<ReadFileResult, ApplicationError> {
            Err(ApplicationError::new(
                ApplicationErrorCode::FileNotFound,
                "not found",
            ))
        }

        fn list_entries(
            &self,
            _root: &RegisteredRoot,
            _relative_directory: &str,
            _limit: usize,
        ) -> Result<Vec<FileEntry>, ApplicationError> {
            Ok(Vec::new())
        }

        fn search_utf8(
            &self,
            _root: &RegisteredRoot,
            _query: &str,
            _limit: usize,
        ) -> Result<Vec<SearchMatch>, ApplicationError> {
            Ok(Vec::new())
        }

        fn fingerprint(
            &self,
            _root: &RegisteredRoot,
            _relative_path: &str,
        ) -> Result<FileFingerprint, ApplicationError> {
            Err(ApplicationError::new(
                ApplicationErrorCode::FileNotFound,
                "not found",
            ))
        }

        fn rename(
            &self,
            _root: &RegisteredRoot,
            _source_relative_path: &str,
            _target_relative_path: &str,
        ) -> Result<ReadFileResult, ApplicationError> {
            unreachable!()
        }

        fn move_to_trash(
            &self,
            _root: &RegisteredRoot,
            _relative_path: &str,
        ) -> Result<(), ApplicationError> {
            unreachable!()
        }

        fn resolve_registered_path(
            &self,
            _roots: &[RegisteredRoot],
            _absolute_path: &Path,
        ) -> Option<(String, String)> {
            None
        }
    }

    fn service() -> ApplicationService {
        ApplicationService::new(
            "instance",
            Arc::new(EmptyRepository),
            Arc::new(NoopApplicationEventSink),
        )
    }

    #[test]
    fn rejects_accept_when_session_revision_changed_after_proposal() {
        let service = service();
        let session = service
            .accept_create_document_proposal(
                &service
                    .create_document_proposal(CreateDocumentProposalInput {
                        suggested_file_name: "note.md".to_owned(),
                        content: "alpha".to_owned(),
                    })
                    .id,
            )
            .expect("create visible session");
        let proposal = service
            .create_session_proposal(
                &session.session_id,
                SessionProposalInput::TextEdit {
                    expected_revision: session.revision,
                    operations: vec![TextEdit {
                        start: 0,
                        end: 5,
                        text: "beta".to_owned(),
                    }],
                },
            )
            .expect("create proposal");
        service
            .sync_frontend_session(
                &session.session_id,
                session.revision,
                "note.md".to_owned(),
                None,
                "local edit".to_owned(),
                true,
            )
            .expect("edit session");

        let error = service
            .accept_session_proposal(&proposal.id)
            .expect_err("stale proposal must fail");

        assert_eq!(error.code(), ApplicationErrorCode::StaleProposal);
        assert_eq!(
            service
                .session_proposal(&proposal.id)
                .expect("proposal")
                .status
                .as_str(),
            "stale_proposal"
        );
        assert_eq!(
            service
                .session(&session.session_id)
                .expect("session")
                .content,
            "local edit"
        );
    }

    #[test]
    fn create_proposal_accepts_into_dirty_untitled_session_without_disk_path() {
        let service = service();
        let proposal = service.create_document_proposal(CreateDocumentProposalInput {
            suggested_file_name: "created".to_owned(),
            content: "# Created".to_owned(),
        });

        let session = service
            .accept_create_document_proposal(&proposal.id)
            .expect("accept create proposal");

        assert_eq!(session.file_name, "created.md");
        assert_eq!(session.file_path, None);
        assert!(session.is_dirty);
        assert_eq!(session.content, "# Created");
    }

    #[test]
    fn tracks_whether_a_session_has_an_attached_window() {
        let service = service();
        let session = service
            .accept_create_document_proposal(
                &service
                    .create_document_proposal(CreateDocumentProposalInput {
                        suggested_file_name: "note.md".to_owned(),
                        content: String::new(),
                    })
                    .id,
            )
            .expect("accept create proposal");

        assert!(!service
            .session_has_attached_window(&session.session_id)
            .expect("query unattached session"));

        service
            .attach_session(&session.session_id, "editor-window".to_owned())
            .expect("attach window");
        assert!(service
            .session_has_attached_window(&session.session_id)
            .expect("query attached session"));

        service.detach_window("editor-window");
        assert!(!service
            .session_has_attached_window(&session.session_id)
            .expect("query detached session"));
    }

    #[test]
    fn rejects_overlapping_and_non_utf8_boundary_edits() {
        let service = service();
        let session = service
            .accept_create_document_proposal(
                &service
                    .create_document_proposal(CreateDocumentProposalInput {
                        suggested_file_name: "note.md".to_owned(),
                        content: "あいう".to_owned(),
                    })
                    .id,
            )
            .expect("create visible session");

        let error = service
            .create_session_proposal(
                &session.session_id,
                SessionProposalInput::TextEdit {
                    expected_revision: session.revision,
                    operations: vec![TextEdit {
                        start: 1,
                        end: 3,
                        text: String::new(),
                    }],
                },
            )
            .expect_err("non-boundary edit must fail");

        assert_eq!(error.code(), ApplicationErrorCode::InvalidEditRange);
    }
}
