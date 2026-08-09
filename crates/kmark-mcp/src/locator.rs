use kmark_api_contract::TextEditOperationPayload;

pub fn exact_text_edit(
    content: &str,
    expected_text: &str,
    occurrence: Option<u32>,
    replacement: String,
) -> Result<TextEditOperationPayload, LocatorError> {
    if expected_text.is_empty() {
        return Err(LocatorError::EmptyExpectedText);
    }
    let matches = content
        .match_indices(expected_text)
        .map(|(start, _)| start)
        .collect::<Vec<_>>();
    let start = match occurrence {
        Some(value) if value > 0 => matches
            .get((value - 1) as usize)
            .copied()
            .ok_or(LocatorError::OccurrenceNotFound)?,
        Some(_) => return Err(LocatorError::InvalidOccurrence),
        None if matches.len() == 1 => matches[0],
        None if matches.is_empty() => return Err(LocatorError::ExpectedTextNotFound),
        None => return Err(LocatorError::AmbiguousExpectedText),
    };
    Ok(TextEditOperationPayload {
        start,
        end: start + expected_text.len(),
        text: replacement,
    })
}

pub fn line_range_edit(
    content: &str,
    start_line: u32,
    end_line: u32,
    expected_text: &str,
    replacement: String,
) -> Result<TextEditOperationPayload, LocatorError> {
    if start_line == 0 || end_line < start_line {
        return Err(LocatorError::InvalidLineRange);
    }
    let starts = line_starts(content);
    let start_index =
        usize::try_from(start_line - 1).map_err(|_| LocatorError::InvalidLineRange)?;
    let end_index = usize::try_from(end_line - 1).map_err(|_| LocatorError::InvalidLineRange)?;
    let start = *starts.get(start_index).ok_or(LocatorError::LineNotFound)?;
    let raw_end = starts.get(end_index + 1).copied().unwrap_or(content.len());
    let end = if content[..raw_end].ends_with("\r\n") {
        raw_end - 2
    } else if content[..raw_end].ends_with('\n') {
        raw_end - 1
    } else {
        raw_end
    };
    if content.get(start..end) != Some(expected_text) {
        return Err(LocatorError::ExpectedTextMismatch);
    }
    Ok(TextEditOperationPayload {
        start,
        end,
        text: replacement,
    })
}

fn line_starts(content: &str) -> Vec<usize> {
    std::iter::once(0)
        .chain(
            content
                .bytes()
                .enumerate()
                .filter_map(|(index, byte)| (byte == b'\n').then_some(index + 1)),
        )
        .collect()
}

#[derive(Debug, thiserror::Error)]
pub enum LocatorError {
    #[error("expected text must not be empty")]
    EmptyExpectedText,
    #[error("expected text was not found in the current revision")]
    ExpectedTextNotFound,
    #[error("expected text occurs multiple times; specify a 1-based occurrence")]
    AmbiguousExpectedText,
    #[error("occurrence must be 1 or greater")]
    InvalidOccurrence,
    #[error("the requested occurrence was not found")]
    OccurrenceNotFound,
    #[error("line range must be 1-based and ordered")]
    InvalidLineRange,
    #[error("line range exceeds the document")]
    LineNotFound,
    #[error("expected text does not match the selected lines in the current revision")]
    ExpectedTextMismatch,
}

#[cfg(test)]
mod tests {
    use super::{exact_text_edit, line_range_edit};

    #[test]
    fn exact_locator_returns_utf8_byte_offsets() {
        let edit = exact_text_edit("前alpha後", "alpha", None, "beta".to_owned()).unwrap();
        assert_eq!((edit.start, edit.end), (3, 8));
    }

    #[test]
    fn ambiguous_exact_locator_requires_occurrence() {
        assert!(exact_text_edit("x x", "x", None, "y".to_owned()).is_err());
        let edit = exact_text_edit("x x", "x", Some(2), "y".to_owned()).unwrap();
        assert_eq!((edit.start, edit.end), (2, 3));
    }

    #[test]
    fn line_locator_excludes_trailing_newline() {
        let edit = line_range_edit("一\ntwo\nthree\n", 2, 3, "two\nthree", "x".to_owned()).unwrap();
        assert_eq!(&"一\ntwo\nthree\n"[edit.start..edit.end], "two\nthree");
    }
}
