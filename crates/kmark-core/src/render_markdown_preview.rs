use std::{collections::HashMap, ops::Range};

use pulldown_cmark::{
    Alignment, BlockQuoteKind, CodeBlockKind, Event, LinkType, MetadataBlockKind, Options,
    Parser, Tag, TagEnd,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedMarkdownPreview {
    pub html: String,
    pub page_htmls: Vec<String>,
}

#[derive(Clone, Copy)]
struct MarkdownPageSegment<'a> {
    content: &'a str,
    line_offset: usize,
}

#[derive(Debug, Clone, Copy)]
enum TableSection {
    Head,
    Body,
}

#[derive(Debug, Clone)]
struct ImageContext {
    destination_url: String,
    title: String,
    alt_text: String,
    safe: bool,
}

#[derive(Debug, Clone)]
struct FootnoteDefinitionContext {
    label: String,
    paragraph_count: usize,
}

type OwnedEvent = (Event<'static>, Range<usize>);

struct HtmlEmitter<'a> {
    content: &'a str,
    line_offset: usize,
    line_starts: Vec<usize>,
    html: String,
    image_stack: Vec<ImageContext>,
    suppressed_link_depth: usize,
    table_section: TableSection,
    table_alignments: Vec<Alignment>,
    table_cell_index: usize,
    table_body_open: bool,
    footnote_numbers: HashMap<String, usize>,
    footnote_reference_ids: HashMap<String, Vec<String>>,
    footnote_reference_render_counts: HashMap<String, usize>,
    footnote_definition_stack: Vec<FootnoteDefinitionContext>,
}

const PAGE_BREAK_TOKEN_OPEN: &str = "<!--";
const PAGE_BREAK_TOKEN_CLOSE: &str = "-->";
const LINK_REL: &str = "noreferrer noopener";

pub fn render_markdown_preview(content: &str) -> RenderedMarkdownPreview {
    let page_segments = split_markdown_pages(content);
    let page_htmls = page_segments
        .iter()
        .map(|page_segment| render_markdown_page(page_segment.content, page_segment.line_offset))
        .collect::<Vec<_>>();

    RenderedMarkdownPreview {
        html: page_htmls.join(""),
        page_htmls,
    }
}

fn render_markdown_page(content: &str, line_offset: usize) -> String {
    let events = collect_markdown_events(content);
    let mut emitter = HtmlEmitter::new(content, line_offset);
    emitter.prepare_footnotes(&events);
    emitter.render(events)
}

fn collect_markdown_events(content: &str) -> Vec<OwnedEvent> {
    Parser::new_ext(content, markdown_options())
        .into_offset_iter()
        .map(|(event, range)| (event.into_static(), range))
        .collect()
}

fn markdown_options() -> Options {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options
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

impl<'a> HtmlEmitter<'a> {
    fn new(content: &'a str, line_offset: usize) -> Self {
        Self {
            content,
            line_offset,
            line_starts: collect_line_starts(content),
            html: String::new(),
            image_stack: Vec::new(),
            suppressed_link_depth: 0,
            table_section: TableSection::Head,
            table_alignments: Vec::new(),
            table_cell_index: 0,
            table_body_open: false,
            footnote_numbers: HashMap::new(),
            footnote_reference_ids: HashMap::new(),
            footnote_reference_render_counts: HashMap::new(),
            footnote_definition_stack: Vec::new(),
        }
    }

    fn prepare_footnotes(&mut self, events: &[OwnedEvent]) {
        for (event, _) in events {
            match event {
                Event::FootnoteReference(label) => {
                    let label = label.to_string();
                    let number = self.resolve_footnote_number(&label);
                    let entry = self.footnote_reference_ids.entry(label).or_default();
                    entry.push(footnote_reference_id(number, entry.len() + 1));
                }
                Event::Start(Tag::FootnoteDefinition(label)) => {
                    self.resolve_footnote_number(label.as_ref());
                }
                _ => {}
            }
        }
    }

    fn render(mut self, events: Vec<OwnedEvent>) -> String {
        for (event, range) in events {
            self.push_event(event, range);
        }

        self.html
    }

    fn push_event(&mut self, event: Event<'static>, range: Range<usize>) {
        match event {
            Event::Start(tag) => self.start_tag(tag, &range),
            Event::End(tag_end) => self.end_tag(tag_end),
            Event::Text(text) => self.push_text(&text),
            Event::Code(text) => self.push_code(&text),
            Event::Html(html) | Event::InlineHtml(html) => self.push_text(&html),
            Event::SoftBreak => self.push_soft_break(),
            Event::HardBreak => self.push_hard_break(),
            Event::Rule => self.push_raw(&format!(
                "<hr{} />",
                self.source_line_attributes(&range),
            )),
            Event::FootnoteReference(label) => self.push_footnote_reference(label.as_ref()),
            Event::TaskListMarker(checked) => self.push_task_list_marker(checked),
            Event::InlineMath(text) => self.push_math_text("math-inline", &text),
            Event::DisplayMath(text) => self.push_math_text("math-display", &text),
        }
    }

    fn push_footnote_reference(&mut self, label: &str) {
        let number = self.resolve_footnote_number(label);

        if let Some(image_context) = self.image_stack.last_mut() {
            image_context.alt_text.push('[');
            image_context.alt_text.push_str(&number.to_string());
            image_context.alt_text.push(']');
            return;
        }

        let occurrence_index = {
            let count = self
                .footnote_reference_render_counts
                .entry(label.to_owned())
                .or_insert(0);
            let current = *count;
            *count += 1;
            current
        };
        let reference_id = self
            .footnote_reference_ids
            .get(label)
            .and_then(|ids| ids.get(occurrence_index))
            .cloned()
            .unwrap_or_else(|| footnote_reference_id(number, occurrence_index + 1));

        self.push_raw(&format!(
            "<sup class=\"footnote-reference\" id=\"{}\"><a href=\"#{}\">{}</a></sup>",
            escape_html(&reference_id),
            footnote_definition_id(number),
            number,
        ));
    }

    fn start_tag(&mut self, tag: Tag<'static>, range: &Range<usize>) {
        if self.is_collecting_image_alt_text() {
            if matches!(tag, Tag::Image { .. }) {
                self.image_stack.push(ImageContext {
                    destination_url: String::new(),
                    title: String::new(),
                    alt_text: String::new(),
                    safe: false,
                });
            }
            return;
        }

        match tag {
            Tag::Paragraph => {
                if self.is_inside_footnote_definition() {
                    let paragraph_count = self.begin_footnote_paragraph();
                    if paragraph_count > 1 {
                        self.push_raw("<p>");
                    }
                    return;
                }
                self.push_raw(&format!("<p{}>", self.source_line_attributes(range)));
            }
            Tag::Heading {
                level,
                id,
                classes,
                attrs,
            } => {
                let mut html = format!("<{level}{}", self.source_line_attributes(range));
                if let Some(id) = id {
                    html.push_str(" id=\"");
                    html.push_str(&escape_html(&id));
                    html.push('"');
                }
                if !classes.is_empty() {
                    html.push_str(" class=\"");
                    for (index, class_name) in classes.iter().enumerate() {
                        if index > 0 {
                            html.push(' ');
                        }
                        html.push_str(&escape_html(class_name));
                    }
                    html.push('"');
                }
                for (attribute, value) in attrs {
                    html.push(' ');
                    html.push_str(&escape_html(&attribute));
                    html.push_str("=\"");
                    if let Some(value) = value {
                        html.push_str(&escape_html(&value));
                    }
                    html.push('"');
                }
                html.push('>');
                self.push_raw(&html);
            }
            Tag::BlockQuote(kind) => {
                let class_name = blockquote_class_name(kind);
                let mut html = format!("<blockquote{}", self.source_line_attributes(range));
                if let Some(class_name) = class_name {
                    html.push_str(" class=\"");
                    html.push_str(class_name);
                    html.push('"');
                }
                html.push('>');
                self.push_raw(&html);
            }
            Tag::CodeBlock(kind) => {
                let mut html = format!("<pre{}><code", self.source_line_attributes(range));
                if let Some(language) = code_block_language(kind) {
                    html.push_str(" class=\"language-");
                    html.push_str(&escape_html(&language));
                    html.push('"');
                }
                html.push('>');
                self.push_raw(&html);
            }
            Tag::HtmlBlock => {}
            Tag::List(Some(1)) => self.push_raw("<ol>"),
            Tag::List(Some(start)) => {
                self.push_raw(&format!("<ol start=\"{start}\">"));
            }
            Tag::List(None) => self.push_raw("<ul>"),
            Tag::Item => {
                self.push_raw(&format!("<li{}>", self.source_line_attributes(range)));
            }
            Tag::FootnoteDefinition(label) => {
                let label = label.to_string();
                let number = self.resolve_footnote_number(&label);
                self.footnote_definition_stack
                    .push(FootnoteDefinitionContext {
                        label,
                        paragraph_count: 0,
                    });
                self.push_raw(&format!(
                    "<div class=\"footnote-definition\" id=\"{}\"{}><sup class=\"footnote-definition-label\">{}</sup>",
                    footnote_definition_id(number),
                    self.source_line_attributes(range),
                    number,
                ));
            }
            Tag::DefinitionList => self.push_raw("<dl>"),
            Tag::DefinitionListTitle => self.push_raw("<dt>"),
            Tag::DefinitionListDefinition => self.push_raw("<dd>"),
            Tag::Table(alignments) => {
                self.table_alignments = alignments;
                self.table_section = TableSection::Head;
                self.table_cell_index = 0;
                self.table_body_open = false;
                self.push_raw("<table>");
            }
            Tag::TableHead => {
                self.table_section = TableSection::Head;
                self.table_cell_index = 0;
                self.push_raw(&format!(
                    "<thead><tr{}>",
                    self.source_line_attributes(range),
                ));
            }
            Tag::TableRow => {
                self.table_cell_index = 0;
                self.push_raw(&format!("<tr{}>", self.source_line_attributes(range)));
            }
            Tag::TableCell => {
                let tag_name = match self.table_section {
                    TableSection::Head => "th",
                    TableSection::Body => "td",
                };
                let mut html = format!("<{tag_name}");
                if let Some(alignment) = self.table_alignments.get(self.table_cell_index) {
                    let style = match alignment {
                        Alignment::None => None,
                        Alignment::Left => Some("left"),
                        Alignment::Center => Some("center"),
                        Alignment::Right => Some("right"),
                    };
                    if let Some(style) = style {
                        html.push_str(" style=\"text-align: ");
                        html.push_str(style);
                        html.push('"');
                    }
                }
                html.push('>');
                self.table_cell_index += 1;
                self.push_raw(&html);
            }
            Tag::Emphasis => self.push_raw("<em>"),
            Tag::Strong => self.push_raw("<strong>"),
            Tag::Strikethrough => self.push_raw("<del>"),
            Tag::Superscript => self.push_raw("<sup>"),
            Tag::Subscript => self.push_raw("<sub>"),
            Tag::Link {
                link_type,
                dest_url,
                title,
                ..
            } => {
                if !is_safe_url(&dest_url) {
                    self.suppressed_link_depth += 1;
                    return;
                }

                let href = match link_type {
                    LinkType::Email => format!("mailto:{dest_url}"),
                    _ => dest_url.to_string(),
                };
                let mut html = format!(
                    "<a href=\"{}\" target=\"_blank\" rel=\"{}\"",
                    escape_html(&href),
                    LINK_REL,
                );
                if !title.is_empty() {
                    html.push_str(" title=\"");
                    html.push_str(&escape_html(&title));
                    html.push('"');
                }
                html.push('>');
                self.push_raw(&html);
            }
            Tag::Image {
                dest_url, title, ..
            } => {
                self.image_stack.push(ImageContext {
                    destination_url: dest_url.to_string(),
                    title: title.to_string(),
                    alt_text: String::new(),
                    safe: is_safe_url(&dest_url),
                });
            }
            Tag::MetadataBlock(kind) => {
                self.push_raw(&format!(
                    "<section data-metadata-block=\"{}\">",
                    metadata_block_name(kind),
                ));
            }
        }
    }

    fn end_tag(&mut self, tag_end: TagEnd) {
        if self.is_collecting_image_alt_text() {
            if matches!(tag_end, TagEnd::Image) {
                self.finish_image();
            }
            return;
        }

        match tag_end {
            TagEnd::Paragraph => {
                if self.is_inside_footnote_definition() {
                    if self.current_footnote_paragraph_count() > 1 {
                        self.push_raw("</p>");
                    }
                } else {
                    self.push_raw("</p>");
                }
            }
            TagEnd::Heading(level) => self.push_raw(&format!("</{level}>")),
            TagEnd::BlockQuote(_) => self.push_raw("</blockquote>"),
            TagEnd::CodeBlock => self.push_raw("</code></pre>"),
            TagEnd::HtmlBlock => {}
            TagEnd::List(true) => self.push_raw("</ol>"),
            TagEnd::List(false) => self.push_raw("</ul>"),
            TagEnd::Item => self.push_raw("</li>"),
            TagEnd::FootnoteDefinition => self.finish_footnote_definition(),
            TagEnd::DefinitionList => self.push_raw("</dl>"),
            TagEnd::DefinitionListTitle => self.push_raw("</dt>"),
            TagEnd::DefinitionListDefinition => self.push_raw("</dd>"),
            TagEnd::Table => {
                if self.table_body_open {
                    self.push_raw("</tbody>");
                }
                self.push_raw("</table>");
                self.table_alignments.clear();
                self.table_cell_index = 0;
                self.table_body_open = false;
            }
            TagEnd::TableHead => {
                self.table_section = TableSection::Body;
                self.table_cell_index = 0;
                self.table_body_open = true;
                self.push_raw("</tr></thead><tbody>");
            }
            TagEnd::TableRow => self.push_raw("</tr>"),
            TagEnd::TableCell => {
                let tag_name = match self.table_section {
                    TableSection::Head => "th",
                    TableSection::Body => "td",
                };
                self.push_raw(&format!("</{tag_name}>"));
            }
            TagEnd::Emphasis => self.push_raw("</em>"),
            TagEnd::Strong => self.push_raw("</strong>"),
            TagEnd::Strikethrough => self.push_raw("</del>"),
            TagEnd::Superscript => self.push_raw("</sup>"),
            TagEnd::Subscript => self.push_raw("</sub>"),
            TagEnd::Link => {
                if self.suppressed_link_depth > 0 {
                    self.suppressed_link_depth -= 1;
                } else {
                    self.push_raw("</a>");
                }
            }
            TagEnd::Image => self.finish_image(),
            TagEnd::MetadataBlock(_) => self.push_raw("</section>"),
        }
    }

    fn finish_footnote_definition(&mut self) {
        let Some(context) = self.footnote_definition_stack.pop() else {
            self.push_raw("</div>");
            return;
        };

        if let Some(reference_ids) = self.footnote_reference_ids.get(&context.label).cloned() {
            for reference_id in reference_ids {
                self.push_raw(" ");
                self.push_raw(&format!(
                    "<a href=\"#{}\" class=\"footnote-backreference\">↩</a>",
                    escape_html(&reference_id),
                ));
            }
        }

        self.push_raw("</div>");
    }

    fn finish_image(&mut self) {
        let Some(image_context) = self.image_stack.pop() else {
            return;
        };

        if self.is_collecting_image_alt_text() {
            if let Some(parent_image_context) = self.image_stack.last_mut() {
                parent_image_context.alt_text.push_str(&image_context.alt_text);
            }
            return;
        }

        if !image_context.safe {
            self.push_text(&image_context.alt_text);
            return;
        }

        let mut html = format!(
            "<img src=\"{}\" alt=\"{}\"",
            escape_html(&image_context.destination_url),
            escape_html(&image_context.alt_text),
        );
        if !image_context.title.is_empty() {
            html.push_str(" title=\"");
            html.push_str(&escape_html(&image_context.title));
            html.push('"');
        }
        html.push_str(" />");
        self.push_raw(&html);
    }

    fn push_task_list_marker(&mut self, checked: bool) {
        if let Some(image_context) = self.image_stack.last_mut() {
            image_context
                .alt_text
                .push_str(if checked { "[x]" } else { "[ ]" });
            return;
        }

        let markup = if checked {
            "<input disabled=\"\" type=\"checkbox\" checked=\"\" />\n"
        } else {
            "<input disabled=\"\" type=\"checkbox\" />\n"
        };
        self.push_raw(markup);
    }

    fn push_math_text(&mut self, class_name: &str, text: &str) {
        if let Some(image_context) = self.image_stack.last_mut() {
            image_context.alt_text.push_str(text);
            return;
        }

        self.push_raw(&format!(
            "<span class=\"math {class_name}\">{}</span>",
            escape_html(text),
        ));
    }

    fn push_text(&mut self, text: &str) {
        if let Some(image_context) = self.image_stack.last_mut() {
            image_context.alt_text.push_str(text);
            return;
        }

        self.html.push_str(&escape_html(text));
    }

    fn push_code(&mut self, text: &str) {
        if let Some(image_context) = self.image_stack.last_mut() {
            image_context.alt_text.push_str(text);
            return;
        }

        self.push_raw("<code>");
        self.html.push_str(&escape_html(text));
        self.push_raw("</code>");
    }

    fn push_soft_break(&mut self) {
        if let Some(image_context) = self.image_stack.last_mut() {
            image_context.alt_text.push(' ');
            return;
        }

        self.push_raw("\n");
    }

    fn push_hard_break(&mut self) {
        if let Some(image_context) = self.image_stack.last_mut() {
            image_context.alt_text.push(' ');
            return;
        }

        self.push_raw("<br />\n");
    }

    fn push_raw(&mut self, html: &str) {
        if self.image_stack.is_empty() {
            self.html.push_str(html);
        }
    }

    fn is_collecting_image_alt_text(&self) -> bool {
        !self.image_stack.is_empty()
    }

    fn resolve_footnote_number(&mut self, label: &str) -> usize {
        if let Some(number) = self.footnote_numbers.get(label) {
            return *number;
        }

        let number = self.footnote_numbers.len() + 1;
        self.footnote_numbers.insert(label.to_owned(), number);
        number
    }

    fn is_inside_footnote_definition(&self) -> bool {
        !self.footnote_definition_stack.is_empty()
    }

    fn begin_footnote_paragraph(&mut self) -> usize {
        let Some(context) = self.footnote_definition_stack.last_mut() else {
            return 0;
        };
        context.paragraph_count += 1;
        context.paragraph_count
    }

    fn current_footnote_paragraph_count(&self) -> usize {
        self.footnote_definition_stack
            .last()
            .map(|context| context.paragraph_count)
            .unwrap_or(0)
    }

    fn source_line_attributes(&self, range: &Range<usize>) -> String {
        let (start_line, end_line) = resolve_source_line_range(
            self.content,
            &self.line_starts,
            self.line_offset,
            range,
        );
        format!(
            " data-source-line-start=\"{}\" data-source-line-end=\"{}\"",
            start_line, end_line,
        )
    }
}

fn footnote_definition_id(number: usize) -> String {
    format!("fn-{number}")
}

fn footnote_reference_id(number: usize, occurrence: usize) -> String {
    format!("fnref-{number}-{occurrence}")
}

fn blockquote_class_name(kind: Option<BlockQuoteKind>) -> Option<&'static str> {
    match kind {
        None => None,
        Some(BlockQuoteKind::Note) => Some("markdown-alert-note"),
        Some(BlockQuoteKind::Tip) => Some("markdown-alert-tip"),
        Some(BlockQuoteKind::Important) => Some("markdown-alert-important"),
        Some(BlockQuoteKind::Warning) => Some("markdown-alert-warning"),
        Some(BlockQuoteKind::Caution) => Some("markdown-alert-caution"),
    }
}

fn metadata_block_name(kind: MetadataBlockKind) -> &'static str {
    match kind {
        MetadataBlockKind::YamlStyle => "yaml",
        MetadataBlockKind::PlusesStyle => "pluses",
    }
}

fn code_block_language(kind: CodeBlockKind<'_>) -> Option<String> {
    match kind {
        CodeBlockKind::Indented => None,
        CodeBlockKind::Fenced(info) => {
            let language = info.split(' ').next().unwrap_or_default().trim();
            (!language.is_empty()).then_some(language.to_string())
        }
    }
}

fn collect_line_starts(content: &str) -> Vec<usize> {
    let mut line_starts = vec![0];

    for (index, character) in content.char_indices() {
        if character == '\n' {
            line_starts.push(index + 1);
        }
    }

    line_starts
}

fn resolve_source_line_range(
    content: &str,
    line_starts: &[usize],
    line_offset: usize,
    range: &Range<usize>,
) -> (usize, usize) {
    let start_line = resolve_line_number(line_starts, range.start) + line_offset;

    if content.is_empty() {
        return (start_line, start_line);
    }

    let end_offset = range
        .end
        .saturating_sub(1)
        .min(content.len().saturating_sub(1));
    let end_line = resolve_line_number(line_starts, end_offset) + line_offset;

    (start_line, end_line.max(start_line))
}

fn resolve_line_number(line_starts: &[usize], offset: usize) -> usize {
    match line_starts.binary_search(&offset) {
        Ok(index) => index,
        Err(index) => index.saturating_sub(1),
    }
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
            "<h1 data-source-line-start=\"0\" data-source-line-end=\"0\">Title</h1><p data-source-line-start=\"1\" data-source-line-end=\"1\">Hello <a href=\"https://example.com\" target=\"_blank\" rel=\"noreferrer noopener\">site</a></p><ul><li data-source-line-start=\"3\" data-source-line-end=\"3\">item</li></ul>"
        );
        assert_eq!(
            rendered_preview.page_htmls,
            vec![
                "<h1 data-source-line-start=\"0\" data-source-line-end=\"0\">Title</h1><p data-source-line-start=\"1\" data-source-line-end=\"1\">Hello <a href=\"https://example.com\" target=\"_blank\" rel=\"noreferrer noopener\">site</a></p>",
                "<ul><li data-source-line-start=\"3\" data-source-line-end=\"3\">item</li></ul>",
            ]
        );
    }

    #[test]
    fn escapes_html_and_uses_commonmark_code_block_output() {
        let rendered_preview = render_markdown_preview("```rust\n<script>alert(1)</script>\n```");

        assert_eq!(
            rendered_preview.html,
            "<pre data-source-line-start=\"0\" data-source-line-end=\"2\"><code class=\"language-rust\">&lt;script&gt;alert(1)&lt;/script&gt;\n</code></pre>"
        );
    }

    #[test]
    fn renders_blockquotes_with_commonmark_soft_breaks() {
        let rendered_preview = render_markdown_preview("> quoted\n> *value*");

        assert_eq!(
            rendered_preview.html,
            "<blockquote data-source-line-start=\"0\" data-source-line-end=\"1\"><p data-source-line-start=\"0\" data-source-line-end=\"1\">quoted\n<em>value</em></p></blockquote>"
        );
    }

    #[test]
    fn escapes_inline_html_and_suppresses_unsafe_links() {
        let rendered_preview =
            render_markdown_preview("[x](javascript:alert(1)) <script>alert(1)</script>");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"0\" data-source-line-end=\"0\">x &lt;script&gt;alert(1)&lt;/script&gt;</p>"
        );
    }

    #[test]
    fn renders_tables_with_alignment_and_nested_inline() {
        let rendered_preview =
            render_markdown_preview("| Left | Center | Right |\n| :--- | :----: | ----: |\n| *a* | **b** | ~~c~~ |");

        assert_eq!(
            rendered_preview.html,
            "<table><thead><tr data-source-line-start=\"0\" data-source-line-end=\"0\"><th style=\"text-align: left\">Left</th><th style=\"text-align: center\">Center</th><th style=\"text-align: right\">Right</th></tr></thead><tbody><tr data-source-line-start=\"2\" data-source-line-end=\"2\"><td style=\"text-align: left\"><em>a</em></td><td style=\"text-align: center\"><strong>b</strong></td><td style=\"text-align: right\"><del>c</del></td></tr></tbody></table>"
        );
    }

    #[test]
    fn renders_task_lists_with_disabled_checkboxes() {
        let rendered_preview = render_markdown_preview("- [x] done\n- [ ] todo");

        assert_eq!(
            rendered_preview.html,
            "<ul><li data-source-line-start=\"0\" data-source-line-end=\"0\"><input disabled=\"\" type=\"checkbox\" checked=\"\" />\ndone</li><li data-source-line-start=\"1\" data-source-line-end=\"1\"><input disabled=\"\" type=\"checkbox\" />\ntodo</li></ul>"
        );
    }

    #[test]
    fn renders_footnotes_with_backreferences() {
        let rendered_preview = render_markdown_preview("Note[^alpha].\n\n[^alpha]: Footnote *value*");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"0\" data-source-line-end=\"0\">Note<sup class=\"footnote-reference\" id=\"fnref-1-1\"><a href=\"#fn-1\">1</a></sup>.</p><div class=\"footnote-definition\" id=\"fn-1\" data-source-line-start=\"2\" data-source-line-end=\"2\"><sup class=\"footnote-definition-label\">1</sup>Footnote <em>value</em> <a href=\"#fnref-1-1\" class=\"footnote-backreference\">↩</a></div>"
        );
    }
}
