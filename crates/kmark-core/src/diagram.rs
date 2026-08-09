use crate::normalize_plantuml_source;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DiagramLanguage {
    Dot,
    Mermaid,
    PlantUml,
}

impl DiagramLanguage {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Dot => "dot",
            Self::Mermaid => "mermaid",
            Self::PlantUml => "plantuml",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DiagramBlock {
    pub id: String,
    pub language: DiagramLanguage,
    pub start_line: u32,
    pub end_line: u32,
    pub source: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DiagramDiagnostic {
    pub code: String,
    pub message: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

pub fn extract_diagrams(markdown: &str) -> Vec<DiagramBlock> {
    let lines = markdown.split('\n').collect::<Vec<_>>();
    let mut diagrams = Vec::new();
    let mut line_index = 0usize;
    while line_index < lines.len() {
        let trimmed = lines[line_index].trim_start();
        let Some((fence, language)) = parse_opening_fence(trimmed) else {
            line_index += 1;
            continue;
        };
        let source_start = line_index + 1;
        let mut closing_index = source_start;
        while closing_index < lines.len() {
            if lines[closing_index].trim_start().starts_with(fence) {
                break;
            }
            closing_index += 1;
        }
        let source_end = closing_index.min(lines.len());
        let source = lines[source_start..source_end].join("\n");
        let sequence = diagrams.len() + 1;
        diagrams.push(DiagramBlock {
            id: format!("{}-{sequence}", language.as_str()),
            language,
            start_line: (line_index + 1) as u32,
            end_line: (closing_index.min(lines.len().saturating_sub(1)) + 1) as u32,
            source,
        });
        line_index = if closing_index < lines.len() {
            closing_index + 1
        } else {
            lines.len()
        };
    }
    diagrams
}

pub fn validate_diagram(diagram: &DiagramBlock) -> Vec<DiagramDiagnostic> {
    if diagram.source.trim().is_empty() {
        return vec![DiagramDiagnostic {
            code: "diagram_source_empty".to_owned(),
            message: "diagram source is empty".to_owned(),
            line: Some(diagram.start_line.saturating_add(1)),
            column: Some(1),
        }];
    }

    if diagram.language == DiagramLanguage::PlantUml {
        if let Err(error) = normalize_plantuml_source(&diagram.source) {
            return vec![DiagramDiagnostic {
                code: error.code().to_owned(),
                message: error.to_string(),
                line: Some(diagram.start_line.saturating_add(1)),
                column: Some(1),
            }];
        }
    }

    Vec::new()
}

fn parse_opening_fence(line: &str) -> Option<(&str, DiagramLanguage)> {
    let (fence, info) = if let Some(info) = line.strip_prefix("```") {
        ("```", info)
    } else if let Some(info) = line.strip_prefix("~~~") {
        ("~~~", info)
    } else {
        return None;
    };
    let language = info.split_whitespace().next()?.to_ascii_lowercase();
    let language = match language.as_str() {
        "dot" | "graphviz" => DiagramLanguage::Dot,
        "mermaid" => DiagramLanguage::Mermaid,
        "plantuml" | "puml" => DiagramLanguage::PlantUml,
        _ => return None,
    };
    Some((fence, language))
}

#[cfg(test)]
mod tests {
    use super::{extract_diagrams, validate_diagram, DiagramLanguage};

    #[test]
    fn extracts_supported_fenced_diagrams_with_stable_ids() {
        let diagrams = extract_diagrams(
            "# title\n```mermaid\ngraph TD\nA-->B\n```\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```",
        );

        assert_eq!(diagrams.len(), 2);
        assert_eq!(diagrams[0].id, "mermaid-1");
        assert_eq!(diagrams[0].language, DiagramLanguage::Mermaid);
        assert_eq!(diagrams[1].id, "plantuml-2");
        assert!(validate_diagram(&diagrams[1]).is_empty());
    }

    #[test]
    fn validates_empty_and_structurally_invalid_sources() {
        let diagrams = extract_diagrams("```mermaid\n\n```\n```plantuml\nA -> B\n```");

        assert_eq!(
            validate_diagram(&diagrams[0])[0].code,
            "diagram_source_empty"
        );
        assert_eq!(
            validate_diagram(&diagrams[1])[0].code,
            "plantuml_source_invalid"
        );
    }
}
