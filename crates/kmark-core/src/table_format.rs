use std::{error::Error, fmt};

use unicode_segmentation::UnicodeSegmentation;
use unicode_width::UnicodeWidthStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TableFormatOptions {
    pub infer_numeric_alignment: bool,
    pub min_separator_width: usize,
    pub tab_width: usize,
    pub preserve_line_ending: bool,
}

impl Default for TableFormatOptions {
    fn default() -> Self {
        Self {
            infer_numeric_alignment: true,
            min_separator_width: 3,
            tab_width: 4,
            preserve_line_ending: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TableFormatLineRange {
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FormatResult {
    pub text: String,
    pub diagnostics: Vec<TableDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceRange {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableDiagnostic {
    pub kind: TableDiagnosticKind,
    pub message: String,
    pub line: Option<usize>,
    pub column: Option<usize>,
    pub range: Option<SourceRange>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TableDiagnosticKind {
    InvalidLeftMerge,
    InvalidUpMerge,
    NonRectangularMerge,
    ColumnCountMismatch,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableFormatError {
    pub message: String,
}

impl TableFormatError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for TableFormatError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for TableFormatError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TableAlignment {
    Default,
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone)]
struct SourceLine<'a> {
    text: &'a str,
    ending: &'a str,
}

#[derive(Debug, Clone, Copy)]
struct MarkdownFence {
    marker: char,
    length: usize,
}

pub fn format_markdown_tables(source: &str, options: TableFormatOptions) -> FormatResult {
    format_markdown_tables_with_filter(source, options, |_, _| true)
}

pub fn format_markdown_tables_in_line_ranges(
    source: &str,
    line_ranges: &[TableFormatLineRange],
    options: TableFormatOptions,
) -> FormatResult {
    if line_ranges.is_empty() {
        return FormatResult {
            text: source.to_owned(),
            diagnostics: Vec::new(),
        };
    }

    format_markdown_tables_with_filter(source, options, |table_start_line, table_end_line| {
        line_ranges.iter().any(|line_range| {
            line_range_intersects_table(*line_range, table_start_line, table_end_line)
        })
    })
}

fn format_markdown_tables_with_filter(
    source: &str,
    options: TableFormatOptions,
    should_format_table: impl Fn(usize, usize) -> bool,
) -> FormatResult {
    let lines = split_source_lines(source);
    if lines.is_empty() {
        return FormatResult {
            text: source.to_owned(),
            diagnostics: Vec::new(),
        };
    }

    let mut formatted = String::with_capacity(source.len());
    let mut diagnostics = Vec::new();
    let mut active_fence: Option<MarkdownFence> = None;
    let mut line_index = 0;

    while line_index < lines.len() {
        let line = &lines[line_index];

        if let Some(fence) = active_fence {
            push_original_line(&mut formatted, line);
            if is_fence_close(line.text, fence) {
                active_fence = None;
            }
            line_index += 1;
            continue;
        }

        if let Some(fence) = parse_fence_start(line.text) {
            push_original_line(&mut formatted, line);
            active_fence = Some(fence);
            line_index += 1;
            continue;
        }

        if is_indented_code_line(line.text) {
            push_original_line(&mut formatted, line);
            line_index += 1;
            continue;
        }

        if is_table_start(&lines, line_index) {
            let table_end = collect_table_end(&lines, line_index);
            let table_lines = &lines[line_index..table_end];
            let table_start_line = line_index + 1;
            let table_end_line = table_end;

            if !should_format_table(table_start_line, table_end_line) {
                for table_line in table_lines {
                    push_original_line(&mut formatted, table_line);
                }
                line_index = table_end;
                continue;
            }

            let raw_lines = table_lines
                .iter()
                .map(|table_line| table_line.text)
                .collect::<Vec<_>>();

            match format_table_lines(&raw_lines, options, table_start_line) {
                Ok((formatted_lines, mut table_diagnostics)) => {
                    diagnostics.append(&mut table_diagnostics);
                    push_formatted_table_block(
                        &mut formatted,
                        table_lines,
                        &formatted_lines,
                        options,
                    );
                    line_index = table_end;
                }
                Err(_) => {
                    push_original_line(&mut formatted, line);
                    line_index += 1;
                }
            }
            continue;
        }

        push_original_line(&mut formatted, line);
        line_index += 1;
    }

    FormatResult {
        text: formatted,
        diagnostics,
    }
}

fn line_range_intersects_table(
    line_range: TableFormatLineRange,
    table_start_line: usize,
    table_end_line: usize,
) -> bool {
    let range_start = line_range.start_line.min(line_range.end_line).max(1);
    let range_end = line_range.start_line.max(line_range.end_line).max(1);

    range_start <= table_end_line && range_end >= table_start_line
}

pub fn format_table_block(
    table_source: &str,
    options: TableFormatOptions,
) -> Result<String, TableFormatError> {
    let lines = split_source_lines(table_source);
    if lines.is_empty() {
        return Err(TableFormatError::new("table source is empty"));
    }
    if lines.len() < 2
        || !has_table_delimiter_pipe(lines[0].text)
        || !has_table_delimiter_pipe(lines[1].text)
        || lines[2..]
            .iter()
            .any(|line| !has_table_delimiter_pipe(line.text))
    {
        return Err(TableFormatError::new("table source is not a pipe table"));
    }

    let raw_lines = lines.iter().map(|line| line.text).collect::<Vec<_>>();
    let (formatted_lines, _) = format_table_lines(&raw_lines, options, 1)?;
    let mut formatted = String::with_capacity(table_source.len());
    push_formatted_table_block(&mut formatted, &lines, &formatted_lines, options);

    Ok(formatted)
}

pub fn visual_width(source: &str, options: &TableFormatOptions) -> usize {
    let tab_width = options.tab_width.max(1);
    let mut width = 0;

    for grapheme in UnicodeSegmentation::graphemes(source, true) {
        if grapheme == "\t" {
            width += tab_width - (width % tab_width);
            continue;
        }

        if is_emoji_grapheme(grapheme) {
            width += 2;
            continue;
        }

        width += UnicodeWidthStr::width(grapheme);
    }

    width
}

fn format_table_lines(
    lines: &[&str],
    options: TableFormatOptions,
    base_line_number: usize,
) -> Result<(Vec<String>, Vec<TableDiagnostic>), TableFormatError> {
    if lines.len() < 2 {
        return Err(TableFormatError::new(
            "table source must have a header and separator",
        ));
    }

    let header = split_table_cells(lines[0]);
    let separator_cells = split_table_cells(lines[1]);
    let separator_alignments = parse_separator_cells(&separator_cells)
        .ok_or_else(|| TableFormatError::new("table separator row is invalid"))?;
    let rows = lines[2..]
        .iter()
        .map(|line| split_table_cells(line))
        .collect::<Vec<_>>();

    let column_count = resolve_column_count(&header, &separator_alignments, &rows);
    if column_count == 0 {
        return Err(TableFormatError::new("table has no columns"));
    }

    let mut diagnostics = collect_column_count_diagnostics(
        &header,
        &separator_alignments,
        &rows,
        column_count,
        base_line_number,
    );
    let alignments = resolve_alignments(&separator_alignments, &rows, column_count, options);
    let widths = resolve_column_widths(&header, &rows, &alignments, column_count, options);

    let mut formatted = Vec::with_capacity(lines.len());
    formatted.push(format_data_row(&header, &widths, &alignments, options));
    formatted.push(format_separator_row(&widths, &alignments, options));
    formatted.extend(
        rows.iter()
            .map(|row| format_data_row(row, &widths, &alignments, options)),
    );

    diagnostics.shrink_to_fit();

    Ok((formatted, diagnostics))
}

fn split_source_lines(source: &str) -> Vec<SourceLine<'_>> {
    let bytes = source.as_bytes();
    let mut lines = Vec::new();
    let mut line_start = 0;
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'\n' => {
                if index > line_start && bytes[index - 1] == b'\r' {
                    lines.push(SourceLine {
                        text: &source[line_start..index - 1],
                        ending: "\r\n",
                    });
                } else {
                    lines.push(SourceLine {
                        text: &source[line_start..index],
                        ending: "\n",
                    });
                }
                index += 1;
                line_start = index;
            }
            b'\r' => {
                if bytes.get(index + 1) == Some(&b'\n') {
                    lines.push(SourceLine {
                        text: &source[line_start..index],
                        ending: "\r\n",
                    });
                    index += 2;
                } else {
                    lines.push(SourceLine {
                        text: &source[line_start..index],
                        ending: "\r",
                    });
                    index += 1;
                }
                line_start = index;
            }
            _ => {
                index += 1;
            }
        }
    }

    if line_start < source.len() {
        lines.push(SourceLine {
            text: &source[line_start..],
            ending: "",
        });
    }

    lines
}

fn push_original_line(output: &mut String, line: &SourceLine<'_>) {
    output.push_str(line.text);
    output.push_str(line.ending);
}

fn push_formatted_table_block(
    output: &mut String,
    original_lines: &[SourceLine<'_>],
    formatted_lines: &[String],
    options: TableFormatOptions,
) {
    let line_ending = resolve_table_line_ending(original_lines, options);
    let has_trailing_line_ending = original_lines
        .last()
        .is_some_and(|line| !line.ending.is_empty());

    for (index, line) in formatted_lines.iter().enumerate() {
        output.push_str(line);
        if index + 1 < formatted_lines.len() || has_trailing_line_ending {
            output.push_str(line_ending);
        }
    }
}

fn resolve_table_line_ending<'a>(
    lines: &'a [SourceLine<'a>],
    options: TableFormatOptions,
) -> &'a str {
    if !options.preserve_line_ending {
        return "\n";
    }

    lines
        .iter()
        .find_map(|line| (!line.ending.is_empty()).then_some(line.ending))
        .unwrap_or("\n")
}

fn parse_fence_start(line: &str) -> Option<MarkdownFence> {
    let trimmed = trim_up_to_three_leading_spaces(line)?;
    let mut chars = trimmed.chars();
    let marker = chars.next()?;

    if marker != '`' && marker != '~' {
        return None;
    }

    let length = trimmed
        .chars()
        .take_while(|current| *current == marker)
        .count();
    (length >= 3).then_some(MarkdownFence { marker, length })
}

fn is_fence_close(line: &str, fence: MarkdownFence) -> bool {
    let Some(trimmed) = trim_up_to_three_leading_spaces(line) else {
        return false;
    };
    let length = trimmed
        .chars()
        .take_while(|current| *current == fence.marker)
        .count();

    if length < fence.length {
        return false;
    }

    let rest_start = fence.marker.len_utf8() * length;
    trimmed[rest_start..]
        .chars()
        .all(|character| character == ' ' || character == '\t')
}

fn trim_up_to_three_leading_spaces(line: &str) -> Option<&str> {
    let mut spaces = 0;

    for (index, character) in line.char_indices() {
        match character {
            ' ' if spaces < 4 => {
                spaces += 1;
            }
            ' ' => return None,
            _ => return Some(&line[index..]),
        }
    }

    Some("")
}

fn is_indented_code_line(line: &str) -> bool {
    line.starts_with('\t') || line.starts_with("    ")
}

fn is_table_start(lines: &[SourceLine<'_>], line_index: usize) -> bool {
    let Some(header) = lines.get(line_index) else {
        return false;
    };
    let Some(separator) = lines.get(line_index + 1) else {
        return false;
    };

    if is_indented_code_line(separator.text) || parse_fence_start(separator.text).is_some() {
        return false;
    }

    if !has_table_delimiter_pipe(header.text) || !has_table_delimiter_pipe(separator.text) {
        return false;
    }

    let separator_cells = split_table_cells(separator.text);
    parse_separator_cells(&separator_cells).is_some()
}

fn collect_table_end(lines: &[SourceLine<'_>], start: usize) -> usize {
    let mut end = start + 2;

    while let Some(line) = lines.get(end) {
        if line.text.trim().is_empty()
            || is_indented_code_line(line.text)
            || parse_fence_start(line.text).is_some()
            || !has_table_delimiter_pipe(line.text)
        {
            break;
        }

        end += 1;
    }

    end
}

fn split_table_cells(line: &str) -> Vec<String> {
    let mut cells = Vec::new();
    let mut cell_start = 0;
    let mut code_span_ticks: Option<usize> = None;
    let mut index = 0;

    while index < line.len() {
        let Some(character) = line[index..].chars().next() else {
            break;
        };

        if character == '`' {
            let tick_count = count_repeated_char_at(line, index, '`');
            if code_span_ticks == Some(tick_count) {
                code_span_ticks = None;
            } else if code_span_ticks.is_none() && !is_escaped_at(line, index) {
                code_span_ticks = Some(tick_count);
            }
            index += tick_count;
            continue;
        }

        if character == '|' && code_span_ticks.is_none() && !is_escaped_at(line, index) {
            cells.push(trim_cell_source(&line[cell_start..index]).to_owned());
            index += character.len_utf8();
            cell_start = index;
            continue;
        }

        index += character.len_utf8();
    }

    cells.push(trim_cell_source(&line[cell_start..]).to_owned());

    if has_leading_boundary_pipe(line) && cells.first().is_some_and(|cell| cell.is_empty()) {
        cells.remove(0);
    }
    if has_trailing_boundary_pipe(line) && cells.last().is_some_and(|cell| cell.is_empty()) {
        cells.pop();
    }

    cells
}

fn has_table_delimiter_pipe(line: &str) -> bool {
    let mut code_span_ticks: Option<usize> = None;
    let mut index = 0;

    while index < line.len() {
        let Some(character) = line[index..].chars().next() else {
            break;
        };

        if character == '`' {
            let tick_count = count_repeated_char_at(line, index, '`');
            if code_span_ticks == Some(tick_count) {
                code_span_ticks = None;
            } else if code_span_ticks.is_none() && !is_escaped_at(line, index) {
                code_span_ticks = Some(tick_count);
            }
            index += tick_count;
            continue;
        }

        if character == '|' && code_span_ticks.is_none() && !is_escaped_at(line, index) {
            return true;
        }

        index += character.len_utf8();
    }

    false
}

fn has_leading_boundary_pipe(line: &str) -> bool {
    let trimmed = trim_cell_source(line);
    trimmed.starts_with('|')
}

fn has_trailing_boundary_pipe(line: &str) -> bool {
    let trimmed_end = line.trim_end_matches(|character| character == ' ' || character == '\t');
    if !trimmed_end.ends_with('|') {
        return false;
    }

    let pipe_index = trimmed_end.len() - '|'.len_utf8();
    !is_escaped_at(trimmed_end, pipe_index)
}

fn trim_cell_source(source: &str) -> &str {
    source.trim_matches(|character| character == ' ' || character == '\t')
}

fn is_escaped_at(source: &str, byte_index: usize) -> bool {
    if byte_index == 0 {
        return false;
    }

    let mut slash_count = 0;
    let mut index = byte_index;

    while index > 0 {
        let previous = source[..index].chars().next_back();
        if previous != Some('\\') {
            break;
        }

        slash_count += 1;
        index -= '\\'.len_utf8();
    }

    slash_count % 2 == 1
}

fn count_repeated_char_at(source: &str, byte_index: usize, expected: char) -> usize {
    source[byte_index..]
        .chars()
        .take_while(|character| *character == expected)
        .count()
}

fn parse_separator_cells(cells: &[String]) -> Option<Vec<TableAlignment>> {
    if cells.is_empty() {
        return None;
    }

    cells
        .iter()
        .map(|cell| parse_separator_cell(cell))
        .collect()
}

fn parse_separator_cell(cell: &str) -> Option<TableAlignment> {
    let cell = trim_cell_source(cell);
    if cell.is_empty() {
        return None;
    }

    let has_left_colon = cell.starts_with(':');
    let has_right_colon = cell.ends_with(':');
    let marker_start = usize::from(has_left_colon);
    let marker_end = cell.len() - usize::from(has_right_colon);

    if marker_start >= marker_end {
        return None;
    }

    let marker = &cell[marker_start..marker_end];
    if marker.is_empty() || !marker.chars().all(|character| character == '-') {
        return None;
    }

    match (has_left_colon, has_right_colon) {
        (true, true) => Some(TableAlignment::Center),
        (true, false) => Some(TableAlignment::Left),
        (false, true) => Some(TableAlignment::Right),
        (false, false) => Some(TableAlignment::Default),
    }
}

fn resolve_column_count(
    header: &[String],
    separator_alignments: &[TableAlignment],
    rows: &[Vec<String>],
) -> usize {
    rows.iter()
        .map(Vec::len)
        .chain([header.len(), separator_alignments.len()])
        .max()
        .unwrap_or(0)
}

fn collect_column_count_diagnostics(
    header: &[String],
    separator_alignments: &[TableAlignment],
    rows: &[Vec<String>],
    column_count: usize,
    base_line_number: usize,
) -> Vec<TableDiagnostic> {
    let mut diagnostics = Vec::new();

    if header.len() != column_count {
        diagnostics.push(column_count_diagnostic(
            base_line_number,
            header.len(),
            column_count,
        ));
    }
    if separator_alignments.len() != column_count {
        diagnostics.push(column_count_diagnostic(
            base_line_number + 1,
            separator_alignments.len(),
            column_count,
        ));
    }

    diagnostics.extend(rows.iter().enumerate().filter_map(|(row_index, row)| {
        (row.len() != column_count).then(|| {
            column_count_diagnostic(base_line_number + row_index + 2, row.len(), column_count)
        })
    }));

    diagnostics
}

fn column_count_diagnostic(line: usize, actual: usize, expected: usize) -> TableDiagnostic {
    TableDiagnostic {
        kind: TableDiagnosticKind::ColumnCountMismatch,
        message: format!("table row has {actual} columns, expected {expected}"),
        line: Some(line),
        column: None,
        range: None,
    }
}

fn resolve_alignments(
    separator_alignments: &[TableAlignment],
    rows: &[Vec<String>],
    column_count: usize,
    options: TableFormatOptions,
) -> Vec<TableAlignment> {
    (0..column_count)
        .map(|column| {
            let alignment = separator_alignments
                .get(column)
                .copied()
                .unwrap_or(TableAlignment::Default);

            if alignment != TableAlignment::Default || !options.infer_numeric_alignment {
                return alignment;
            }

            if is_numeric_column(rows, column) {
                TableAlignment::Right
            } else {
                TableAlignment::Default
            }
        })
        .collect()
}

fn is_numeric_column(rows: &[Vec<String>], column: usize) -> bool {
    !rows.is_empty()
        && rows.iter().all(|row| {
            row.get(column)
                .is_some_and(|cell| is_numeric_like(trim_cell_source(cell)))
        })
}

fn resolve_column_widths(
    header: &[String],
    rows: &[Vec<String>],
    alignments: &[TableAlignment],
    column_count: usize,
    options: TableFormatOptions,
) -> Vec<usize> {
    (0..column_count)
        .map(|column| {
            let content_width = std::iter::once(header.get(column))
                .chain(rows.iter().map(|row| row.get(column)))
                .flatten()
                .map(|cell| visual_width(trim_cell_source(cell), &options))
                .max()
                .unwrap_or(0);

            content_width.max(separator_visual_width_floor(alignments[column], options))
        })
        .collect()
}

fn separator_visual_width_floor(alignment: TableAlignment, options: TableFormatOptions) -> usize {
    let min_hyphens = options.min_separator_width.max(3);
    match alignment {
        TableAlignment::Default => min_hyphens,
        TableAlignment::Left | TableAlignment::Right => min_hyphens + 1,
        TableAlignment::Center => min_hyphens + 2,
    }
}

fn format_data_row(
    cells: &[String],
    widths: &[usize],
    alignments: &[TableAlignment],
    options: TableFormatOptions,
) -> String {
    let mut line = String::new();
    line.push('|');

    for (column, width) in widths.iter().copied().enumerate() {
        let cell = cells.get(column).map(String::as_str).unwrap_or("");
        let cell = trim_cell_source(cell);

        line.push(' ');
        line.push_str(&pad_cell(cell, width, alignments[column], &options));
        line.push(' ');
        line.push('|');
    }

    line
}

fn pad_cell(
    cell: &str,
    width: usize,
    alignment: TableAlignment,
    options: &TableFormatOptions,
) -> String {
    let cell_width = visual_width(cell, options);
    let padding = width.saturating_sub(cell_width);

    match alignment {
        TableAlignment::Right => format!("{}{}", " ".repeat(padding), cell),
        TableAlignment::Center => {
            let left = padding / 2;
            let right = padding - left;
            format!("{}{}{}", " ".repeat(left), cell, " ".repeat(right))
        }
        TableAlignment::Default | TableAlignment::Left => {
            format!("{}{}", cell, " ".repeat(padding))
        }
    }
}

fn format_separator_row(
    widths: &[usize],
    alignments: &[TableAlignment],
    options: TableFormatOptions,
) -> String {
    let mut line = String::new();
    line.push('|');

    for (column, width) in widths.iter().copied().enumerate() {
        line.push(' ');
        line.push_str(&format_separator_cell(width, alignments[column], options));
        line.push(' ');
        line.push('|');
    }

    line
}

fn format_separator_cell(
    width: usize,
    alignment: TableAlignment,
    options: TableFormatOptions,
) -> String {
    let min_hyphens = options.min_separator_width.max(3);

    match alignment {
        TableAlignment::Default => "-".repeat(width.max(min_hyphens)),
        TableAlignment::Left => {
            let hyphen_count = width.saturating_sub(1).max(min_hyphens);
            format!(":{}", "-".repeat(hyphen_count))
        }
        TableAlignment::Center => {
            let hyphen_count = width.saturating_sub(2).max(min_hyphens);
            format!(":{}:", "-".repeat(hyphen_count))
        }
        TableAlignment::Right => {
            let hyphen_count = width.saturating_sub(1).max(min_hyphens);
            format!("{}:", "-".repeat(hyphen_count))
        }
    }
}

fn is_numeric_like(source: &str) -> bool {
    let value = source.trim();
    if value.is_empty() || !value.is_ascii() {
        return false;
    }

    let unsigned = value
        .strip_prefix('-')
        .or_else(|| value.strip_prefix('+'))
        .unwrap_or(value);

    if let Some(hex) = unsigned
        .strip_prefix("0x")
        .or_else(|| unsigned.strip_prefix("0X"))
    {
        return !hex.is_empty() && hex.chars().all(|character| character.is_ascii_hexdigit());
    }

    if let Some(binary) = unsigned
        .strip_prefix("0b")
        .or_else(|| unsigned.strip_prefix("0B"))
    {
        return !binary.is_empty()
            && binary
                .chars()
                .all(|character| character == '0' || character == '1');
    }

    is_decimal_like(unsigned)
}

fn is_decimal_like(unsigned: &str) -> bool {
    let Some((integer, fractional)) = unsigned.split_once('.') else {
        return is_integer_like(unsigned);
    };

    !fractional.is_empty()
        && fractional
            .chars()
            .all(|character| character.is_ascii_digit())
        && is_integer_like(integer)
}

fn is_integer_like(unsigned: &str) -> bool {
    if unsigned.is_empty() {
        return false;
    }

    if !unsigned.contains(',') {
        return unsigned.chars().all(|character| character.is_ascii_digit());
    }

    let groups = unsigned.split(',').collect::<Vec<_>>();
    let Some((first, rest)) = groups.split_first() else {
        return false;
    };

    !first.is_empty()
        && first.len() <= 3
        && first.chars().all(|character| character.is_ascii_digit())
        && rest.iter().all(|group| {
            group.len() == 3 && group.chars().all(|character| character.is_ascii_digit())
        })
}

fn is_emoji_grapheme(grapheme: &str) -> bool {
    let has_emoji_codepoint = grapheme.chars().any(is_emoji_codepoint);
    if !has_emoji_codepoint {
        return false;
    }

    grapheme.contains('\u{200d}')
        || grapheme.contains('\u{fe0f}')
        || grapheme.chars().any(|character| {
            matches!(
                character as u32,
                0x1f000..=0x1faff | 0x2600..=0x27bf
            )
        })
}

fn is_emoji_codepoint(character: char) -> bool {
    matches!(
        character as u32,
        0x1f000..=0x1faff | 0x2600..=0x27bf
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_compact_table() {
        let source = "|名前|年齢|備考|\n|-|-|-|\n|山田|20|新人|\n|佐藤|31|リーダー|";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(
            result.text,
            "| 名前 | 年齢 | 備考     |\n| ---- | ---: | -------- |\n| 山田 |   20 | 新人     |\n| 佐藤 |   31 | リーダー |"
        );
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn aligns_halfwidth_fullwidth_and_japanese_cells_by_visual_width() {
        let source = "|key|値|\n|-|-|\n|A|abc|\n|Ｂ|あいう|\n|山田|A1|";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_table_pipes_share_visual_columns(&result.text);
        assert!(result.text.contains("| Ｂ"));
        assert!(result.text.contains("| 山田 |"));
    }

    #[test]
    fn aligns_japanese_cells_by_visual_width() {
        let source = "|名前|部署|\n|-|-|\n|山田|営業|\n|佐々木|開発部|";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_table_pipes_share_visual_columns(&result.text);
        assert!(result.text.contains("佐々木"));
        assert!(result.text.contains("開発部"));
    }

    #[test]
    fn infers_numeric_alignment_for_default_separator_columns() {
        let source = "|name|age|\n|-|-|\n|A|20|\n|B|-10|\n|C|1,000|";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(
            result.text,
            "| name |   age |\n| ---- | ----: |\n| A    |    20 |\n| B    |   -10 |\n| C    | 1,000 |"
        );
    }

    #[test]
    fn keeps_explicit_alignment_before_numeric_inference() {
        let source = "|name|age|\n|---|:---|\n|A|20|\n|B|31|";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(
            result.text,
            "| name | age  |\n| ---- | :--- |\n| A    | 20   |\n| B    | 31   |"
        );
    }

    #[test]
    fn keeps_escaped_pipe_inside_single_cell() {
        let source = "| A\\|B | C |\n| --- | --- |\n| x | y |";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(
            result.text,
            "| A\\|B | C   |\n| ---- | --- |\n| x    | y   |"
        );
    }

    #[test]
    fn keeps_code_span_pipe_inside_single_cell() {
        let source = "| code | result |\n| --- | --- |\n| `A|B` | OK |";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(
            result.text,
            "| code  | result |\n| ----- | ------ |\n| `A|B` | OK     |"
        );
    }

    #[test]
    fn keeps_pipe_inside_matching_backtick_code_span() {
        let source = "| code |\n| --- |\n| `` `A|B` `` |";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(
            result.text,
            "| code        |\n| ----------- |\n| `` `A|B` `` |"
        );
    }

    #[test]
    fn keeps_merge_markers_as_source_cells() {
        let source = "| A | B | C |\n| --- | --- | --- |\n| 親 | < | 通常 |\n| ^ | < | 通常 |";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(
            result.text,
            "| A   | B   | C    |\n| --- | --- | ---- |\n| 親  | <   | 通常 |\n| ^   | <   | 通常 |"
        );
    }

    #[test]
    fn keeps_escaped_merge_marker_text() {
        let source = "| 記号 | 説明 |\n| --- | --- |\n| \\< | 小なり記号 |\n| \\^ | ハット記号 |";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert!(result.text.contains("\\<"));
        assert!(result.text.contains("\\^"));
        assert!(!result.text.contains("| < "));
        assert!(!result.text.contains("| ^ "));
    }

    #[test]
    fn does_not_format_tables_inside_fenced_code_blocks() {
        let source = "before\n```\n|a|b|\n|-|-|\n```\nafter";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(result.text, source);
    }

    #[test]
    fn does_not_format_tables_inside_indented_code_blocks() {
        let source = "    |a|b|\n    |-|-|\n\ntext";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(result.text, source);
    }

    #[test]
    fn keeps_non_table_text_byte_for_byte() {
        let source = "alpha | beta\n\n| A | B |\nnot separator\n<!-- kmark text:12 -->\ntext";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(result.text, source);
    }

    #[test]
    fn does_not_treat_pipe_text_followed_by_thematic_break_as_table() {
        let source = "alpha | beta\n---\ntext";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(result.text, source);
    }

    #[test]
    fn keeps_non_table_text_around_formatted_table_unchanged() {
        let source = "before\n\n|a|b|\n|-|-|\n|x|y|\n\nafter";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(
            result.text,
            "before\n\n| a   | b   |\n| --- | --- |\n| x   | y   |\n\nafter"
        );
    }

    #[test]
    fn formats_only_tables_intersecting_line_ranges() {
        let source = "|a|b|\n|-|-|\n|x|y|\n\n|c|d|\n|-|-|\n|1|2|";

        let result = format_markdown_tables_in_line_ranges(
            source,
            &[TableFormatLineRange {
                start_line: 5,
                end_line: 5,
            }],
            TableFormatOptions::default(),
        );

        assert_eq!(
            result.text,
            "|a|b|\n|-|-|\n|x|y|\n\n|    c |    d |\n| ---: | ---: |\n|    1 |    2 |"
        );
    }

    #[test]
    fn preserves_crlf_for_crlf_table_blocks() {
        let source = "before\r\n|名前|年齢|\r\n|-|-|\r\n|山田|20|\r\nafter";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(
            result.text,
            "before\r\n| 名前 | 年齢 |\r\n| ---- | ---: |\r\n| 山田 |   20 |\r\nafter"
        );
    }

    #[test]
    fn can_normalize_table_block_line_endings_to_lf() {
        let options = TableFormatOptions {
            preserve_line_ending: false,
            ..TableFormatOptions::default()
        };
        let source = "|a|b|\r\n|-|-|\r\n|x|y|";

        let result = format_table_block(source, options).expect("formatted table");

        assert_eq!(result, "| a   | b   |\n| --- | --- |\n| x   | y   |");
    }

    #[test]
    fn reports_column_count_mismatch_without_dropping_cells() {
        let source = "| A | B |\n| --- | --- |\n| x | y | z |";

        let result = format_markdown_tables(source, TableFormatOptions::default());

        assert_eq!(result.diagnostics.len(), 2);
        assert!(result
            .diagnostics
            .iter()
            .all(|diagnostic| diagnostic.kind == TableDiagnosticKind::ColumnCountMismatch));
        assert!(result.text.contains("| x   | y   | z   |"));
    }

    #[test]
    fn computes_visual_width_for_combining_marks_emoji_zwj_and_tabs() {
        let options = TableFormatOptions::default();

        assert_eq!(visual_width("a\u{0301}", &options), 1);
        assert_eq!(visual_width("✅", &options), 2);
        assert_eq!(visual_width("👩‍💻", &options), 2);
        assert_eq!(visual_width("a\tb", &options), 5);
    }

    fn assert_table_pipes_share_visual_columns(table: &str) {
        let options = TableFormatOptions::default();
        let mut expected_columns: Option<Vec<usize>> = None;

        for line in table.lines() {
            let columns = line
                .char_indices()
                .filter_map(|(index, character)| {
                    (character == '|').then(|| visual_width(&line[..index], &options))
                })
                .collect::<Vec<_>>();

            if let Some(expected) = &expected_columns {
                assert_eq!(&columns, expected);
            } else {
                expected_columns = Some(columns);
            }
        }
    }
}
