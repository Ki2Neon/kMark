use std::fmt;

pub const MAX_PLANTUML_SOURCE_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlantUmlSourceError {
    MissingDiagram,
    UnmatchedStart {
        line: usize,
        directive: String,
    },
    UnexpectedEnd {
        line: usize,
        directive: String,
    },
    MismatchedEnd {
        line: usize,
        expected: String,
        actual: String,
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
            Self::MissingDiagram => write!(formatter, "PlantUML source requires an explicit @start/@end diagram"),
            Self::UnmatchedStart { line, directive } => {
                write!(formatter, "unclosed {directive} at line {line}")
            }
            Self::UnexpectedEnd { line, directive } => {
                write!(formatter, "unexpected {directive} at line {line}")
            }
            Self::MismatchedEnd { line, expected, actual } => {
                write!(formatter, "expected {expected} but found {actual} at line {line}")
            }
            Self::SourceTooLarge { bytes } => write!(
                formatter,
                "expanded PlantUML source is {bytes} bytes; maximum is {MAX_PLANTUML_SOURCE_BYTES} bytes"
            ),
        }
    }
}

impl std::error::Error for PlantUmlSourceError {}

#[derive(Debug)]
struct OpenDiagram {
    start_line: usize,
    start_directive: String,
    end_directive: String,
    source: String,
}

pub fn split_plantuml_source(source: &str) -> Result<Vec<String>, PlantUmlSourceError> {
    if source.len() > MAX_PLANTUML_SOURCE_BYTES {
        return Err(PlantUmlSourceError::SourceTooLarge {
            bytes: source.len(),
        });
    }
    let mut preamble = String::new();
    let mut diagrams = Vec::new();
    let mut open_diagram: Option<OpenDiagram> = None;
    let mut definition_depth = 0usize;

    for (line_index, line_with_ending) in lines_with_endings(source).into_iter().enumerate() {
        let line_number = line_index + 1;
        let trimmed = line_with_ending.trim();
        let directive = parse_directive(trimmed);

        if let Some(diagram) = open_diagram.as_mut() {
            diagram.source.push_str(line_with_ending);
            if let Some((kind, name)) = directive {
                if name.eq_ignore_ascii_case("def") {
                    match kind {
                        DirectiveKind::Start => definition_depth += 1,
                        DirectiveKind::End if definition_depth > 0 => definition_depth -= 1,
                        DirectiveKind::End => {
                            return Err(PlantUmlSourceError::MismatchedEnd {
                                line: line_number,
                                expected: diagram.end_directive.clone(),
                                actual: "@enddef".to_owned(),
                            });
                        }
                    }
                } else if kind == DirectiveKind::End && definition_depth == 0 {
                    let actual = format!("@end{name}");
                    if !name.eq_ignore_ascii_case(&diagram.end_directive[4..]) {
                        return Err(PlantUmlSourceError::MismatchedEnd {
                            line: line_number,
                            expected: diagram.end_directive.clone(),
                            actual,
                        });
                    }
                    diagrams.push(std::mem::take(&mut diagram.source));
                    open_diagram = None;
                    continue;
                }
            }
            continue;
        }

        match directive {
            Some((DirectiveKind::Start, name)) if name.eq_ignore_ascii_case("def") => {
                definition_depth += 1;
                preamble.push_str(line_with_ending);
            }
            Some((DirectiveKind::End, name)) if name.eq_ignore_ascii_case("def") => {
                if definition_depth == 0 {
                    return Err(PlantUmlSourceError::UnexpectedEnd {
                        line: line_number,
                        directive: "@enddef".to_owned(),
                    });
                }
                definition_depth -= 1;
                preamble.push_str(line_with_ending);
            }
            Some((DirectiveKind::Start, name)) if definition_depth == 0 => {
                let end_directive = format!("@end{name}");
                open_diagram = Some(OpenDiagram {
                    start_line: line_number,
                    start_directive: format!("@start{name}"),
                    end_directive,
                    source: line_with_ending.to_owned(),
                });
            }
            Some((DirectiveKind::End, name)) if definition_depth == 0 => {
                return Err(PlantUmlSourceError::UnexpectedEnd {
                    line: line_number,
                    directive: format!("@end{name}"),
                });
            }
            _ => preamble.push_str(line_with_ending),
        }
    }

    if let Some(diagram) = open_diagram {
        return Err(PlantUmlSourceError::UnmatchedStart {
            line: diagram.start_line,
            directive: diagram.start_directive,
        });
    }
    if definition_depth != 0 {
        return Err(PlantUmlSourceError::UnmatchedStart {
            line: 1,
            directive: "@startdef".to_owned(),
        });
    }
    if diagrams.is_empty() {
        return Err(PlantUmlSourceError::MissingDiagram);
    }

    diagrams
        .into_iter()
        .map(|diagram| {
            let expanded = format!("{preamble}{diagram}");
            if expanded.len() > MAX_PLANTUML_SOURCE_BYTES {
                Err(PlantUmlSourceError::SourceTooLarge {
                    bytes: expanded.len(),
                })
            } else {
                Ok(expanded)
            }
        })
        .collect()
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

fn lines_with_endings(source: &str) -> Vec<&str> {
    if source.is_empty() {
        return Vec::new();
    }

    let mut lines = Vec::new();
    let mut start = 0usize;
    for (index, character) in source.char_indices() {
        if character == '\n' {
            lines.push(&source[start..index + 1]);
            start = index + 1;
        }
    }
    if start < source.len() {
        lines.push(&source[start..]);
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::{split_plantuml_source, PlantUmlSourceError};

    #[test]
    fn splits_multiple_explicit_diagrams_and_prepends_all_preamble() {
        let source = "!define COLOR blue\n@startuml\nAlice -> Bob\n@enduml\n@startdef common\n!define X 1\n@enddef\n@startmindmap\n* Root\n@endmindmap\nskinparam shadowing false\n";
        let diagrams = split_plantuml_source(source).expect("split failed");

        assert_eq!(diagrams.len(), 2);
        assert!(diagrams[0].starts_with("!define COLOR blue\n@startdef common"));
        assert!(diagrams[0].contains("skinparam shadowing false\n@startuml"));
        assert!(diagrams[1].ends_with("@startmindmap\n* Root\n@endmindmap\n"));
    }

    #[test]
    fn keeps_newpage_in_one_job() {
        let diagrams =
            split_plantuml_source("@startuml\nAlice -> Bob\nnewpage\nBob -> Alice\n@enduml")
                .expect("split failed");
        assert_eq!(diagrams.len(), 1);
        assert!(diagrams[0].contains("newpage"));
    }

    #[test]
    fn keeps_nested_definition_inside_diagram() {
        let source = "@startuml\n@startdef common\n!define X 1\n@enddef\nAlice -> Bob\n@enduml";
        assert_eq!(split_plantuml_source(source), Ok(vec![source.to_owned()]));
    }

    #[test]
    fn rejects_total_source_above_limit_before_splitting() {
        let source = "x".repeat(super::MAX_PLANTUML_SOURCE_BYTES + 1);
        assert!(matches!(
            split_plantuml_source(&source),
            Err(PlantUmlSourceError::SourceTooLarge { .. })
        ));
    }

    #[test]
    fn rejects_missing_or_unmatched_diagram() {
        assert_eq!(
            split_plantuml_source("Alice -> Bob"),
            Err(PlantUmlSourceError::MissingDiagram)
        );
        assert!(matches!(
            split_plantuml_source("@startuml\nAlice -> Bob"),
            Err(PlantUmlSourceError::UnmatchedStart { .. })
        ));
    }
}
