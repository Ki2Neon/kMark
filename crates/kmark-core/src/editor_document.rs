use std::{collections::HashMap, io::Write, ops::Range};

use ropey::Rope;

const FIRST_BATCH_ID: u64 = 1;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LineEnding {
    #[default]
    Lf,
    CrLf,
}

impl LineEnding {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lf => "lf",
            Self::CrLf => "crlf",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NormalizedEditorText {
    pub text: String,
    pub line_ending: LineEnding,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditorTextChange {
    pub from_utf16: u64,
    pub to_utf16: u64,
    pub insert: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditorTransaction {
    pub before_length_utf16: u64,
    pub changes: Vec<EditorTextChange>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditorMutationBatch {
    pub client_id: String,
    pub batch_id: u64,
    pub expected_revision: u64,
    pub transactions: Vec<EditorTransaction>,
}

/// Exact character coordinates for a single-change batch. Complex batches return no
/// impact hint and must use the conservative full-preview invalidation path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditorMutationImpact {
    pub before_char_range: Range<usize>,
    pub after_char_range: Range<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditorMutationAck {
    pub client_id: String,
    pub batch_id: u64,
    pub revision: u64,
    pub document_length_utf16: u64,
    pub is_dirty: bool,
    pub replayed: bool,
}

#[derive(Clone, Debug)]
struct AppliedBatch {
    batch: EditorMutationBatch,
    ack: EditorMutationAck,
}

#[derive(Clone, Debug)]
pub struct EditorDocument {
    text: Rope,
    /// Persistent Rope snapshot of the last saved content. None means no known clean baseline.
    saved_text: Option<Rope>,
    revision: u64,
    line_ending: LineEnding,
    is_dirty: bool,
    last_batches: HashMap<String, AppliedBatch>,
}

/// Revision-stable Rope view used only at the persistence boundary.
#[derive(Clone, Debug)]
pub struct EditorDocumentPersistenceSnapshot {
    text: Rope,
    revision: u64,
    line_ending: LineEnding,
}

impl EditorDocumentPersistenceSnapshot {
    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Streams Rope chunks and restores the document line ending without a whole-document String.
    pub fn write_to<W>(&self, mut writer: W) -> std::io::Result<()>
    where
        W: Write,
    {
        match self.line_ending {
            LineEnding::Lf => self.text.write_to(writer),
            LineEnding::CrLf => {
                for chunk in self.text.chunks() {
                    write_crlf_chunk(&mut writer, chunk)?;
                }
                Ok(())
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EditorDocumentError {
    EmptyClientId,
    EmptyBatch,
    EmptyTransaction {
        transaction_index: usize,
    },
    UnexpectedBatchId {
        expected: u64,
        actual: u64,
    },
    BatchIdReuse {
        batch_id: u64,
    },
    StaleRevision {
        expected: u64,
        actual: u64,
    },
    InvalidTransactionLength {
        transaction_index: usize,
        expected: u64,
        actual: u64,
    },
    InvalidChangeRange {
        transaction_index: usize,
        change_index: usize,
        from_utf16: u64,
        to_utf16: u64,
    },
    OverlappingChanges {
        transaction_index: usize,
        change_index: usize,
    },
    InvalidUtf16Boundary {
        transaction_index: usize,
        change_index: usize,
        offset_utf16: u64,
    },
    NonCanonicalLineEnding {
        transaction_index: usize,
        change_index: usize,
    },
    OffsetOverflow,
    RevisionOverflow,
}

impl EditorDocumentError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::EmptyClientId => "empty_editor_client_id",
            Self::EmptyBatch => "empty_editor_mutation_batch",
            Self::EmptyTransaction { .. } => "empty_editor_transaction",
            Self::UnexpectedBatchId { .. } => "unexpected_editor_batch_id",
            Self::BatchIdReuse { .. } => "editor_batch_id_reuse",
            Self::StaleRevision { .. } => "stale_editor_revision",
            Self::InvalidTransactionLength { .. } => "invalid_editor_transaction_length",
            Self::InvalidChangeRange { .. } => "invalid_editor_change_range",
            Self::OverlappingChanges { .. } => "overlapping_editor_changes",
            Self::InvalidUtf16Boundary { .. } => "invalid_utf16_boundary",
            Self::NonCanonicalLineEnding { .. } => "non_canonical_editor_line_ending",
            Self::OffsetOverflow => "editor_offset_overflow",
            Self::RevisionOverflow => "editor_revision_overflow",
        }
    }
}

impl std::fmt::Display for EditorDocumentError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyClientId => write!(formatter, "editor client id must not be empty"),
            Self::EmptyBatch => write!(formatter, "editor mutation batch must not be empty"),
            Self::EmptyTransaction { transaction_index } => write!(
                formatter,
                "editor transaction {transaction_index} must contain at least one change"
            ),
            Self::UnexpectedBatchId { expected, actual } => write!(
                formatter,
                "unexpected editor batch id: expected {expected}, got {actual}"
            ),
            Self::BatchIdReuse { batch_id } => write!(
                formatter,
                "editor batch id {batch_id} was reused with a different payload"
            ),
            Self::StaleRevision { expected, actual } => write!(
                formatter,
                "stale editor revision: expected {expected}, actual {actual}"
            ),
            Self::InvalidTransactionLength {
                transaction_index,
                expected,
                actual,
            } => write!(
                formatter,
                "invalid UTF-16 length before transaction {transaction_index}: expected {expected}, actual {actual}"
            ),
            Self::InvalidChangeRange {
                transaction_index,
                change_index,
                from_utf16,
                to_utf16,
            } => write!(
                formatter,
                "invalid change range at transaction {transaction_index}, change {change_index}: {from_utf16}..{to_utf16}"
            ),
            Self::OverlappingChanges {
                transaction_index,
                change_index,
            } => write!(
                formatter,
                "overlapping or unordered change at transaction {transaction_index}, change {change_index}"
            ),
            Self::InvalidUtf16Boundary {
                transaction_index,
                change_index,
                offset_utf16,
            } => write!(
                formatter,
                "invalid UTF-16 scalar boundary at transaction {transaction_index}, change {change_index}: {offset_utf16}"
            ),
            Self::NonCanonicalLineEnding {
                transaction_index,
                change_index,
            } => write!(
                formatter,
                "inserted text contains a non-canonical carriage return at transaction {transaction_index}, change {change_index}"
            ),
            Self::OffsetOverflow => write!(formatter, "editor UTF-16 offset exceeds platform limits"),
            Self::RevisionOverflow => write!(formatter, "editor revision overflow"),
        }
    }
}

impl std::error::Error for EditorDocumentError {}

impl EditorDocument {
    pub fn from_external_text(text: &str, revision: u64, is_dirty: bool) -> Self {
        let normalized = normalize_editor_text(text);
        Self::from_canonical_text(normalized.text, revision, normalized.line_ending, is_dirty)
            .expect("line-ending normalization must produce canonical LF text")
    }

    pub fn from_canonical_text(
        text: String,
        revision: u64,
        line_ending: LineEnding,
        is_dirty: bool,
    ) -> Result<Self, EditorDocumentError> {
        if text.contains('\r') {
            return Err(EditorDocumentError::NonCanonicalLineEnding {
                transaction_index: 0,
                change_index: 0,
            });
        }

        let text = Rope::from_str(&text);
        Ok(Self {
            saved_text: (!is_dirty).then(|| text.clone()),
            text,
            revision,
            line_ending,
            is_dirty,
            last_batches: HashMap::new(),
        })
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn line_ending(&self) -> LineEnding {
        self.line_ending
    }

    pub fn is_dirty(&self) -> bool {
        self.is_dirty
    }

    pub fn len_utf16(&self) -> usize {
        self.text.len_utf16_cu()
    }

    pub fn canonical_text(&self) -> String {
        self.text.to_string()
    }

    /// Returns only the requested canonical character range. Positions are Rope character
    /// offsets, not UTF-16 offsets from the mutation contract.
    pub(crate) fn canonical_text_range(&self, char_range: Range<usize>) -> Option<String> {
        self.text
            .get_slice(char_range)
            .map(|slice| slice.to_string())
    }

    pub(crate) fn canonical_rope(&self) -> &Rope {
        &self.text
    }

    pub fn persisted_text(&self) -> String {
        let extra_capacity = match self.line_ending {
            LineEnding::Lf => 0,
            LineEnding::CrLf => self.text.len_lines().saturating_sub(1),
        };
        let mut bytes = Vec::with_capacity(self.text.len_bytes() + extra_capacity);
        self.persistence_snapshot()
            .write_to(&mut bytes)
            .expect("writing an editor snapshot to memory must not fail");
        String::from_utf8(bytes).expect("an editor snapshot must remain valid UTF-8")
    }

    pub fn persistence_snapshot(&self) -> EditorDocumentPersistenceSnapshot {
        EditorDocumentPersistenceSnapshot {
            text: self.text.clone(),
            revision: self.revision,
            line_ending: self.line_ending,
        }
    }

    pub fn mark_saved(&mut self) {
        self.saved_text = Some(self.text.clone());
        self.is_dirty = false;
    }

    pub fn replace_canonical_text(
        &mut self,
        text: String,
        is_dirty: bool,
    ) -> Result<(), EditorDocumentError> {
        if text.contains('\r') {
            return Err(EditorDocumentError::NonCanonicalLineEnding {
                transaction_index: 0,
                change_index: 0,
            });
        }

        let next_revision = self.next_revision()?;
        self.text = Rope::from_str(&text);
        self.saved_text = (!is_dirty).then(|| self.text.clone());
        self.is_dirty = is_dirty;
        self.revision = next_revision;
        Ok(())
    }

    pub fn set_dirty_and_touch(&mut self, is_dirty: bool) -> Result<(), EditorDocumentError> {
        let next_revision = self.next_revision()?;
        self.saved_text = (!is_dirty).then(|| self.text.clone());
        self.is_dirty = is_dirty;
        self.revision = next_revision;
        Ok(())
    }

    pub fn touch(&mut self) -> Result<(), EditorDocumentError> {
        self.advance_revision()
    }

    pub fn set_line_ending(&mut self, line_ending: LineEnding) {
        self.line_ending = line_ending;
    }

    /// Computes a preview invalidation hint before applying a mutation. This does not
    /// validate the batch ID; `apply_mutation_batch` remains the source of truth.
    pub fn single_change_impact(
        &self,
        batch: &EditorMutationBatch,
    ) -> Option<EditorMutationImpact> {
        if batch.expected_revision != self.revision || batch.transactions.len() != 1 {
            return None;
        }
        let transaction = &batch.transactions[0];
        if transaction.changes.len() != 1
            || usize::try_from(transaction.before_length_utf16).ok()? != self.len_utf16()
        {
            return None;
        }
        let change = &transaction.changes[0];
        if change.from_utf16 > change.to_utf16 || change.insert.contains('\r') {
            return None;
        }
        let from = strict_utf16_to_char(&self.text, change.from_utf16, 0, 0).ok()?;
        let to = strict_utf16_to_char(&self.text, change.to_utf16, 0, 0).ok()?;
        Some(EditorMutationImpact {
            before_char_range: from..to,
            after_char_range: from..from.checked_add(change.insert.chars().count())?,
        })
    }

    pub fn apply_mutation_batch(
        &mut self,
        batch: &EditorMutationBatch,
    ) -> Result<EditorMutationAck, EditorDocumentError> {
        if batch.client_id.trim().is_empty() {
            return Err(EditorDocumentError::EmptyClientId);
        }

        if let Some(applied) = self.last_batches.get(&batch.client_id) {
            if batch.batch_id == applied.batch.batch_id {
                if batch == &applied.batch {
                    let mut replayed = applied.ack.clone();
                    replayed.replayed = true;
                    if replayed.revision == self.revision {
                        replayed.is_dirty = self.is_dirty;
                    }
                    return Ok(replayed);
                }

                return Err(EditorDocumentError::BatchIdReuse {
                    batch_id: batch.batch_id,
                });
            }

            let expected_batch_id = applied
                .batch
                .batch_id
                .checked_add(1)
                .ok_or(EditorDocumentError::RevisionOverflow)?;
            if batch.batch_id != expected_batch_id {
                return Err(EditorDocumentError::UnexpectedBatchId {
                    expected: expected_batch_id,
                    actual: batch.batch_id,
                });
            }
        } else if batch.batch_id != FIRST_BATCH_ID {
            return Err(EditorDocumentError::UnexpectedBatchId {
                expected: FIRST_BATCH_ID,
                actual: batch.batch_id,
            });
        }

        if batch.expected_revision != self.revision {
            return Err(EditorDocumentError::StaleRevision {
                expected: batch.expected_revision,
                actual: self.revision,
            });
        }
        if batch.transactions.is_empty() {
            return Err(EditorDocumentError::EmptyBatch);
        }

        let mut candidate = self.text.clone();
        for (transaction_index, transaction) in batch.transactions.iter().enumerate() {
            apply_transaction(&mut candidate, transaction, transaction_index)?;
        }

        let next_revision = self
            .revision
            .checked_add(1)
            .ok_or(EditorDocumentError::RevisionOverflow)?;
        let document_length_utf16 = u64::try_from(candidate.len_utf16_cu())
            .map_err(|_| EditorDocumentError::OffsetOverflow)?;
        let is_dirty = self
            .saved_text
            .as_ref()
            .is_none_or(|saved| saved != &candidate);
        let ack = EditorMutationAck {
            client_id: batch.client_id.clone(),
            batch_id: batch.batch_id,
            revision: next_revision,
            document_length_utf16,
            is_dirty,
            replayed: false,
        };

        self.text = candidate;
        self.revision = next_revision;
        self.is_dirty = is_dirty;
        self.last_batches.insert(
            batch.client_id.clone(),
            AppliedBatch {
                batch: batch.clone(),
                ack: ack.clone(),
            },
        );
        Ok(ack)
    }

    fn advance_revision(&mut self) -> Result<(), EditorDocumentError> {
        self.revision = self.next_revision()?;
        Ok(())
    }

    fn next_revision(&self) -> Result<u64, EditorDocumentError> {
        self.revision
            .checked_add(1)
            .ok_or(EditorDocumentError::RevisionOverflow)
    }
}

fn write_crlf_chunk<W>(writer: &mut W, chunk: &str) -> std::io::Result<()>
where
    W: Write,
{
    let bytes = chunk.as_bytes();
    let mut segment_start = 0;
    for (index, byte) in bytes.iter().enumerate() {
        if *byte != b'\n' {
            continue;
        }
        writer.write_all(&bytes[segment_start..index])?;
        writer.write_all(b"\r\n")?;
        segment_start = index + 1;
    }
    writer.write_all(&bytes[segment_start..])
}

pub fn normalize_editor_text(input: &str) -> NormalizedEditorText {
    let bytes = input.as_bytes();
    let mut crlf_count = 0usize;
    let mut lf_count = 0usize;
    let mut first_ending = None;
    let mut cursor = 0usize;

    while cursor < bytes.len() {
        match bytes[cursor] {
            b'\r' if bytes.get(cursor + 1) == Some(&b'\n') => {
                crlf_count += 1;
                first_ending.get_or_insert(LineEnding::CrLf);
                cursor += 2;
            }
            b'\r' | b'\n' => {
                lf_count += 1;
                first_ending.get_or_insert(LineEnding::Lf);
                cursor += 1;
            }
            _ => cursor += 1,
        }
    }

    let line_ending = if crlf_count > lf_count {
        LineEnding::CrLf
    } else if crlf_count < lf_count {
        LineEnding::Lf
    } else {
        first_ending.unwrap_or(LineEnding::Lf)
    };
    let text = if input.contains('\r') {
        input.replace("\r\n", "\n").replace('\r', "\n")
    } else {
        input.to_owned()
    };

    NormalizedEditorText { text, line_ending }
}

fn apply_transaction(
    rope: &mut Rope,
    transaction: &EditorTransaction,
    transaction_index: usize,
) -> Result<(), EditorDocumentError> {
    let actual_length =
        u64::try_from(rope.len_utf16_cu()).map_err(|_| EditorDocumentError::OffsetOverflow)?;
    if transaction.before_length_utf16 != actual_length {
        return Err(EditorDocumentError::InvalidTransactionLength {
            transaction_index,
            expected: transaction.before_length_utf16,
            actual: actual_length,
        });
    }
    if transaction.changes.is_empty() {
        return Err(EditorDocumentError::EmptyTransaction { transaction_index });
    }

    let mut validated = Vec::with_capacity(transaction.changes.len());
    let mut previous_to = 0u64;
    for (change_index, change) in transaction.changes.iter().enumerate() {
        if change.from_utf16 > change.to_utf16 || change.to_utf16 > actual_length {
            return Err(EditorDocumentError::InvalidChangeRange {
                transaction_index,
                change_index,
                from_utf16: change.from_utf16,
                to_utf16: change.to_utf16,
            });
        }
        if change_index > 0 && change.from_utf16 < previous_to {
            return Err(EditorDocumentError::OverlappingChanges {
                transaction_index,
                change_index,
            });
        }
        if change.insert.contains('\r') {
            return Err(EditorDocumentError::NonCanonicalLineEnding {
                transaction_index,
                change_index,
            });
        }

        let from_char =
            strict_utf16_to_char(rope, change.from_utf16, transaction_index, change_index)?;
        let to_char = strict_utf16_to_char(rope, change.to_utf16, transaction_index, change_index)?;
        validated.push((from_char, to_char, change.insert.as_str()));
        previous_to = change.to_utf16;
    }

    for (from_char, to_char, insert) in validated.into_iter().rev() {
        rope.remove(from_char..to_char);
        rope.insert(from_char, insert);
    }
    Ok(())
}

fn strict_utf16_to_char(
    rope: &Rope,
    offset_utf16: u64,
    transaction_index: usize,
    change_index: usize,
) -> Result<usize, EditorDocumentError> {
    let offset = usize::try_from(offset_utf16).map_err(|_| EditorDocumentError::OffsetOverflow)?;
    let char_index = rope.try_utf16_cu_to_char(offset).map_err(|_| {
        EditorDocumentError::InvalidUtf16Boundary {
            transaction_index,
            change_index,
            offset_utf16,
        }
    })?;
    if rope.char_to_utf16_cu(char_index) != offset {
        return Err(EditorDocumentError::InvalidUtf16Boundary {
            transaction_index,
            change_index,
            offset_utf16,
        });
    }
    Ok(char_index)
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::{
        normalize_editor_text, EditorDocument, EditorDocumentError, EditorMutationBatch,
        EditorTextChange, EditorTransaction, LineEnding,
    };

    fn batch(
        expected_revision: u64,
        batch_id: u64,
        transactions: Vec<EditorTransaction>,
    ) -> EditorMutationBatch {
        EditorMutationBatch {
            client_id: "view-1".to_owned(),
            batch_id,
            expected_revision,
            transactions,
        }
    }

    fn transaction(before_length_utf16: u64, changes: Vec<EditorTextChange>) -> EditorTransaction {
        EditorTransaction {
            before_length_utf16,
            changes,
        }
    }

    fn change(from_utf16: u64, to_utf16: u64, insert: &str) -> EditorTextChange {
        EditorTextChange {
            from_utf16,
            to_utf16,
            insert: insert.to_owned(),
        }
    }

    #[test]
    fn single_change_impact_uses_rope_character_coordinates() {
        let document = EditorDocument::from_external_text("a🙂b\n", 7, false);
        let mutation = batch(7, 1, vec![transaction(5, vec![change(3, 4, "語🚀")])]);

        let impact = document.single_change_impact(&mutation).unwrap();
        assert_eq!(impact.before_char_range, 2..3);
        assert_eq!(impact.after_char_range, 2..4);
        assert_eq!(document.canonical_text(), "a🙂b\n");
        assert_eq!(
            document.single_change_impact(&batch(
                7,
                1,
                vec![transaction(5, vec![change(2, 3, "x")])],
            )),
            None
        );
    }

    #[test]
    fn complex_mutation_has_no_single_section_hint() {
        let document = EditorDocument::from_external_text("abc", 1, false);
        let mutation = batch(
            1,
            1,
            vec![transaction(3, vec![change(0, 0, "x"), change(2, 2, "y")])],
        );
        assert_eq!(document.single_change_impact(&mutation), None);
    }

    #[test]
    fn normalizes_crlf_and_cr_to_lf_and_detects_dominant_style() {
        let normalized = normalize_editor_text("a\r\nb\nc\rd\n");

        assert_eq!(normalized.text, "a\nb\nc\nd\n");
        assert_eq!(normalized.line_ending, LineEnding::Lf);

        let normalized = normalize_editor_text("a\r\nb\r\nc\n");
        assert_eq!(normalized.line_ending, LineEnding::CrLf);
    }

    #[test]
    fn restores_crlf_only_at_persistence_boundary() {
        let document = EditorDocument::from_external_text("a\r\nb\r\n", 7, false);

        assert_eq!(document.canonical_text(), "a\nb\n");
        assert_eq!(document.persisted_text(), "a\r\nb\r\n");
        assert_eq!(document.line_ending(), LineEnding::CrLf);
    }

    #[test]
    fn persistence_snapshot_streams_crlf_and_remains_revision_stable() {
        #[derive(Default)]
        struct TrackingWriter {
            bytes: Vec<u8>,
            largest_write: usize,
        }

        impl Write for TrackingWriter {
            fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
                self.largest_write = self.largest_write.max(buffer.len());
                self.bytes.extend_from_slice(buffer);
                Ok(buffer.len())
            }

            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }

        let external = "日本語\r\n".repeat(4_000);
        let mut document = EditorDocument::from_external_text(&external, 7, false);
        let snapshot = document.persistence_snapshot();
        document
            .apply_mutation_batch(&batch(
                7,
                1,
                vec![transaction(16_000, vec![change(0, 0, "更新\n")])],
            ))
            .unwrap();

        let mut writer = TrackingWriter::default();
        snapshot.write_to(&mut writer).unwrap();

        assert_eq!(snapshot.revision(), 7);
        assert_eq!(String::from_utf8(writer.bytes).unwrap(), external);
        assert!(writer.largest_write < external.len());
        assert_eq!(document.revision(), 8);
    }

    #[test]
    fn applies_ascii_japanese_emoji_and_combining_changes_atomically() {
        let mut document = EditorDocument::from_external_text("a日本🙂e\u{301}", 40, false);
        let first = transaction(7, vec![change(1, 3, "語")]);
        let second = transaction(6, vec![change(2, 4, "🚀")]);

        let ack = document
            .apply_mutation_batch(&batch(40, 1, vec![first, second]))
            .unwrap();

        assert_eq!(document.canonical_text(), "a語🚀e\u{301}");
        assert_eq!(document.revision(), 41);
        assert_eq!(ack.revision, 41);
        assert_eq!(ack.document_length_utf16, 6);
        assert!(document.is_dirty());
    }

    #[test]
    fn undo_to_saved_rope_clears_dirty_even_for_same_length_unicode_edits() {
        let mut document = EditorDocument::from_external_text("a🙂b", 1, false);
        let edit = document
            .apply_mutation_batch(&batch(1, 1, vec![transaction(4, vec![change(1, 3, "🚀")])]))
            .unwrap();
        assert!(edit.is_dirty);
        assert!(document.is_dirty());

        let undo = document
            .apply_mutation_batch(&batch(2, 2, vec![transaction(4, vec![change(1, 3, "🙂")])]))
            .unwrap();
        assert!(!undo.is_dirty);
        assert!(!document.is_dirty());
        assert_eq!(document.canonical_text(), "a🙂b");

        document.mark_saved();
        let next_edit = document
            .apply_mutation_batch(&batch(3, 3, vec![transaction(4, vec![change(0, 1, "x")])]))
            .unwrap();
        assert!(next_edit.is_dirty);
        let next_undo = document
            .apply_mutation_batch(&batch(4, 4, vec![transaction(4, vec![change(0, 1, "a")])]))
            .unwrap();
        assert!(!next_undo.is_dirty);
    }

    #[test]
    fn unknown_saved_baseline_stays_dirty_until_saved() {
        let mut document = EditorDocument::from_external_text("a", 1, true);
        let ack = document
            .apply_mutation_batch(&batch(1, 1, vec![transaction(1, vec![change(0, 1, "a")])]))
            .unwrap();
        assert!(ack.is_dirty);
        document.mark_saved();
        assert!(!document.is_dirty());
    }

    #[test]
    fn replay_after_save_marker_reports_current_dirty_state() {
        let mut document = EditorDocument::from_external_text("a", 1, false);
        let mutation = batch(1, 1, vec![transaction(1, vec![change(1, 1, "b")])]);
        assert!(document.apply_mutation_batch(&mutation).unwrap().is_dirty);
        document.mark_saved();
        let replay = document.apply_mutation_batch(&mutation).unwrap();
        assert!(replay.replayed);
        assert!(!replay.is_dirty);
    }

    #[test]
    fn rejects_both_boundaries_inside_surrogate_pair_without_mutation() {
        for (from, to) in [(2, 3), (1, 2)] {
            let mut document = EditorDocument::from_external_text("a🙂b", 10, false);
            let error = document
                .apply_mutation_batch(&batch(
                    10,
                    1,
                    vec![transaction(4, vec![change(from, to, "x")])],
                ))
                .unwrap_err();

            assert!(matches!(
                error,
                EditorDocumentError::InvalidUtf16Boundary { .. }
            ));
            assert_eq!(document.canonical_text(), "a🙂b");
            assert_eq!(document.revision(), 10);
            assert!(!document.is_dirty());
        }
    }

    #[test]
    fn allows_scalar_boundary_between_base_and_combining_character() {
        let mut document = EditorDocument::from_external_text("e\u{301}", 1, false);
        document
            .apply_mutation_batch(&batch(1, 1, vec![transaction(2, vec![change(1, 1, "x")])]))
            .unwrap();

        assert_eq!(document.canonical_text(), "ex\u{301}");
    }

    #[test]
    fn failed_later_transaction_rolls_back_entire_batch() {
        let mut document = EditorDocument::from_external_text("abc", 3, false);
        let error = document
            .apply_mutation_batch(&batch(
                3,
                1,
                vec![
                    transaction(3, vec![change(0, 1, "x")]),
                    transaction(99, vec![change(0, 1, "y")]),
                ],
            ))
            .unwrap_err();

        assert!(matches!(
            error,
            EditorDocumentError::InvalidTransactionLength {
                transaction_index: 1,
                ..
            }
        ));
        assert_eq!(document.canonical_text(), "abc");
        assert_eq!(document.revision(), 3);
        assert!(!document.is_dirty());
    }

    #[test]
    fn identical_retry_returns_cached_ack_before_revision_check() {
        let mut document = EditorDocument::from_external_text("a", 8, false);
        let mutation = batch(8, 1, vec![transaction(1, vec![change(1, 1, "b")])]);
        let first = document.apply_mutation_batch(&mutation).unwrap();
        let replay = document.apply_mutation_batch(&mutation).unwrap();

        assert!(!first.replayed);
        assert!(replay.replayed);
        assert_eq!(replay.revision, 9);
        assert_eq!(document.canonical_text(), "ab");
        assert_eq!(document.revision(), 9);
    }

    #[test]
    fn batch_id_reuse_with_different_payload_is_rejected() {
        let mut document = EditorDocument::from_external_text("a", 1, false);
        document
            .apply_mutation_batch(&batch(1, 1, vec![transaction(1, vec![change(1, 1, "b")])]))
            .unwrap();
        let error = document
            .apply_mutation_batch(&batch(1, 1, vec![transaction(1, vec![change(1, 1, "c")])]))
            .unwrap_err();

        assert_eq!(error, EditorDocumentError::BatchIdReuse { batch_id: 1 });
        assert_eq!(document.canonical_text(), "ab");
    }

    #[test]
    fn multi_cursor_changes_use_pre_transaction_coordinates() {
        let mut document = EditorDocument::from_external_text("abcd", 1, false);
        document
            .apply_mutation_batch(&batch(
                1,
                1,
                vec![transaction(4, vec![change(1, 1, "X"), change(3, 4, "Y")])],
            ))
            .unwrap();

        assert_eq!(document.canonical_text(), "aXbcY");
    }

    #[test]
    fn rejects_carriage_return_insert() {
        let mut document = EditorDocument::from_external_text("a", 1, false);
        let error = document
            .apply_mutation_batch(&batch(
                1,
                1,
                vec![transaction(1, vec![change(1, 1, "\r\n")])],
            ))
            .unwrap_err();

        assert!(matches!(
            error,
            EditorDocumentError::NonCanonicalLineEnding { .. }
        ));
    }
}
