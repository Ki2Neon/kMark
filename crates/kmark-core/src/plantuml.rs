use std::fmt;

pub const MAX_PLANTUML_SOURCE_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlantUmlSourceError {
    MissingDiagram,
    UnmatchedStart {
        line: usize,
        directive: String,
    },
    MismatchedEnd {
        line: usize,
        expected: String,
        actual: String,
    },
    UnsupportedDirective {
        line: usize,
        directive: String,
    },
    SourceTooLarge {
        bytes: usize,
    },
}

impl PlantUmlSourceError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::SourceTooLarge { .. } => "plantuml_source_too_large",
            _ => "plantuml_source_invalid",
        }
    }
}

impl fmt::Display for PlantUmlSourceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingDiagram => write!(
                formatter,
                "PlantUML code block requires exactly one explicit @start/@end diagram with only whitespace outside it"
            ),
            Self::UnmatchedStart { line, directive } => {
                write!(formatter, "unclosed {directive} at line {line}")
            }
            Self::MismatchedEnd {
                line,
                expected,
                actual,
            } => {
                write!(
                    formatter,
                    "expected {expected} but found {actual} at line {line}"
                )
            }
            Self::UnsupportedDirective { line, directive } => write!(
                formatter,
                "{directive} at line {line} is unsupported; use one diagram per PlantUML code block"
            ),
            Self::SourceTooLarge { bytes } => write!(
                formatter,
                "PlantUML source is {bytes} bytes; maximum is {MAX_PLANTUML_SOURCE_BYTES} bytes"
            ),
        }
    }
}

impl std::error::Error for PlantUmlSourceError {}

pub fn normalize_plantuml_source(source: &str) -> Result<String, PlantUmlSourceError> {
    if source.len() > MAX_PLANTUML_SOURCE_BYTES {
        return Err(PlantUmlSourceError::SourceTooLarge {
            bytes: source.len(),
        });
    }

    let lines = lines_with_endings(source);
    let Some(start_index) = lines.iter().position(|line| !line.trim().is_empty()) else {
        return Err(PlantUmlSourceError::MissingDiagram);
    };
    let start_line = start_index + 1;
    let start_text = lines[start_index].trim();
    let Some((DirectiveKind::Start, diagram_kind)) = parse_directive(start_text) else {
        return Err(PlantUmlSourceError::MissingDiagram);
    };
    if diagram_kind.eq_ignore_ascii_case("def") {
        return Err(PlantUmlSourceError::MissingDiagram);
    }

    let start_directive = format!("@start{diagram_kind}");
    let end_directive = format!("@end{diagram_kind}");
    let mut normalized = String::new();
    let mut definition_depth = 0usize;
    let mut definition_start_line = None;
    let mut closed = false;

    for (index, line_with_ending) in lines.iter().enumerate().skip(start_index) {
        let line_number = index + 1;
        let trimmed = line_with_ending.trim();

        if closed {
            if trimmed.is_empty() {
                continue;
            }
            return Err(PlantUmlSourceError::UnsupportedDirective {
                line: line_number,
                directive: first_token(trimmed).to_owned(),
            });
        }

        normalized.push_str(line_with_ending);
        if index == start_index {
            continue;
        }
        if definition_depth == 0 && is_newpage_directive(trimmed) {
            return Err(PlantUmlSourceError::UnsupportedDirective {
                line: line_number,
                directive: "newpage".to_owned(),
            });
        }

        let Some((kind, name)) = parse_directive(trimmed) else {
            continue;
        };
        if name.eq_ignore_ascii_case("def") {
            match kind {
                DirectiveKind::Start => {
                    if definition_depth == 0 {
                        definition_start_line = Some(line_number);
                    }
                    definition_depth += 1;
                }
                DirectiveKind::End if definition_depth > 0 => {
                    definition_depth -= 1;
                    if definition_depth == 0 {
                        definition_start_line = None;
                    }
                }
                DirectiveKind::End => {
                    return Err(PlantUmlSourceError::MismatchedEnd {
                        line: line_number,
                        expected: end_directive.clone(),
                        actual: "@enddef".to_owned(),
                    });
                }
            }
            continue;
        }
        if definition_depth > 0 {
            continue;
        }

        match kind {
            DirectiveKind::Start => {
                return Err(PlantUmlSourceError::UnsupportedDirective {
                    line: line_number,
                    directive: format!("@start{name}"),
                });
            }
            DirectiveKind::End if name.eq_ignore_ascii_case(diagram_kind) => {
                closed = true;
            }
            DirectiveKind::End => {
                return Err(PlantUmlSourceError::MismatchedEnd {
                    line: line_number,
                    expected: end_directive.clone(),
                    actual: format!("@end{name}"),
                });
            }
        }
    }

    if let Some(line) = definition_start_line {
        return Err(PlantUmlSourceError::UnmatchedStart {
            line,
            directive: "@startdef".to_owned(),
        });
    }
    if !closed {
        return Err(PlantUmlSourceError::UnmatchedStart {
            line: start_line,
            directive: start_directive,
        });
    }

    Ok(normalized)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DirectiveKind {
    Start,
    End,
}

fn parse_directive(line: &str) -> Option<(DirectiveKind, &str)> {
    let token = line.split_ascii_whitespace().next()?;
    let lower = token.to_ascii_lowercase();
    let (kind, name_start) = if lower.starts_with("@start") {
        (DirectiveKind::Start, 6)
    } else if lower.starts_with("@end") {
        (DirectiveKind::End, 4)
    } else {
        return None;
    };
    let name = token.get(name_start..)?;

    (!name.is_empty()
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_'))
    .then_some((kind, name))
}

fn first_token(line: &str) -> &str {
    line.split_ascii_whitespace().next().unwrap_or("content")
}

fn is_newpage_directive(line: &str) -> bool {
    line.split_ascii_whitespace()
        .next()
        .is_some_and(|token| token.eq_ignore_ascii_case("newpage"))
}

fn lines_with_endings(source: &str) -> Vec<&str> {
    if source.is_empty() {
        return Vec::new();
    }

    let mut lines = Vec::new();
    let mut start = 0usize;
    let bytes = source.as_bytes();
    let mut index = 0usize;
    while index < bytes.len() {
        match bytes[index] {
            b'\r' if bytes.get(index + 1) == Some(&b'\n') => {
                lines.push(&source[start..index + 2]);
                index += 2;
                start = index;
            }
            b'\r' | b'\n' => {
                lines.push(&source[start..index + 1]);
                index += 1;
                start = index;
            }
            _ => index += 1,
        }
    }
    if start < source.len() {
        lines.push(&source[start..]);
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::{normalize_plantuml_source, PlantUmlSourceError};

    #[test]
    fn removes_whitespace_outside_one_diagram_and_preserves_internal_lines() {
        for newline in ["\n", "\r\n", "\r"] {
            let source = format!(
                " \t{newline}{newline}@startuml{newline}{newline}Alice -> Bob{newline}@enduml{newline} \t{newline}"
            );
            let expected =
                format!("@startuml{newline}{newline}Alice -> Bob{newline}@enduml{newline}");

            assert_eq!(normalize_plantuml_source(&source), Ok(expected));
        }
    }

    #[test]
    fn accepts_named_non_uml_diagram() {
        let source = "@startmindmap map\n* Root\n@endmindmap";
        assert_eq!(normalize_plantuml_source(source), Ok(source.to_owned()));
    }

    #[test]
    fn keeps_nested_definitions_inside_diagram() {
        let source = "@startuml\n@startdef common\n\n!define X 1\n@enddef\nAlice -> Bob\n@enduml";
        assert_eq!(normalize_plantuml_source(source), Ok(source.to_owned()));
    }

    #[test]
    fn rejects_non_whitespace_outside_diagram() {
        assert_eq!(
            normalize_plantuml_source("!define X 1\n@startuml\nAlice -> Bob\n@enduml"),
            Err(PlantUmlSourceError::MissingDiagram)
        );
        assert!(matches!(
            normalize_plantuml_source("@startuml\nAlice -> Bob\n@enduml\nfooter"),
            Err(PlantUmlSourceError::UnsupportedDirective { line: 4, .. })
        ));
    }

    #[test]
    fn rejects_multiple_or_nested_diagrams() {
        assert!(matches!(
            normalize_plantuml_source(
                "@startuml\nAlice -> Bob\n@enduml\n@startmindmap\n* Root\n@endmindmap"
            ),
            Err(PlantUmlSourceError::UnsupportedDirective { line: 4, .. })
        ));
        assert!(matches!(
            normalize_plantuml_source(
                "@startuml\nAlice -> Bob\n@startmindmap\n* Root\n@endmindmap\n@enduml"
            ),
            Err(PlantUmlSourceError::UnsupportedDirective { line: 3, .. })
        ));
    }

    #[test]
    fn rejects_newpage() {
        assert!(matches!(
            normalize_plantuml_source(
                "@startuml\nAlice -> Bob\nnewpage Second page\nBob -> Alice\n@enduml"
            ),
            Err(PlantUmlSourceError::UnsupportedDirective { line: 3, .. })
        ));
    }

    #[test]
    fn rejects_missing_mismatched_or_unclosed_diagram() {
        assert_eq!(
            normalize_plantuml_source("Alice -> Bob"),
            Err(PlantUmlSourceError::MissingDiagram)
        );
        assert!(matches!(
            normalize_plantuml_source("@startuml\nAlice -> Bob\n@endmindmap"),
            Err(PlantUmlSourceError::MismatchedEnd { line: 3, .. })
        ));
        assert!(matches!(
            normalize_plantuml_source("@startuml\nAlice -> Bob"),
            Err(PlantUmlSourceError::UnmatchedStart { line: 1, .. })
        ));
        assert!(matches!(
            normalize_plantuml_source("@startuml\n@startdef common\nAlice -> Bob\n@enduml"),
            Err(PlantUmlSourceError::UnmatchedStart { line: 2, .. })
        ));
    }

    #[test]
    fn rejects_source_above_limit() {
        let source = "x".repeat(super::MAX_PLANTUML_SOURCE_BYTES + 1);
        assert!(matches!(
            normalize_plantuml_source(&source),
            Err(PlantUmlSourceError::SourceTooLarge { .. })
        ));
    }
}
