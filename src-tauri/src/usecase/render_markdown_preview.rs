#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedMarkdownPreview {
    pub html: String,
    pub page_htmls: Vec<String>,
}

#[derive(Clone, Copy)]
struct SourceLine<'a> {
    number: usize,
    text: &'a str,
}

#[derive(Clone, Copy)]
struct MarkdownPageSegment<'a> {
    content: &'a str,
    line_offset: usize,
}

const PAGE_BREAK_TOKEN_OPEN: &str = "<!--";
const PAGE_BREAK_TOKEN_CLOSE: &str = "-->";
const LINK_REL: &str = "noreferrer noopener";

pub fn render_markdown_preview(content: &str) -> RenderedMarkdownPreview {
    let page_segments = split_markdown_pages(content);

    RenderedMarkdownPreview {
        html: render_markdown_page(content, 0),
        page_htmls: page_segments
            .iter()
            .map(|page_segment| {
                render_markdown_page(page_segment.content, page_segment.line_offset)
            })
            .collect(),
    }
}

fn render_markdown_page(content: &str, line_offset: usize) -> String {
    let lines = content
        .split('\n')
        .enumerate()
        .map(|(index, line)| SourceLine {
            number: line_offset + index,
            text: line.strip_suffix('\r').unwrap_or(line),
        })
        .collect::<Vec<_>>();

    render_blocks(&lines)
}

fn split_markdown_pages(content: &str) -> Vec<MarkdownPageSegment<'_>> {
    let mut page_segments = Vec::new();
    let mut last_index = 0;
    let mut line_offset = 0;
    let mut search_index = 0;

    while let Some(open_offset) = content[search_index..].find(PAGE_BREAK_TOKEN_OPEN) {
        let token_start = search_index + open_offset;
        let token_body_start = token_start + PAGE_BREAK_TOKEN_OPEN.len();
        let Some(close_offset) = content[token_body_start..].find(PAGE_BREAK_TOKEN_CLOSE) else {
            break;
        };
        let token_end = token_body_start + close_offset + PAGE_BREAK_TOKEN_CLOSE.len();
        let token = &content[token_start..token_end];

        if is_page_break_token(token) {
            let page_content = &content[last_index..token_start];

            page_segments.push(MarkdownPageSegment {
                content: page_content,
                line_offset,
            });

            line_offset += count_line_breaks(page_content) + count_line_breaks(token);
            last_index = token_end;
        }

        search_index = token_end;
    }

    page_segments.push(MarkdownPageSegment {
        content: &content[last_index..],
        line_offset,
    });

    page_segments
}

fn render_blocks(lines: &[SourceLine<'_>]) -> String {
    let mut html = String::new();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index];

        if is_blank(line.text) || is_page_break_line(line.text) {
            index += 1;
            continue;
        }

        if let Some((marker, marker_len, language)) = parse_fence_start(line.text) {
            let start_line = line.number;
            let mut code_lines = Vec::new();
            let mut end_line = line.number;
            index += 1;

            while index < lines.len() {
                let candidate_line = lines[index];
                end_line = candidate_line.number;

                if is_fence_end(candidate_line.text, marker, marker_len) {
                    index += 1;
                    break;
                }

                code_lines.push(candidate_line.text);
                index += 1;
            }

            let code = code_lines.join("\n");
            let language_class = if language.is_empty() {
                String::new()
            } else {
                format!(" class=\"language-{}\"", escape_html(language))
            };

            push_block(
                &mut html,
                &format!(
                    "<pre{}><code{}>{}</code></pre>",
                    source_line_attributes(start_line, end_line),
                    language_class,
                    escape_html(&code),
                ),
            );

            continue;
        }

        if let Some((level, heading_content)) = parse_heading(line.text) {
            push_block(
                &mut html,
                &format!(
                    "<h{level}{}>{}</h{level}>",
                    source_line_attributes(line.number, line.number),
                    render_inline(heading_content.trim()),
                ),
            );
            index += 1;
            continue;
        }

        if is_horizontal_rule(line.text) {
            push_block(
                &mut html,
                &format!("<hr{} />", source_line_attributes(line.number, line.number),),
            );
            index += 1;
            continue;
        }

        if is_blockquote_line(line.text) {
            let start_line = line.number;
            let mut quote_lines = Vec::new();
            let mut end_line = line.number;

            while index < lines.len() && is_blockquote_line(lines[index].text) {
                let current_line = lines[index];
                end_line = current_line.number;
                quote_lines.push(SourceLine {
                    number: current_line.number,
                    text: strip_blockquote_marker(current_line.text),
                });
                index += 1;
            }

            push_block(
                &mut html,
                &format!(
                    "<blockquote{}>{}</blockquote>",
                    source_line_attributes(start_line, end_line),
                    render_blocks(&quote_lines),
                ),
            );
            continue;
        }

        if let Some((ordered, first_value, item_content)) = parse_list_item(line.text) {
            let mut items = Vec::new();
            items.push((line.number, render_inline(item_content.trim())));
            index += 1;

            while index < lines.len() {
                let current_line = lines[index];

                if let Some((next_ordered, _, next_item_content)) =
                    parse_list_item(current_line.text)
                {
                    if next_ordered != ordered {
                        break;
                    }

                    items.push((current_line.number, render_inline(next_item_content.trim())));
                    index += 1;
                    continue;
                }

                break;
            }

            let mut list_html = String::new();

            for (line_number, item_html) in items {
                push_block(
                    &mut list_html,
                    &format!(
                        "<li{}>{}</li>",
                        source_line_attributes(line_number, line_number),
                        item_html,
                    ),
                );
            }

            let list_wrapper = if ordered {
                if first_value == 1 {
                    format!("<ol>\n{list_html}\n</ol>")
                } else {
                    format!("<ol start=\"{first_value}\">\n{list_html}\n</ol>")
                }
            } else {
                format!("<ul>\n{list_html}\n</ul>")
            };

            push_block(&mut html, &list_wrapper);
            continue;
        }

        let start_line = line.number;
        let mut end_line = line.number;
        let mut paragraph_lines = vec![line.text];
        index += 1;

        while index < lines.len() {
            let current_line = lines[index];

            if is_blank(current_line.text)
                || is_page_break_line(current_line.text)
                || is_block_start(current_line.text)
            {
                break;
            }

            end_line = current_line.number;
            paragraph_lines.push(current_line.text);
            index += 1;
        }

        push_block(
            &mut html,
            &format!(
                "<p{}>{}</p>",
                source_line_attributes(start_line, end_line),
                render_inline_lines(&paragraph_lines),
            ),
        );
    }

    html
}

fn push_block(output: &mut String, block_html: &str) {
    if !output.is_empty() {
        output.push('\n');
    }

    output.push_str(block_html);
}

fn render_inline_lines(lines: &[&str]) -> String {
    let mut html = String::new();

    for (index, line) in lines.iter().enumerate() {
        if index > 0 {
            html.push_str("<br />\n");
        }

        html.push_str(&render_inline(line.trim_end()));
    }

    html
}

fn render_inline(text: &str) -> String {
    let mut html = String::new();
    let mut index = 0;

    while index < text.len() {
        let remaining = &text[index..];

        if let Some((consumed, code)) = parse_code_span(remaining) {
            html.push_str("<code>");
            html.push_str(&escape_html(code));
            html.push_str("</code>");
            index += consumed;
            continue;
        }

        if let Some((consumed, inner)) = parse_wrapped_span(remaining, "**") {
            html.push_str("<strong>");
            html.push_str(&render_inline(inner));
            html.push_str("</strong>");
            index += consumed;
            continue;
        }

        if let Some((consumed, inner)) = parse_wrapped_span(remaining, "*") {
            html.push_str("<em>");
            html.push_str(&render_inline(inner));
            html.push_str("</em>");
            index += consumed;
            continue;
        }

        if let Some((consumed, label, url)) = parse_markdown_link(remaining) {
            if is_safe_url(url) {
                html.push_str("<a href=\"");
                html.push_str(&escape_html(url));
                html.push_str("\" target=\"_blank\" rel=\"");
                html.push_str(LINK_REL);
                html.push_str("\">");
                html.push_str(&render_inline(label));
                html.push_str("</a>");
            } else {
                html.push_str(&escape_html(&remaining[..consumed]));
            }
            index += consumed;
            continue;
        }

        if let Some(consumed) = parse_auto_link(remaining) {
            let url = &remaining[..consumed];
            html.push_str("<a href=\"");
            html.push_str(&escape_html(url));
            html.push_str("\" target=\"_blank\" rel=\"");
            html.push_str(LINK_REL);
            html.push_str("\">");
            html.push_str(&escape_html(url));
            html.push_str("</a>");
            index += consumed;
            continue;
        }

        let character = remaining.chars().next().unwrap_or_default();
        html.push_str(&escape_html_character(character));
        index += character.len_utf8();
    }

    html
}

fn parse_code_span(text: &str) -> Option<(usize, &str)> {
    if !text.starts_with('`') {
        return None;
    }

    let end_index = text[1..].find('`')?;
    let content_end = 1 + end_index;

    Some((content_end + 1, &text[1..content_end]))
}

fn parse_wrapped_span<'a>(text: &'a str, marker: &str) -> Option<(usize, &'a str)> {
    if !text.starts_with(marker) {
        return None;
    }

    let end_index = text[marker.len()..].find(marker)?;
    let content_start = marker.len();
    let content_end = content_start + end_index;

    Some((
        content_end + marker.len(),
        &text[content_start..content_end],
    ))
}

fn parse_markdown_link(text: &str) -> Option<(usize, &str, &str)> {
    if !text.starts_with('[') {
        return None;
    }

    let label_end = text.find(']')?;
    let after_label = &text[label_end + 1..];

    if !after_label.starts_with('(') {
        return None;
    }

    let url_end = after_label[1..].find(')')?;
    let consumed = label_end + 1 + 1 + url_end + 1;

    Some((
        consumed,
        &text[1..label_end],
        after_label[1..1 + url_end].trim(),
    ))
}

fn parse_auto_link(text: &str) -> Option<usize> {
    if !(text.starts_with("https://") || text.starts_with("http://")) {
        return None;
    }

    let mut end_index = 0;

    for (index, character) in text.char_indices() {
        if character.is_whitespace() || matches!(character, '<' | '>' | '"' | '\'') {
            break;
        }

        end_index = index + character.len_utf8();
    }

    while end_index > 0 {
        let character = text[..end_index].chars().last().unwrap_or_default();

        if matches!(character, '.' | ',' | ';' | ':' | '!' | '?') {
            end_index -= character.len_utf8();
            continue;
        }

        break;
    }

    (end_index > 0).then_some(end_index)
}

fn parse_heading(text: &str) -> Option<(usize, &str)> {
    let trimmed = text.trim_start();
    let mut marker_count = 0;

    for character in trimmed.chars() {
        if character == '#' && marker_count < 6 {
            marker_count += 1;
            continue;
        }

        break;
    }

    if marker_count == 0 {
        return None;
    }

    let remaining = &trimmed[marker_count..];

    remaining
        .strip_prefix(' ')
        .map(|content| (marker_count, content))
}

fn parse_fence_start(text: &str) -> Option<(char, usize, &str)> {
    let trimmed = text.trim_start();
    let marker = trimmed.chars().next()?;

    if marker != '`' && marker != '~' {
        return None;
    }

    let marker_len = trimmed
        .chars()
        .take_while(|character| *character == marker)
        .count();

    if marker_len < 3 {
        return None;
    }

    let language = trimmed[marker_len..].trim();

    Some((marker, marker_len, language))
}

fn is_fence_end(text: &str, marker: char, marker_len: usize) -> bool {
    let trimmed = text.trim_start();

    trimmed
        .chars()
        .take_while(|character| *character == marker)
        .count()
        >= marker_len
}

fn parse_list_item(text: &str) -> Option<(bool, usize, &str)> {
    if let Some(content) = parse_unordered_list_item(text) {
        return Some((false, 1, content));
    }

    parse_ordered_list_item(text).map(|(start_value, content)| (true, start_value, content))
}

fn parse_unordered_list_item(text: &str) -> Option<&str> {
    let trimmed = text.trim_start();
    let marker = trimmed.chars().next()?;

    if !matches!(marker, '-' | '*' | '+') {
        return None;
    }

    trimmed[marker.len_utf8()..]
        .strip_prefix(' ')
        .or_else(|| trimmed[marker.len_utf8()..].strip_prefix('\t'))
}

fn parse_ordered_list_item(text: &str) -> Option<(usize, &str)> {
    let trimmed = text.trim_start();
    let digits_end = trimmed
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .count();

    if digits_end == 0 || !trimmed[digits_end..].starts_with('.') {
        return None;
    }

    let content = &trimmed[digits_end + 1..];
    let content = content
        .strip_prefix(' ')
        .or_else(|| content.strip_prefix('\t'))?;
    let start_value = trimmed[..digits_end].parse::<usize>().ok()?;

    Some((start_value, content))
}

fn is_horizontal_rule(text: &str) -> bool {
    let trimmed = text.trim();

    if trimmed.len() < 3 {
        return false;
    }

    let mut characters = trimmed.chars();
    let Some(first_character) = characters.next() else {
        return false;
    };

    matches!(first_character, '-' | '*' | '_')
        && characters.all(|character| character == first_character)
}

fn is_blockquote_line(text: &str) -> bool {
    text.trim_start().starts_with('>')
}

fn strip_blockquote_marker(text: &str) -> &str {
    let trimmed = text.trim_start();
    let stripped = trimmed.strip_prefix('>').unwrap_or(trimmed);

    stripped.strip_prefix(' ').unwrap_or(stripped)
}

fn is_block_start(text: &str) -> bool {
    parse_heading(text).is_some()
        || parse_fence_start(text).is_some()
        || is_horizontal_rule(text)
        || is_blockquote_line(text)
        || parse_list_item(text).is_some()
}

fn is_blank(text: &str) -> bool {
    text.trim().is_empty()
}

fn is_page_break_line(text: &str) -> bool {
    is_page_break_token(text.trim())
}

fn is_page_break_token(text: &str) -> bool {
    text.starts_with(PAGE_BREAK_TOKEN_OPEN)
        && text.ends_with(PAGE_BREAK_TOKEN_CLOSE)
        && text[PAGE_BREAK_TOKEN_OPEN.len()..text.len() - PAGE_BREAK_TOKEN_CLOSE.len()].trim()
            == "---"
}

fn count_line_breaks(text: &str) -> usize {
    text.chars().filter(|character| *character == '\n').count()
}

fn source_line_attributes(start_line: usize, end_line: usize) -> String {
    format!(
        " data-source-line-start=\"{}\" data-source-line-end=\"{}\"",
        start_line, end_line
    )
}

fn is_safe_url(url: &str) -> bool {
    let normalized = url.trim().to_ascii_lowercase();

    !(normalized.starts_with("javascript:") || normalized.starts_with("data:"))
}

fn escape_html(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());

    for character in text.chars() {
        escaped.push_str(&escape_html_character(character));
    }

    escaped
}

fn escape_html_character(character: char) -> String {
    match character {
        '&' => "&amp;".to_string(),
        '<' => "&lt;".to_string(),
        '>' => "&gt;".to_string(),
        '"' => "&quot;".to_string(),
        '\'' => "&#39;".to_string(),
        _ => character.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::render_markdown_preview;

    #[test]
    fn renders_page_breaks_and_source_line_offsets() {
        let rendered_preview = render_markdown_preview(
            "# Title\nHello [site](https://example.com)\n<!-- --- -->\n- item",
        );

        assert_eq!(
            rendered_preview.html,
            "<h1 data-source-line-start=\"0\" data-source-line-end=\"0\">Title</h1>\n<p data-source-line-start=\"1\" data-source-line-end=\"1\">Hello <a href=\"https://example.com\" target=\"_blank\" rel=\"noreferrer noopener\">site</a></p>\n<ul>\n<li data-source-line-start=\"3\" data-source-line-end=\"3\">item</li>\n</ul>"
        );
        assert_eq!(
            rendered_preview.page_htmls,
            vec![
                "<h1 data-source-line-start=\"0\" data-source-line-end=\"0\">Title</h1>\n<p data-source-line-start=\"1\" data-source-line-end=\"1\">Hello <a href=\"https://example.com\" target=\"_blank\" rel=\"noreferrer noopener\">site</a></p>",
                "<ul>\n<li data-source-line-start=\"3\" data-source-line-end=\"3\">item</li>\n</ul>",
            ]
        );
    }

    #[test]
    fn escapes_html_and_renders_code_blocks() {
        let rendered_preview = render_markdown_preview("```\n<script>alert(1)</script>\n```");

        assert_eq!(
            rendered_preview.html,
            "<pre data-source-line-start=\"0\" data-source-line-end=\"2\"><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>"
        );
    }

    #[test]
    fn renders_blockquotes_and_emphasis() {
        let rendered_preview = render_markdown_preview("> quoted\n> *value*");

        assert_eq!(
            rendered_preview.html,
            "<blockquote data-source-line-start=\"0\" data-source-line-end=\"1\"><p data-source-line-start=\"0\" data-source-line-end=\"1\">quoted<br />\n<em>value</em></p></blockquote>"
        );
    }
}
