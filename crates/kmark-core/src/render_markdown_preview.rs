use std::{
    collections::HashMap,
    ops::Range,
    path::Path,
};

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
    destination_url: Option<String>,
    title: String,
    alt_text: String,
    style: Option<String>,
}

#[derive(Debug, Clone)]
struct FootnoteDefinitionContext {
    label: String,
    paragraph_count: usize,
}

type OwnedEvent = (Event<'static>, Range<usize>);

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkImageParams {
    width: Option<String>,
    height: Option<String>,
    fit: Option<String>,
    position: Option<String>,
    border_size: Option<String>,
    border_color: Option<String>,
    border_style: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkParamBundle {
    preset_use: Option<String>,
    params: KmarkImageParams,
}

#[derive(Debug, Clone)]
struct PendingKmarkParams {
    bundle: KmarkParamBundle,
    end_offset: usize,
    end_line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum KmarkComment {
    Params(KmarkParamBundle),
    Define {
        name: String,
        bundle: KmarkParamBundle,
    },
    ScopeStart(KmarkParamBundle),
    ScopeEnd,
}

struct HtmlEmitter<'a> {
    content: &'a str,
    line_offset: usize,
    markdown_file_path: Option<&'a str>,
    line_starts: Vec<usize>,
    html: String,
    image_stack: Vec<ImageContext>,
    suppressed_link_depth: usize,
    suppressed_html_text_depth: usize,
    table_section: TableSection,
    table_alignments: Vec<Alignment>,
    table_cell_index: usize,
    table_body_open: bool,
    footnote_numbers: HashMap<String, usize>,
    footnote_reference_ids: HashMap<String, Vec<String>>,
    footnote_reference_render_counts: HashMap<String, usize>,
    footnote_definition_stack: Vec<FootnoteDefinitionContext>,
    kmark_presets: HashMap<String, KmarkImageParams>,
    active_kmark_scope: Option<KmarkImageParams>,
    pending_kmark_params: Option<PendingKmarkParams>,
}

const PAGE_BREAK_TOKEN_OPEN: &str = "<!--";
const PAGE_BREAK_TOKEN_CLOSE: &str = "-->";
const LINK_REL: &str = "noreferrer noopener";

pub fn render_markdown_preview(content: &str) -> RenderedMarkdownPreview {
    render_markdown_preview_with_file_path(content, None)
}

pub fn render_markdown_preview_with_file_path(
    content: &str,
    markdown_file_path: Option<&str>,
) -> RenderedMarkdownPreview {
    let page_segments = split_markdown_pages(content);
    let page_htmls = page_segments
        .iter()
        .map(|page_segment| {
            render_markdown_page(
                page_segment.content,
                page_segment.line_offset,
                markdown_file_path,
            )
        })
        .collect::<Vec<_>>();

    RenderedMarkdownPreview {
        html: page_htmls.join(""),
        page_htmls,
    }
}

fn render_markdown_page(
    content: &str,
    line_offset: usize,
    markdown_file_path: Option<&str>,
) -> String {
    let events = collect_markdown_events(content);
    let mut emitter = HtmlEmitter::new(content, line_offset, markdown_file_path);
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
    fn new(content: &'a str, line_offset: usize, markdown_file_path: Option<&'a str>) -> Self {
        Self {
            content,
            line_offset,
            markdown_file_path,
            line_starts: collect_line_starts(content),
            html: String::new(),
            image_stack: Vec::new(),
            suppressed_link_depth: 0,
            suppressed_html_text_depth: 0,
            table_section: TableSection::Head,
            table_alignments: Vec::new(),
            table_cell_index: 0,
            table_body_open: false,
            footnote_numbers: HashMap::new(),
            footnote_reference_ids: HashMap::new(),
            footnote_reference_render_counts: HashMap::new(),
            footnote_definition_stack: Vec::new(),
            kmark_presets: HashMap::new(),
            active_kmark_scope: None,
            pending_kmark_params: None,
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
        if matches!(event, Event::Html(_) | Event::InlineHtml(_)) {
            self.push_html_event(event, range);
            return;
        }

        self.invalidate_pending_kmark_params_before_event(&event, &range);

        match event {
            Event::Start(tag) => self.start_tag(tag, &range),
            Event::End(tag_end) => self.end_tag(tag_end),
            Event::Text(text) => self.push_text(&text),
            Event::Code(text) => self.push_code(&text),
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
            Event::Html(_) | Event::InlineHtml(_) => unreachable!("html handled earlier"),
        }
    }

    fn push_html_event(&mut self, event: Event<'static>, range: Range<usize>) {
        let html = match event {
            Event::Html(html) | Event::InlineHtml(html) => html,
            _ => return,
        };

        if let Some(comment) = parse_kmark_comment(html.as_ref()) {
            self.apply_kmark_comment(comment, range);
            return;
        }

        self.pending_kmark_params = None;
        self.update_html_text_suppression(html.as_ref());
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
                    destination_url: None,
                    title: String::new(),
                    alt_text: String::new(),
                    style: None,
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
            Tag::HtmlBlock => {
                self.suppressed_html_text_depth += 1;
            }
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
                let single_params = self.take_pending_kmark_params_for_image(range.start);
                let image_style = self.resolve_image_style(single_params.as_ref());
                self.image_stack.push(ImageContext {
                    destination_url: resolve_image_destination_url(
                        &dest_url,
                        self.markdown_file_path,
                    ),
                    title: title.to_string(),
                    alt_text: String::new(),
                    style: image_style,
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
            TagEnd::HtmlBlock => {
                self.suppressed_html_text_depth = self.suppressed_html_text_depth.saturating_sub(1);
            }
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

        let Some(destination_url) = image_context.destination_url else {
            self.push_text(&image_context.alt_text);
            return;
        };

        let mut html = format!(
            "<img src=\"{}\" alt=\"{}\"",
            escape_html(&destination_url),
            escape_html(&image_context.alt_text),
        );
        if !image_context.title.is_empty() {
            html.push_str(" title=\"");
            html.push_str(&escape_html(&image_context.title));
            html.push('"');
        }
        if let Some(style) = image_context.style {
            html.push_str(" style=\"");
            html.push_str(&escape_html(&style));
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
            "<span class=\"markdown-task-checkbox\" data-checked=\"true\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\" focusable=\"false\" aria-hidden=\"true\"><path d=\"M4.5 12.5 9.5 17.5 19.5 7.5\" /></svg></span>"
        } else {
            "<span class=\"markdown-task-checkbox\" data-checked=\"false\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\" focusable=\"false\" aria-hidden=\"true\"><path d=\"M4.5 12.5 9.5 17.5 19.5 7.5\" /></svg></span>"
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

        if self.suppressed_html_text_depth > 0 {
            return;
        }

        self.html.push_str(&escape_html(text));
    }

    fn push_code(&mut self, text: &str) {
        if let Some(image_context) = self.image_stack.last_mut() {
            image_context.alt_text.push_str(text);
            return;
        }

        if self.suppressed_html_text_depth > 0 {
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

        self.push_raw("<br />\n");
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

    fn apply_kmark_comment(&mut self, comment: KmarkComment, range: Range<usize>) {
        self.discard_pending_kmark_params_if_gap_is_incompatible(range.start);

        match comment {
            KmarkComment::Params(bundle) => {
                let end_line = self.resolve_range_end_line(range.clone());
                if let Some(pending) = self.pending_kmark_params.as_mut() {
                    pending.bundle.merge(&bundle);
                    pending.end_offset = range.end;
                    pending.end_line = end_line;
                } else {
                    self.pending_kmark_params = Some(PendingKmarkParams {
                        bundle,
                        end_offset: range.end,
                        end_line,
                    });
                }
            }
            KmarkComment::Define { name, bundle } => {
                let mut final_bundle = self.take_pending_kmark_bundle().unwrap_or_default();
                final_bundle.merge(&bundle);
                self.kmark_presets
                    .insert(name, self.resolve_kmark_bundle(&final_bundle));
            }
            KmarkComment::ScopeStart(bundle) => {
                let mut final_bundle = self.take_pending_kmark_bundle().unwrap_or_default();
                final_bundle.merge(&bundle);

                if self.active_kmark_scope.is_none() {
                    self.active_kmark_scope = Some(self.resolve_kmark_bundle(&final_bundle));
                }
            }
            KmarkComment::ScopeEnd => {
                self.pending_kmark_params = None;
                self.active_kmark_scope = None;
            }
        }
    }

    fn invalidate_pending_kmark_params_before_event(
        &mut self,
        event: &Event<'static>,
        range: &Range<usize>,
    ) {
        let Some(pending) = self.pending_kmark_params.as_ref() else {
            return;
        };

        let next_start_line = self.resolve_range_start_line(range.clone());

        if next_start_line > pending.end_line + 1 {
            self.pending_kmark_params = None;
            return;
        }

        if range.start < pending.end_offset {
            if matches!(
                event,
                Event::Start(Tag::Paragraph)
                    | Event::Start(Tag::HtmlBlock)
                    | Event::Start(Tag::Image { .. })
                    | Event::End(TagEnd::HtmlBlock)
            ) {
                return;
            }

            self.pending_kmark_params = None;
            return;
        }

        let gap = &self.content[pending.end_offset..range.start];

        if !gap.chars().all(char::is_whitespace) || contains_blank_line(gap) {
            self.pending_kmark_params = None;
            return;
        }

        if matches!(
            event,
            Event::Start(Tag::Paragraph)
                | Event::Start(Tag::HtmlBlock)
                | Event::Start(Tag::Image { .. })
                | Event::End(TagEnd::HtmlBlock)
        ) {
            return;
        }

        self.pending_kmark_params = None;
    }

    fn discard_pending_kmark_params_if_gap_is_incompatible(&mut self, next_offset: usize) {
        let Some(pending) = self.pending_kmark_params.as_ref() else {
            return;
        };

        let next_start_line = self.resolve_offset_line(next_offset);

        if next_start_line > pending.end_line + 1 {
            self.pending_kmark_params = None;
            return;
        }

        if next_offset < pending.end_offset {
            return;
        }

        let gap = &self.content[pending.end_offset..next_offset];

        if !gap.chars().all(char::is_whitespace) || contains_blank_line(gap) {
            self.pending_kmark_params = None;
        }
    }

    fn take_pending_kmark_bundle(&mut self) -> Option<KmarkParamBundle> {
        self.pending_kmark_params.take().map(|pending| pending.bundle)
    }

    fn take_pending_kmark_params_for_image(
        &mut self,
        image_start_offset: usize,
    ) -> Option<KmarkImageParams> {
        self.discard_pending_kmark_params_if_gap_is_incompatible(image_start_offset);
        let bundle = self.take_pending_kmark_bundle()?;
        Some(self.resolve_kmark_bundle(&bundle))
    }

    fn resolve_image_style(&self, single_params: Option<&KmarkImageParams>) -> Option<String> {
        let mut final_params = self.active_kmark_scope.clone().unwrap_or_default();

        if let Some(single_params) = single_params {
            final_params.merge(single_params);
        }

        final_params.to_style()
    }

    fn resolve_kmark_bundle(&self, bundle: &KmarkParamBundle) -> KmarkImageParams {
        let mut final_params = bundle
            .preset_use
            .as_ref()
            .and_then(|preset_name| self.kmark_presets.get(preset_name))
            .cloned()
            .unwrap_or_default();
        final_params.merge(&bundle.params);
        final_params
    }

    fn update_html_text_suppression(&mut self, html: &str) {
        let trimmed = html.trim();

        if trimmed.starts_with("<!--") {
            return;
        }

        if trimmed.starts_with("</") {
            self.suppressed_html_text_depth = self.suppressed_html_text_depth.saturating_sub(1);
            return;
        }

        if trimmed.starts_with('<') && trimmed.ends_with('>') && !trimmed.ends_with("/>") {
            self.suppressed_html_text_depth += 1;
        }
    }

    fn resolve_range_start_line(&self, range: Range<usize>) -> usize {
        resolve_line_number(&self.line_starts, range.start)
    }

    fn resolve_range_end_line(&self, range: Range<usize>) -> usize {
        if self.content.is_empty() {
            return 0;
        }

        let end_offset = range
            .end
            .saturating_sub(1)
            .min(self.content.len().saturating_sub(1));
        resolve_line_number(&self.line_starts, end_offset)
    }

    fn resolve_offset_line(&self, offset: usize) -> usize {
        if self.content.is_empty() {
            return 0;
        }

        let bounded_offset = offset.min(self.content.len().saturating_sub(1));
        resolve_line_number(&self.line_starts, bounded_offset)
    }
}

impl KmarkParamBundle {
    fn merge(&mut self, other: &Self) {
        if let Some(preset_use) = &other.preset_use {
            self.preset_use = Some(preset_use.clone());
        }
        self.params.merge(&other.params);
    }
}

impl KmarkImageParams {
    fn merge(&mut self, other: &Self) {
        if let Some(width) = &other.width {
            self.width = Some(width.clone());
        }
        if let Some(height) = &other.height {
            self.height = Some(height.clone());
        }
        if let Some(fit) = &other.fit {
            self.fit = Some(fit.clone());
        }
        if let Some(position) = &other.position {
            self.position = Some(position.clone());
        }
        if let Some(border_size) = &other.border_size {
            self.border_size = Some(border_size.clone());
        }
        if let Some(border_color) = &other.border_color {
            self.border_color = Some(border_color.clone());
        }
        if let Some(border_style) = &other.border_style {
            self.border_style = Some(border_style.clone());
        }
    }

    fn to_style(&self) -> Option<String> {
        let mut rules = Vec::new();

        if let Some(width) = &self.width {
            rules.push(format!("width:{width}"));
        }
        if let Some(height) = &self.height {
            rules.push(format!("height:{height}"));
        }
        if let Some(fit) = &self.fit {
            rules.push(format!("object-fit:{fit}"));
        }
        if let Some(position) = &self.position {
            rules.push(format!("object-position:{position}"));
        }
        if let Some(border_size) = &self.border_size {
            rules.push(format!("border-width:{border_size}"));
        }
        if let Some(border_style) = self.border_style.as_deref().or_else(|| {
            self.border_size
                .as_ref()
                .map(|_| "solid")
        }) {
            rules.push(format!("border-style:{border_style}"));
        }
        if let Some(border_color) = &self.border_color {
            rules.push(format!("border-color:{border_color}"));
        }

        (!rules.is_empty()).then(|| format!("{};", rules.join(";")))
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

fn parse_kmark_comment(html: &str) -> Option<KmarkComment> {
    let trimmed = html.trim();
    let body = trimmed.strip_prefix("<!--")?.strip_suffix("-->")?.trim();
    let remainder = body.strip_prefix("kmark")?.trim();

    if remainder == "}" {
        return Some(KmarkComment::ScopeEnd);
    }

    if let Some(scope_body) = remainder.strip_prefix('{') {
        return Some(KmarkComment::ScopeStart(parse_kmark_param_bundle(
            scope_body.trim(),
        )));
    }

    let mut define_name = None;
    let mut bundle = KmarkParamBundle::default();

    for token in remainder.split_whitespace() {
        let Some((key, value)) = token.split_once(':') else {
            continue;
        };

        match key {
            "define" => {
                if let Some(preset_name) = normalize_kmark_preset_name(value) {
                    define_name = Some(preset_name);
                }
            }
            "use" => {
                if let Some(preset_name) = normalize_kmark_preset_name(value) {
                    bundle.preset_use = Some(preset_name);
                }
            }
            "w" => bundle.params.width = parse_kmark_size_value(value),
            "h" => bundle.params.height = parse_kmark_size_value(value),
            "fit" => bundle.params.fit = parse_kmark_fit_value(value),
            "pos" => bundle.params.position = parse_kmark_position_value(value),
            "border_size" => bundle.params.border_size = parse_kmark_border_size_value(value),
            "border_color" => bundle.params.border_color = parse_kmark_border_color_value(value),
            "border_style" => bundle.params.border_style = parse_kmark_border_style_value(value),
            _ => {}
        }
    }

    if let Some(name) = define_name {
        return Some(KmarkComment::Define { name, bundle });
    }

    Some(KmarkComment::Params(bundle))
}

fn normalize_kmark_preset_name(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_matches('"');

    (!trimmed.is_empty()
        && trimmed
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-')))
    .then(|| trimmed.to_owned())
}

fn parse_kmark_param_bundle(input: &str) -> KmarkParamBundle {
    match parse_kmark_comment(&format!("<!-- kmark {input} -->")) {
        Some(KmarkComment::Params(bundle)) => bundle,
        Some(KmarkComment::Define { bundle, .. }) => bundle,
        Some(KmarkComment::ScopeStart(bundle)) => bundle,
        Some(KmarkComment::ScopeEnd) | None => KmarkParamBundle::default(),
    }
}

fn parse_kmark_size_value(value: &str) -> Option<String> {
    parse_css_length_value(value, true)
}

fn parse_kmark_border_size_value(value: &str) -> Option<String> {
    parse_css_length_value(value, false)
}

fn parse_css_length_value(value: &str, allow_auto: bool) -> Option<String> {
    let trimmed = value.trim();

    if allow_auto && trimmed.eq_ignore_ascii_case("auto") {
        return Some("auto".to_owned());
    }

    if trimmed.chars().all(|character| character.is_ascii_digit()) {
        return Some(format!("{trimmed}px"));
    }

    let numeric_end = trimmed
        .find(|character: char| !character.is_ascii_digit() && character != '.')
        .unwrap_or(trimmed.len());

    if numeric_end == 0 || numeric_end == trimmed.len() {
        return None;
    }

    let number = &trimmed[..numeric_end];
    let unit = &trimmed[numeric_end..];

    if number.parse::<f64>().is_err() {
        return None;
    }

    matches!(unit, "px" | "%" | "em" | "rem" | "vw" | "vh" | "vmin" | "vmax")
        .then(|| trimmed.to_owned())
}

fn parse_kmark_fit_value(value: &str) -> Option<String> {
    matches!(
        value.trim(),
        "contain" | "cover" | "fill" | "none" | "scale-down"
    )
    .then(|| value.trim().to_owned())
}

fn parse_kmark_position_value(value: &str) -> Option<String> {
    let normalized = value.trim().replace('_', " ");
    let parts = normalized.split_whitespace().collect::<Vec<_>>();

    if parts.is_empty() || parts.len() > 2 {
        return None;
    }

    parts
        .iter()
        .all(|part| matches!(*part, "center" | "top" | "bottom" | "left" | "right"))
        .then(|| parts.join(" "))
}

fn parse_kmark_border_color_value(value: &str) -> Option<String> {
    let trimmed = value.trim();

    if let Some(hex) = trimmed.strip_prefix('#') {
        return (matches!(hex.len(), 3 | 4 | 6 | 8)
            && hex.chars().all(|character| character.is_ascii_hexdigit()))
        .then(|| trimmed.to_owned());
    }

    trimmed
        .chars()
        .all(|character| character.is_ascii_alphabetic())
        .then(|| trimmed.to_ascii_lowercase())
}

fn parse_kmark_border_style_value(value: &str) -> Option<String> {
    matches!(value.trim(), "solid" | "dashed" | "dotted" | "double" | "none")
        .then(|| value.trim().to_owned())
}

fn contains_blank_line(text: &str) -> bool {
    let mut saw_line_break = false;
    let mut chars = text.chars().peekable();

    while let Some(character) = chars.next() {
        match character {
            '\r' => {
                if matches!(chars.peek(), Some(&'\n')) {
                    chars.next();
                }
                if saw_line_break {
                    return true;
                }
                saw_line_break = true;
            }
            '\n' => {
                if saw_line_break {
                    return true;
                }
                saw_line_break = true;
            }
            ' ' | '\t' => {}
            _ => saw_line_break = false,
        }
    }

    false
}

fn is_safe_url(url: &str) -> bool {
    let normalized = url.trim().to_ascii_lowercase();

    !(normalized.starts_with("javascript:") || normalized.starts_with("data:"))
}

fn resolve_image_destination_url(
    destination_url: &str,
    markdown_file_path: Option<&str>,
) -> Option<String> {
    let normalized_url = destination_url.trim();

    if normalized_url.is_empty() || is_unsafe_image_url(normalized_url) {
        return None;
    }

    if is_data_url(normalized_url)
        || is_file_url(normalized_url)
        || is_remote_url(normalized_url)
    {
        return Some(normalized_url.to_owned());
    }

    if is_windows_absolute_path(normalized_url) || Path::new(normalized_url).is_absolute() {
        return Some(file_path_to_url(&resolve_existing_path_string(normalized_url)));
    }

    if let Some(markdown_file_path) = markdown_file_path {
        let resolved_path =
            resolve_relative_path_from_markdown_file(markdown_file_path, normalized_url);
        return Some(file_path_to_url(&resolved_path));
    }

    Some(normalized_url.to_owned())
}

fn resolve_relative_path_from_markdown_file(
    markdown_file_path: &str,
    relative_path: &str,
) -> String {
    let base_directory = parent_path_string(markdown_file_path);
    resolve_existing_path_string(&join_path_strings(&base_directory, relative_path))
}

fn resolve_existing_path_string(path: &str) -> String {
    std::fs::canonicalize(path)
        .map(|resolved_path| normalize_path_string(&resolved_path.to_string_lossy()))
        .unwrap_or_else(|_| normalize_path_string(path))
}

fn join_path_strings(base_directory: &str, relative_path: &str) -> String {
    let normalized_base_directory = normalize_path_string(base_directory);

    if normalized_base_directory == "." {
        return normalize_path_string(relative_path);
    }

    normalize_path_string(&format!(
        "{}/{}",
        normalized_base_directory.trim_end_matches('/'),
        relative_path,
    ))
}

fn parent_path_string(path: &str) -> String {
    let normalized_path = normalize_path_string(path);

    if normalized_path == "." || normalized_path == "/" {
        return normalized_path;
    }

    if is_windows_drive_root(&normalized_path) || is_windows_unc_root(&normalized_path) {
        return normalized_path;
    }

    let trimmed_path = normalized_path.trim_end_matches('/');
    let Some(last_separator_index) = trimmed_path.rfind('/') else {
        return ".".to_owned();
    };

    if last_separator_index == 0 {
        return "/".to_owned();
    }

    trimmed_path[..last_separator_index].to_owned()
}

fn normalize_path_string(path: &str) -> String {
    let slash_path = strip_windows_verbatim_prefix(path);
    let (root, remainder) = split_path_root(&slash_path);
    let mut normalized_segments = Vec::new();

    for segment in remainder.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }

        if segment == ".." {
            if normalized_segments.last().is_some_and(|last| *last != "..") {
                normalized_segments.pop();
            } else if root.is_empty() {
                normalized_segments.push("..");
            }
            continue;
        }

        normalized_segments.push(segment);
    }

    let normalized_remainder = normalized_segments.join("/");

    if root.is_empty() {
        return if normalized_remainder.is_empty() {
            ".".to_owned()
        } else {
            normalized_remainder
        };
    }

    if normalized_remainder.is_empty() {
        return root;
    }

    if root.ends_with('/') {
        format!("{root}{normalized_remainder}")
    } else {
        format!("{root}/{normalized_remainder}")
    }
}

fn strip_windows_verbatim_prefix(path: &str) -> String {
    let slash_path = path.replace('\\', "/");

    if let Some(path_without_prefix) = slash_path.strip_prefix("//?/UNC/") {
        return format!("//{path_without_prefix}");
    }

    if let Some(path_without_prefix) = slash_path.strip_prefix("//?/") {
        return path_without_prefix.to_owned();
    }

    slash_path
}

fn split_path_root(path: &str) -> (String, String) {
    if let Some((root, remainder)) = split_windows_unc_root(path) {
        return (root, remainder);
    }

    if is_windows_absolute_path(path) {
        return (path[..3].to_owned(), path[3..].to_owned());
    }

    if let Some(remainder) = path.strip_prefix('/') {
        return ("/".to_owned(), remainder.to_owned());
    }

    (String::new(), path.to_owned())
}

fn split_windows_unc_root(path: &str) -> Option<(String, String)> {
    let unc_path = path.strip_prefix("//")?;
    let mut segments = unc_path.split('/');
    let server = segments.next()?;
    let share = segments.next()?;

    if server.is_empty() || share.is_empty() {
        return None;
    }

    Some((format!("//{server}/{share}"), segments.collect::<Vec<_>>().join("/")))
}

fn is_windows_drive_root(path: &str) -> bool {
    let bytes = path.as_bytes();

    bytes.len() == 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && bytes[2] == b'/'
}

fn is_windows_unc_root(path: &str) -> bool {
    matches!(
        split_windows_unc_root(path),
        Some((root, remainder)) if root == path && remainder.is_empty()
    )
}

fn file_path_to_url(path: &str) -> String {
    let normalized_path = path.replace('\\', "/");
    let encoded_path = percent_encode_url_path(&normalized_path);

    if normalized_path.starts_with("//") {
        return format!("file:{encoded_path}");
    }

    if is_windows_absolute_path(&normalized_path) {
        return format!("file:///{encoded_path}");
    }

    format!("file://{encoded_path}")
}

fn percent_encode_url_path(path: &str) -> String {
    let mut encoded = String::with_capacity(path.len());

    for byte in path.bytes() {
        let character = byte as char;

        if character.is_ascii_alphanumeric()
            || matches!(character, '-' | '.' | '_' | '~' | '/' | ':')
        {
            encoded.push(character);
        } else {
            encoded.push('%');
            encoded.push_str(&format!("{byte:02X}"));
        }
    }

    encoded
}

fn is_unsafe_image_url(url: &str) -> bool {
    matches!(url_scheme(url).as_deref(), Some("javascript" | "vbscript"))
}

fn is_remote_url(url: &str) -> bool {
    url.starts_with("//") || matches!(url_scheme(url).as_deref(), Some("http" | "https"))
}

fn is_data_url(url: &str) -> bool {
    matches!(url_scheme(url).as_deref(), Some("data"))
}

fn is_file_url(url: &str) -> bool {
    matches!(url_scheme(url).as_deref(), Some("file" | "blob"))
}

fn is_windows_absolute_path(path: &str) -> bool {
    let bytes = path.as_bytes();

    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/')
}

fn url_scheme(url: &str) -> Option<String> {
    let scheme_end = url.find(':')?;
    let prefix_end = url
        .find(['/', '?', '#'])
        .unwrap_or(url.len());

    (scheme_end < prefix_end).then(|| url[..scheme_end].to_ascii_lowercase())
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
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        render_markdown_preview, render_markdown_preview_with_file_path,
        resolve_image_destination_url,
    };

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
            "<blockquote data-source-line-start=\"0\" data-source-line-end=\"1\"><p data-source-line-start=\"0\" data-source-line-end=\"1\">quoted<br />\n<em>value</em></p></blockquote>"
        );
    }

    #[test]
    fn suppresses_inline_html_and_unsafe_links() {
        let rendered_preview =
            render_markdown_preview("[x](javascript:alert(1))<script>alert(1)</script>");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"0\" data-source-line-end=\"0\">x</p>"
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
            "<ul><li data-source-line-start=\"0\" data-source-line-end=\"0\"><span class=\"markdown-task-checkbox\" data-checked=\"true\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\" focusable=\"false\" aria-hidden=\"true\"><path d=\"M4.5 12.5 9.5 17.5 19.5 7.5\" /></svg></span>done</li><li data-source-line-start=\"1\" data-source-line-end=\"1\"><span class=\"markdown-task-checkbox\" data-checked=\"false\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\" focusable=\"false\" aria-hidden=\"true\"><path d=\"M4.5 12.5 9.5 17.5 19.5 7.5\" /></svg></span>todo</li></ul>"
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

    #[test]
    fn renders_relative_images_against_markdown_file_path() {
        let sandbox_directory = create_temp_test_directory();
        let markdown_file_path = sandbox_directory.join("notes.md");
        let image_file_path = sandbox_directory.join("images").join("plot chart.png");
        fs::create_dir_all(image_file_path.parent().unwrap()).expect("failed to create image directory");
        fs::write(&markdown_file_path, "# notes").expect("failed to create markdown file");
        fs::write(&image_file_path, "img").expect("failed to create image file");

        let rendered_preview = render_markdown_preview_with_file_path(
            "![plot](<./images/plot chart.png>)",
            Some(markdown_file_path.to_string_lossy().as_ref()),
        );
        let resolved_image_url = resolve_image_destination_url(
            "./images/plot chart.png",
            Some(markdown_file_path.to_string_lossy().as_ref()),
        )
        .expect("resolved image url");

        assert_eq!(
            rendered_preview.html,
            format!(
                "<p data-source-line-start=\"0\" data-source-line-end=\"0\"><img src=\"{}\" alt=\"plot\" /></p>",
                resolved_image_url,
            )
        );
    }

    #[test]
    fn allows_data_urls_for_markdown_images() {
        let rendered_preview =
            render_markdown_preview("![badge](data:image/svg+xml,%3Csvg%20viewBox='0%200%201%201'%3E)");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"0\" data-source-line-end=\"0\"><img src=\"data:image/svg+xml,%3Csvg%20viewBox=&#39;0%200%201%201&#39;%3E\" alt=\"badge\" /></p>"
        );
    }

    #[test]
    fn applies_kmark_single_image_size_comment() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:200 h:100 -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\"><img src=\"image.png\" alt=\"\" style=\"width:200px;height:100px;\" /></p>"
        );
    }

    #[test]
    fn preserves_alt_text_when_kmark_comment_applies() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:200 -->\n![基板写真](board.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\"><img src=\"board.png\" alt=\"基板写真\" style=\"width:200px;\" /></p>"
        );
    }

    #[test]
    fn merges_consecutive_kmark_comments_with_last_write_wins() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:200 -->\n<!-- kmark h:100 -->\n<!-- kmark w:300 -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"3\" data-source-line-end=\"3\"><img src=\"image.png\" alt=\"\" style=\"width:300px;height:100px;\" /></p>"
        );
    }

    #[test]
    fn ignores_kmark_single_comment_when_blank_line_exists_before_image() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:200 -->\n\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"2\" data-source-line-end=\"2\"><img src=\"image.png\" alt=\"\" /></p>"
        );
    }

    #[test]
    fn applies_kmark_scope_to_all_images_in_scope() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { w:200 h:100 -->\n\n![](a.png)\n\n![](b.png)\n\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"2\" data-source-line-end=\"2\"><img src=\"a.png\" alt=\"\" style=\"width:200px;height:100px;\" /></p><p data-source-line-start=\"4\" data-source-line-end=\"4\"><img src=\"b.png\" alt=\"\" style=\"width:200px;height:100px;\" /></p>"
        );
    }

    #[test]
    fn lets_single_kmark_override_active_scope() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { w:200 h:100 -->\n\n![](a.png)\n\n<!-- kmark h:300 -->\n![](b.png)\n\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"2\" data-source-line-end=\"2\"><img src=\"a.png\" alt=\"\" style=\"width:200px;height:100px;\" /></p><p data-source-line-start=\"5\" data-source-line-end=\"5\"><img src=\"b.png\" alt=\"\" style=\"width:200px;height:300px;\" /></p>"
        );
    }

    #[test]
    fn applies_defined_kmark_preset_to_image_use_comment() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark define:thumb w:200 h:100 fit:cover -->\n\n<!-- kmark use:thumb -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"3\" data-source-line-end=\"3\"><img src=\"image.png\" alt=\"\" style=\"width:200px;height:100px;object-fit:cover;\" /></p>"
        );
    }

    #[test]
    fn supports_separated_kmark_preset_definition_and_scope_usage() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:200 -->\n<!-- kmark h:100 -->\n<!-- kmark fit:cover -->\n<!-- kmark define:thumb -->\n\n<!-- kmark { use:thumb w:300 -->\n![](a.png)\n<!-- kmark h:240 -->\n![](b.png)\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"6\" data-source-line-end=\"6\"><img src=\"a.png\" alt=\"\" style=\"width:300px;height:100px;object-fit:cover;\" /></p><p data-source-line-start=\"8\" data-source-line-end=\"8\"><img src=\"b.png\" alt=\"\" style=\"width:300px;height:240px;object-fit:cover;\" /></p>"
        );
    }

    #[test]
    fn ignores_undefined_kmark_preset_use() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark use:not_found -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\"><img src=\"image.png\" alt=\"\" /></p>"
        );
    }

    #[test]
    fn resolves_relative_images_against_windows_style_markdown_path() {
        let resolved_image_url = resolve_image_destination_url(
            "image.png",
            Some("C:\\workspace\\docs\\notes.md"),
        )
        .expect("resolved image url");

        assert_eq!(resolved_image_url, "file:///C:/workspace/docs/image.png");
    }

    fn create_temp_test_directory() -> PathBuf {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("kmark-render-test-{unique_suffix}"));
        fs::create_dir_all(&directory).expect("failed to create temp directory");
        directory
    }
}
