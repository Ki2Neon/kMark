use std::{collections::HashMap, ops::Range, path::Path};

use pulldown_cmark::{
    Alignment, BlockQuoteKind, CodeBlockKind, Event, LinkType, MetadataBlockKind, Options, Parser,
    Tag, TagEnd,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedMarkdownPreview {
    pub html: String,
    pub page_htmls: Vec<String>,
    pub pages: Vec<RenderedPage>,
    pub default_page_style: PageStyle,
    pub default_text_style: PreviewTextStyle,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedPage {
    pub html: String,
    pub page_style: PageStyle,
    pub text_style: PreviewTextStyle,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageStyle {
    pub width: CssLength,
    pub height: CssLength,
    pub margin_top: CssLength,
    pub margin_right: CssLength,
    pub margin_bottom: CssLength,
    pub margin_left: CssLength,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreviewTextStyle {
    pub font_size: CssLength,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CssLength {
    value: String,
}

struct MarkdownPageSegment {
    content: String,
    line_offset: usize,
    page_directive: PartialPageDirective,
}

struct MarkdownPageSegments {
    segments: Vec<MarkdownPageSegment>,
}

#[derive(Clone, Copy)]
struct MarkdownLineSpan {
    start: usize,
    content_end: usize,
    end: usize,
}

#[derive(Clone, Copy)]
struct MarkdownFence {
    marker: char,
    length: usize,
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
    source_line_attributes: String,
}

#[derive(Debug, Clone)]
struct FootnoteDefinitionContext {
    label: String,
    paragraph_count: usize,
}

#[derive(Debug, Clone)]
struct ParagraphContext {
    open_tag_start: usize,
    source_line_end: usize,
    image_count: usize,
    contains_non_image_content: bool,
    soft_break_ranges: Vec<Range<usize>>,
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
struct KmarkLayoutParams {
    layout: Option<KmarkLayout>,
    align: Option<KmarkAlign>,
    valign: Option<KmarkValign>,
    gap: Option<String>,
    wrap: Option<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkParams {
    image: KmarkImageParams,
    layout: KmarkLayoutParams,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkParamBundle {
    preset_use: Option<String>,
    params: KmarkParams,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkParamLayer {
    preset: KmarkParams,
    direct: KmarkParams,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct KmarkScopeContext {
    layer: Option<KmarkParamLayer>,
}

#[derive(Debug, Clone)]
struct PendingKmarkParams {
    bundle: KmarkParamBundle,
    end_offset: usize,
    end_line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActiveKmarkSingleBlock {
    layer: KmarkParamLayer,
    end: KmarkBlockEnd,
    nested_same_kind_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KmarkLayout {
    Row,
    Column,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KmarkAlign {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KmarkValign {
    Top,
    Center,
    Bottom,
    Stretch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KmarkBlockEnd {
    Paragraph,
    Heading,
    BlockQuote,
    CodeBlock,
    List,
    FootnoteDefinition,
    DefinitionList,
    Table,
    MetadataBlock,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PageSizePreset {
    A3,
    A4,
    A5,
    B4,
    B5,
    Letter,
    Legal,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PageOrientation {
    Portrait,
    Landscape,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct PartialPageDirective {
    page_size: Option<PageSizePreset>,
    page_orientation: Option<PageOrientation>,
    page_width: Option<CssLength>,
    page_height: Option<CssLength>,
    page_margin: Option<CssLength>,
    page_margin_top: Option<CssLength>,
    page_margin_right: Option<CssLength>,
    page_margin_bottom: Option<CssLength>,
    page_margin_left: Option<CssLength>,
    font_size: Option<CssLength>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActiveKmarkScopeLine {
    line: String,
    end_offset: usize,
    page_directive: PartialPageDirective,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PageGeometryBasis {
    page_size: PageSizePreset,
    page_orientation: PageOrientation,
    page_width: Option<CssLength>,
    page_height: Option<CssLength>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DocumentPageConfig {
    geometry: PageGeometryBasis,
    default_page_style: PageStyle,
    default_text_style: PreviewTextStyle,
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
    paragraph_context: Option<ParagraphContext>,
    kmark_presets: HashMap<String, KmarkParams>,
    kmark_scope_stack: Vec<KmarkScopeContext>,
    pending_kmark_params: Option<PendingKmarkParams>,
    active_kmark_single_block: Option<ActiveKmarkSingleBlock>,
    pending_kmark_block_style: Option<String>,
}

const PAGE_BREAK_TOKEN_OPEN: &str = "<!--";
const PAGE_BREAK_TOKEN_CLOSE: &str = "-->";
const LINK_REL: &str = "noreferrer noopener";
const DEFAULT_PAGE_WIDTH: &str = "210mm";
const DEFAULT_PAGE_HEIGHT: &str = "297mm";
const DEFAULT_PAGE_MARGIN_TOP: &str = "16mm";
const DEFAULT_PAGE_MARGIN_RIGHT: &str = "16mm";
const DEFAULT_PAGE_MARGIN_BOTTOM: &str = "18mm";
const DEFAULT_PAGE_MARGIN_LEFT: &str = "16mm";
const DEFAULT_PREVIEW_FONT_SIZE: &str = "10.5pt";

pub fn render_markdown_preview(content: &str) -> RenderedMarkdownPreview {
    render_markdown_preview_with_file_path(content, None)
}

pub fn render_markdown_preview_with_file_path(
    content: &str,
    markdown_file_path: Option<&str>,
) -> RenderedMarkdownPreview {
    let markdown_pages = split_markdown_pages(content);
    let document_page_config = DocumentPageConfig::default_config();
    let pages = markdown_pages
        .segments
        .iter()
        .map(|page_segment| {
            let page_config = document_page_config.resolve_page(&page_segment.page_directive);
            let html = render_markdown_page(
                &page_segment.content,
                page_segment.line_offset,
                markdown_file_path,
            );

            RenderedPage {
                html,
                page_style: page_config.default_page_style,
                text_style: page_config.default_text_style,
            }
        })
        .collect::<Vec<_>>();
    let page_htmls = pages
        .iter()
        .map(|page| page.html.clone())
        .collect::<Vec<_>>();

    RenderedMarkdownPreview {
        html: page_htmls.join(""),
        page_htmls,
        pages,
        default_page_style: document_page_config.default_page_style,
        default_text_style: document_page_config.default_text_style,
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

fn split_markdown_pages(content: &str) -> MarkdownPageSegments {
    let mut page_segments = Vec::new();
    let mut last_index = 0;
    let mut line_offset = 0usize;
    let mut active_fence = None;
    let mut is_inside_html_comment_block = false;
    let mut active_scope_lines: Vec<ActiveKmarkScopeLine> = Vec::new();
    let mut segment_has_rendered_content = false;

    for (line_index, line_span) in collect_markdown_line_spans(content).into_iter().enumerate() {
        let line = &content[line_span.start..line_span.content_end];

        if is_inside_html_comment_block {
            if line.contains(PAGE_BREAK_TOKEN_CLOSE) {
                is_inside_html_comment_block = false;
            }
            continue;
        }

        if let Some(fence) = active_fence {
            if is_markdown_fence_close(line, fence) {
                active_fence = None;
            }
            continue;
        }

        if let Some(fence) = parse_markdown_fence_open(line) {
            active_fence = Some(fence);
            segment_has_rendered_content = true;
            continue;
        }

        if let Some(scope_page_directive) = parse_kmark_scope_start_page_directive_line(line) {
            let current_page_directive = resolve_active_page_directive(&active_scope_lines);
            let mut next_scope_lines = active_scope_lines.clone();
            next_scope_lines.push(ActiveKmarkScopeLine {
                line: line.to_owned(),
                end_offset: line_span.end,
                page_directive: scope_page_directive,
            });
            let next_page_directive = resolve_active_page_directive(&next_scope_lines);

            if segment_has_rendered_content
                && current_page_directive.has_different_page_style_than(&next_page_directive)
            {
                push_markdown_page_segment(
                    &mut page_segments,
                    content,
                    last_index,
                    line_span.start,
                    line_offset,
                    current_page_directive,
                    &active_scope_lines,
                );
                last_index = line_span.start;
                line_offset = line_index;
                segment_has_rendered_content = false;
            }

            active_scope_lines = next_scope_lines;
            continue;
        }

        if is_kmark_scope_end_line(line) {
            let current_page_directive = resolve_active_page_directive(&active_scope_lines);
            let mut next_scope_lines = active_scope_lines.clone();
            next_scope_lines.pop();
            let next_page_directive = resolve_active_page_directive(&next_scope_lines);

            if segment_has_rendered_content
                && current_page_directive.has_different_page_style_than(&next_page_directive)
            {
                push_markdown_page_segment(
                    &mut page_segments,
                    content,
                    last_index,
                    line_span.start,
                    line_offset,
                    current_page_directive,
                    &active_scope_lines,
                );
                last_index = line_span.end;
                line_offset = line_index + 1;
                segment_has_rendered_content = false;
                active_scope_lines = next_scope_lines;
                continue;
            }

            active_scope_lines = next_scope_lines;
        }

        if is_page_break_line(line) {
            let current_page_directive = resolve_active_page_directive(&active_scope_lines);
            if segment_has_rendered_content {
                push_markdown_page_segment(
                    &mut page_segments,
                    content,
                    last_index,
                    line_span.start,
                    line_offset,
                    current_page_directive,
                    &active_scope_lines,
                );
            }

            last_index = line_span.end;
            line_offset = line_index + 1;
            segment_has_rendered_content = false;
            continue;
        }

        if is_unclosed_html_comment_line(line) {
            is_inside_html_comment_block = true;
        }

        if line.trim().is_empty() || is_kmark_comment_line(line) {
            continue;
        }

        segment_has_rendered_content = true;
    }

    if segment_has_rendered_content {
        let current_page_directive = resolve_active_page_directive(&active_scope_lines);
        push_markdown_page_segment(
            &mut page_segments,
            content,
            last_index,
            content.len(),
            line_offset,
            current_page_directive,
            &active_scope_lines,
        );
    }

    if page_segments.is_empty() {
        page_segments.push(MarkdownPageSegment {
            content: String::new(),
            line_offset: 0,
            page_directive: PartialPageDirective::default(),
        });
    }

    MarkdownPageSegments {
        segments: page_segments,
    }
}

fn push_markdown_page_segment(
    page_segments: &mut Vec<MarkdownPageSegment>,
    content: &str,
    start_index: usize,
    end_index: usize,
    line_offset: usize,
    page_directive: PartialPageDirective,
    active_scope_lines: &[ActiveKmarkScopeLine],
) {
    let prefix_lines = active_scope_lines
        .iter()
        .filter(|scope_line| scope_line.end_offset <= start_index)
        .map(|scope_line| scope_line.line.as_str())
        .collect::<Vec<_>>();
    let mut segment_content = String::new();

    for prefix_line in &prefix_lines {
        segment_content.push_str(prefix_line);
        segment_content.push('\n');
    }
    segment_content.push_str(&content[start_index..end_index]);

    page_segments.push(MarkdownPageSegment {
        content: segment_content,
        line_offset: line_offset.saturating_sub(prefix_lines.len()),
        page_directive,
    });
}

fn resolve_active_page_directive(
    active_scope_lines: &[ActiveKmarkScopeLine],
) -> PartialPageDirective {
    let mut page_directive = PartialPageDirective::default();

    for scope_line in active_scope_lines {
        page_directive.merge(&scope_line.page_directive);
    }

    page_directive
}

fn collect_markdown_line_spans(content: &str) -> Vec<MarkdownLineSpan> {
    let mut line_spans = Vec::new();
    let mut start = 0;
    let bytes = content.as_bytes();

    while start < content.len() {
        let mut end = start;

        while end < content.len() && bytes[end] != b'\n' {
            end += 1;
        }

        let mut content_end = end;
        if content_end > start && bytes[content_end - 1] == b'\r' {
            content_end -= 1;
        }

        let line_end = if end < content.len() { end + 1 } else { end };

        line_spans.push(MarkdownLineSpan {
            start,
            content_end,
            end: line_end,
        });

        start = line_end;
    }

    line_spans
}

fn strip_markdown_fence_indent(line: &str) -> Option<&str> {
    let indent_width = line
        .chars()
        .take_while(|character| *character == ' ')
        .count();

    if indent_width > 3 {
        return None;
    }

    Some(&line[indent_width..])
}

fn parse_markdown_fence_open(line: &str) -> Option<MarkdownFence> {
    let rest = strip_markdown_fence_indent(line)?;
    let marker = rest.chars().next()?;

    if marker != '`' && marker != '~' {
        return None;
    }

    let length = rest
        .chars()
        .take_while(|character| *character == marker)
        .count();
    if length < 3 {
        return None;
    }

    let info = &rest[marker.len_utf8() * length..];
    if marker == '`' && info.contains('`') {
        return None;
    }

    Some(MarkdownFence { marker, length })
}

fn is_markdown_fence_close(line: &str, fence: MarkdownFence) -> bool {
    let Some(rest) = strip_markdown_fence_indent(line) else {
        return false;
    };

    let length = rest
        .chars()
        .take_while(|character| *character == fence.marker)
        .count();

    length >= fence.length && rest[fence.marker.len_utf8() * length..].trim().is_empty()
}

fn is_page_break_line(line: &str) -> bool {
    let Some(remainder) = line.strip_prefix(PAGE_BREAK_TOKEN_OPEN) else {
        return false;
    };
    let Some(close_offset) = remainder.find(PAGE_BREAK_TOKEN_CLOSE) else {
        return false;
    };

    let token_end = PAGE_BREAK_TOKEN_OPEN.len() + close_offset + PAGE_BREAK_TOKEN_CLOSE.len();
    let token = &line[..token_end];

    is_page_break_token(token) && line[token_end..].trim().is_empty()
}

fn is_unclosed_html_comment_line(line: &str) -> bool {
    line.starts_with(PAGE_BREAK_TOKEN_OPEN) && !line.contains(PAGE_BREAK_TOKEN_CLOSE)
}

fn is_kmark_comment_line(line: &str) -> bool {
    let trimmed = line.trim();
    let Some(body) = trimmed
        .strip_prefix(PAGE_BREAK_TOKEN_OPEN)
        .and_then(|body| body.strip_suffix(PAGE_BREAK_TOKEN_CLOSE))
    else {
        return false;
    };

    body.trim().starts_with("kmark")
}

fn parse_kmark_comment_body(line: &str) -> Option<&str> {
    let trimmed = line.trim();
    let body = trimmed
        .strip_prefix(PAGE_BREAK_TOKEN_OPEN)?
        .strip_suffix(PAGE_BREAK_TOKEN_CLOSE)?
        .trim();

    body.strip_prefix("kmark").map(str::trim)
}

fn parse_kmark_scope_start_page_directive_line(line: &str) -> Option<PartialPageDirective> {
    let remainder = parse_kmark_comment_body(line)?;
    let scope_body = remainder.strip_prefix('{')?.trim();

    Some(parse_kmark_page_directive_tokens(scope_body).unwrap_or_default())
}

fn is_kmark_scope_end_line(line: &str) -> bool {
    parse_kmark_comment_body(line).is_some_and(|remainder| remainder == "}")
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
            paragraph_context: None,
            kmark_presets: HashMap::new(),
            kmark_scope_stack: Vec::new(),
            pending_kmark_params: None,
            active_kmark_single_block: None,
            pending_kmark_block_style: None,
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

        self.close_active_kmark_single_block();
        self.close_unclosed_kmark_scopes();
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
            Event::End(tag_end) => self.end_tag(tag_end, &range),
            Event::Text(text) => self.push_text(&text),
            Event::Code(text) => self.push_code(&text),
            Event::SoftBreak => self.push_soft_break(),
            Event::HardBreak => self.push_hard_break(),
            Event::Rule => {
                self.push_raw(&format!("<hr{} />", self.source_line_attributes(&range),))
            }
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
            self.apply_kmark_comment(comment, range.clone());
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

        self.mark_paragraph_non_image_content();

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
                    source_line_attributes: String::new(),
                });
            }
            return;
        }

        self.track_active_kmark_single_block_nested_start(&tag);
        self.start_pending_kmark_single_block(&tag, range.start);

        match tag {
            Tag::Paragraph => {
                if self.is_inside_footnote_definition() {
                    let paragraph_count = self.begin_footnote_paragraph();
                    if paragraph_count > 1 {
                        self.push_raw("<p>");
                        self.paragraph_context = Some(ParagraphContext {
                            open_tag_start: self.html.len() - "<p>".len(),
                            source_line_end: 0,
                            image_count: 0,
                            contains_non_image_content: false,
                            soft_break_ranges: Vec::new(),
                        });
                    }
                    return;
                }
                let paragraph_open_tag = format!(
                    "<p{}{}>",
                    self.source_line_attributes(range),
                    self.take_pending_kmark_block_style_attribute(),
                );
                let open_tag_start = self.html.len();
                self.push_raw(&paragraph_open_tag);
                self.paragraph_context = Some(ParagraphContext {
                    open_tag_start,
                    source_line_end: self.resolve_range_end_line(range.clone()),
                    image_count: 0,
                    contains_non_image_content: false,
                    soft_break_ranges: Vec::new(),
                });
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
                html.push_str(&self.take_pending_kmark_block_style_attribute());
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
                html.push_str(&self.take_pending_kmark_block_style_attribute());
                html.push('>');
                self.push_raw(&html);
            }
            Tag::CodeBlock(kind) => {
                let mut html = format!(
                    "<pre{}{}><code",
                    self.source_line_attributes(range),
                    self.take_pending_kmark_block_style_attribute(),
                );
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
            Tag::List(Some(1)) => {
                let style_attribute = self.take_pending_kmark_block_style_attribute();
                self.push_raw(&format!("<ol{}>", style_attribute));
            }
            Tag::List(Some(start)) => {
                let style_attribute = self.take_pending_kmark_block_style_attribute();
                self.push_raw(&format!("<ol start=\"{start}\"{}>", style_attribute));
            }
            Tag::List(None) => {
                let style_attribute = self.take_pending_kmark_block_style_attribute();
                self.push_raw(&format!("<ul{}>", style_attribute));
            }
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
                let source_line_attributes = self.source_line_attributes(range);
                let style_attribute = self.take_pending_kmark_block_style_attribute();
                self.push_raw(&format!(
                    "<div class=\"footnote-definition\" id=\"{}\"{}{}><sup class=\"footnote-definition-label\">{}</sup>",
                    footnote_definition_id(number),
                    source_line_attributes,
                    style_attribute,
                    number,
                ));
            }
            Tag::DefinitionList => {
                let style_attribute = self.take_pending_kmark_block_style_attribute();
                self.push_raw(&format!("<dl{}>", style_attribute));
            }
            Tag::DefinitionListTitle => self.push_raw("<dt>"),
            Tag::DefinitionListDefinition => self.push_raw("<dd>"),
            Tag::Table(alignments) => {
                self.table_alignments = alignments;
                self.table_section = TableSection::Head;
                self.table_cell_index = 0;
                self.table_body_open = false;
                let style_attribute = self.take_pending_kmark_block_style_attribute();
                self.push_raw(&format!("<table{}>", style_attribute));
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
                self.mark_paragraph_image();
                let source_line_attributes = self.source_line_attributes(range);
                let single_layer = self.take_pending_kmark_layer_for_image(range.start);
                let image_style = self.resolve_image_style(single_layer.as_ref());
                self.image_stack.push(ImageContext {
                    destination_url: resolve_image_destination_url(
                        &dest_url,
                        self.markdown_file_path,
                    ),
                    title: title.to_string(),
                    alt_text: String::new(),
                    style: image_style,
                    source_line_attributes,
                });
            }
            Tag::MetadataBlock(kind) => {
                let style_attribute = self.take_pending_kmark_block_style_attribute();
                self.push_raw(&format!(
                    "<section data-metadata-block=\"{}\"{}>",
                    metadata_block_name(kind),
                    style_attribute,
                ));
            }
        }
    }

    fn end_tag(&mut self, tag_end: TagEnd, range: &Range<usize>) {
        if self.is_collecting_image_alt_text() {
            if matches!(tag_end, TagEnd::Image) {
                self.finish_image();
            }
            return;
        }

        let should_close_kmark_single_block = self.should_close_active_kmark_single_block(&tag_end);

        match tag_end {
            TagEnd::Paragraph => {
                if self.is_inside_footnote_definition() {
                    if self.current_footnote_paragraph_count() > 1 {
                        self.finalize_paragraph_context();
                        self.push_raw("</p>");
                    }
                } else {
                    self.update_paragraph_source_line_end(
                        self.resolve_range_end_line(range.clone()),
                    );
                    self.finalize_paragraph_context();
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

        if should_close_kmark_single_block {
            self.close_active_kmark_single_block();
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
                parent_image_context
                    .alt_text
                    .push_str(&image_context.alt_text);
            }
            return;
        }

        let Some(destination_url) = image_context.destination_url else {
            self.push_text(&image_context.alt_text);
            return;
        };

        let mut html = format!(
            "<img src=\"{}\" alt=\"{}\"{}",
            escape_html(&destination_url),
            escape_html(&image_context.alt_text),
            image_context.source_line_attributes,
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

        self.mark_paragraph_non_image_content();

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

        self.mark_paragraph_non_image_content();

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

        if !text.trim().is_empty() {
            self.mark_paragraph_non_image_content();
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

        self.mark_paragraph_non_image_content();

        self.push_raw("<code>");
        self.html.push_str(&escape_html(text));
        self.push_raw("</code>");
    }

    fn push_soft_break(&mut self) {
        if let Some(image_context) = self.image_stack.last_mut() {
            image_context.alt_text.push(' ');
            return;
        }

        const SOFT_BREAK_HTML: &str = "<br />\n";
        if let Some(context) = self.paragraph_context.as_mut() {
            let start = self.html.len();
            context
                .soft_break_ranges
                .push(start..start + SOFT_BREAK_HTML.len());
        }
        self.push_raw(SOFT_BREAK_HTML);
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
        let (start_line, end_line) =
            resolve_source_line_range(self.content, &self.line_starts, self.line_offset, range);
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
                    .insert(name, self.resolve_kmark_bundle_params(&final_bundle));
            }
            KmarkComment::ScopeStart(bundle) => {
                let mut final_bundle = self.take_pending_kmark_bundle().unwrap_or_default();
                final_bundle.merge(&bundle);
                let layer = self.resolve_kmark_bundle_layer(&final_bundle);
                let resolved_params = layer.resolved_params();
                if !resolved_params.has_directives() {
                    self.kmark_scope_stack
                        .push(KmarkScopeContext { layer: None });
                    return;
                }

                let style = resolved_params.layout.to_scope_style();
                self.push_raw(&format!(
                    "<div class=\"kmark-scope\" style=\"{}\">",
                    escape_html(&style),
                ));
                self.kmark_scope_stack
                    .push(KmarkScopeContext { layer: Some(layer) });
            }
            KmarkComment::ScopeEnd => {
                self.pending_kmark_params = None;
                self.close_kmark_scope();
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
            if is_pending_kmark_target_event(event) {
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

        if is_pending_kmark_target_event(event) {
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
        self.pending_kmark_params
            .take()
            .map(|pending| pending.bundle)
    }

    fn take_pending_kmark_layer_for_image(
        &mut self,
        image_start_offset: usize,
    ) -> Option<KmarkParamLayer> {
        self.discard_pending_kmark_params_if_gap_is_incompatible(image_start_offset);
        let bundle = self.take_pending_kmark_bundle()?;
        Some(self.resolve_kmark_bundle_layer(&bundle))
    }

    fn resolve_image_style(&self, single_layer: Option<&KmarkParamLayer>) -> Option<String> {
        let mut final_params = KmarkParams::default();

        for scope in &self.kmark_scope_stack {
            if let Some(layer) = &scope.layer {
                final_params.merge(&layer.preset);
            }
        }
        if let Some(active_single) = self.active_kmark_single_block.as_ref() {
            final_params.merge(&active_single.layer.preset);
        }
        if let Some(single_layer) = single_layer {
            final_params.merge(&single_layer.preset);
        }

        for scope in &self.kmark_scope_stack {
            if let Some(layer) = &scope.layer {
                final_params.merge(&layer.direct);
            }
        }
        if let Some(active_single) = self.active_kmark_single_block.as_ref() {
            final_params.merge(&active_single.layer.direct);
        }
        if let Some(single_layer) = single_layer {
            final_params.merge(&single_layer.direct);
        }

        final_params.image.to_style()
    }

    fn resolve_kmark_bundle_layer(&self, bundle: &KmarkParamBundle) -> KmarkParamLayer {
        let preset = bundle
            .preset_use
            .as_ref()
            .and_then(|preset_name| self.kmark_presets.get(preset_name))
            .cloned()
            .unwrap_or_default();

        KmarkParamLayer {
            preset,
            direct: bundle.params.clone(),
        }
    }

    fn resolve_kmark_bundle_params(&self, bundle: &KmarkParamBundle) -> KmarkParams {
        self.resolve_kmark_bundle_layer(bundle).resolved_params()
    }

    fn start_pending_kmark_single_block(&mut self, tag: &Tag<'static>, start_offset: usize) {
        if self.active_kmark_single_block.is_some() {
            return;
        }

        let Some(end) = KmarkBlockEnd::from_start_tag(tag) else {
            return;
        };

        self.discard_pending_kmark_params_if_gap_is_incompatible(start_offset);

        let Some(bundle) = self
            .pending_kmark_params
            .as_ref()
            .map(|pending| pending.bundle.clone())
        else {
            return;
        };

        let layer = self.resolve_kmark_bundle_layer(&bundle);

        self.pending_kmark_params = None;
        self.pending_kmark_block_style = layer.resolved_params().layout.to_single_block_style();
        self.active_kmark_single_block = Some(ActiveKmarkSingleBlock {
            layer,
            end,
            nested_same_kind_count: 0,
        });
    }

    fn track_active_kmark_single_block_nested_start(&mut self, tag: &Tag<'static>) {
        let Some(active_single) = self.active_kmark_single_block.as_mut() else {
            return;
        };

        if KmarkBlockEnd::from_start_tag(tag).is_some_and(|end| end == active_single.end) {
            active_single.nested_same_kind_count += 1;
        }
    }

    fn should_close_active_kmark_single_block(&mut self, tag_end: &TagEnd) -> bool {
        let Some(active_single) = self.active_kmark_single_block.as_mut() else {
            return false;
        };

        if !active_single.end.matches_end(tag_end) {
            return false;
        }

        if active_single.nested_same_kind_count > 0 {
            active_single.nested_same_kind_count -= 1;
            return false;
        }

        true
    }

    fn close_active_kmark_single_block(&mut self) {
        self.active_kmark_single_block = None;
        self.pending_kmark_block_style = None;
    }

    fn take_pending_kmark_block_style_attribute(&mut self) -> String {
        self.pending_kmark_block_style
            .take()
            .map(|style| format!(" style=\"{}\"", escape_html(&style)))
            .unwrap_or_default()
    }

    fn close_kmark_scope(&mut self) {
        if self
            .kmark_scope_stack
            .pop()
            .is_some_and(|context| context.layer.is_some())
        {
            self.push_raw("</div>");
        }
    }

    fn close_unclosed_kmark_scopes(&mut self) {
        while let Some(context) = self.kmark_scope_stack.pop() {
            if context.layer.is_some() {
                self.push_raw("</div>");
            }
        }
    }

    fn is_inside_kmark_scope(&self) -> bool {
        self.kmark_scope_stack
            .iter()
            .any(|context| context.layer.is_some())
    }

    fn mark_paragraph_image(&mut self) {
        if let Some(context) = self.paragraph_context.as_mut() {
            context.image_count += 1;
        }
    }

    fn mark_paragraph_non_image_content(&mut self) {
        if let Some(context) = self.paragraph_context.as_mut() {
            context.contains_non_image_content = true;
        }
    }

    fn finalize_paragraph_context(&mut self) {
        let Some(context) = self.paragraph_context.take() else {
            return;
        };

        if self.should_flatten_kmark_scope_image_paragraph(&context) {
            self.remove_soft_breaks(&context.soft_break_ranges);
            self.patch_tag_style(context.open_tag_start, "display:contents");
        }

        self.patch_paragraph_source_line_end(context.open_tag_start, context.source_line_end);
    }

    fn should_flatten_kmark_scope_image_paragraph(&self, context: &ParagraphContext) -> bool {
        self.is_inside_kmark_scope()
            && context.image_count > 0
            && !context.contains_non_image_content
    }

    fn remove_soft_breaks(&mut self, ranges: &[Range<usize>]) {
        for range in ranges.iter().rev() {
            if range.end <= self.html.len() {
                self.html.replace_range(range.clone(), "");
            }
        }
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

    fn update_paragraph_source_line_end(&mut self, source_line_end: usize) {
        if let Some(context) = self.paragraph_context.as_mut() {
            context.source_line_end = source_line_end;
        }
    }

    fn patch_paragraph_source_line_end(&mut self, open_tag_start: usize, source_line_end: usize) {
        let Some(relative_tag_end_offset) = self.html[open_tag_start..].find('>') else {
            return;
        };
        let tag_end_offset = open_tag_start + relative_tag_end_offset;
        let tag_content = &self.html[open_tag_start..tag_end_offset];
        let Some(attribute_offset) = tag_content.find("data-source-line-end=\"") else {
            return;
        };
        let value_start = open_tag_start + attribute_offset + "data-source-line-end=\"".len();
        let Some(relative_value_end) = self.html[value_start..tag_end_offset].find('"') else {
            return;
        };
        let value_end = value_start + relative_value_end;
        self.html
            .replace_range(value_start..value_end, &source_line_end.to_string());
    }

    fn patch_tag_style(&mut self, open_tag_start: usize, style_rule: &str) {
        let Some(relative_tag_end_offset) = self.html[open_tag_start..].find('>') else {
            return;
        };
        let tag_end_offset = open_tag_start + relative_tag_end_offset;
        let tag_content = &self.html[open_tag_start..tag_end_offset];

        if let Some(style_offset) = tag_content.find("style=\"") {
            let value_start = open_tag_start + style_offset + "style=\"".len();
            self.html
                .insert_str(value_start, &format!("{};", escape_html(style_rule)));
            return;
        }

        self.html.insert_str(
            tag_end_offset,
            &format!(" style=\"{}\"", escape_html(style_rule)),
        );
    }

    fn resolve_range_start_line(&self, range: Range<usize>) -> usize {
        resolve_line_number(&self.line_starts, range.start) + self.line_offset
    }

    fn resolve_range_end_line(&self, range: Range<usize>) -> usize {
        if self.content.is_empty() {
            return self.line_offset;
        }

        let end_offset = range
            .end
            .saturating_sub(1)
            .min(self.content.len().saturating_sub(1));
        resolve_line_number(&self.line_starts, end_offset) + self.line_offset
    }

    fn resolve_offset_line(&self, offset: usize) -> usize {
        if self.content.is_empty() {
            return self.line_offset;
        }

        let bounded_offset = offset.min(self.content.len().saturating_sub(1));
        resolve_line_number(&self.line_starts, bounded_offset) + self.line_offset
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

impl KmarkParamLayer {
    fn resolved_params(&self) -> KmarkParams {
        let mut params = self.preset.clone();
        params.merge(&self.direct);
        params
    }
}

impl KmarkParams {
    fn merge(&mut self, other: &Self) {
        self.image.merge(&other.image);
        self.layout.merge(&other.layout);
    }

    fn has_directives(&self) -> bool {
        self.image.has_image_directives() || self.layout.has_layout_directives()
    }
}

impl KmarkLayoutParams {
    fn merge(&mut self, other: &Self) {
        if let Some(layout) = other.layout {
            self.layout = Some(layout);
        }
        if let Some(align) = other.align {
            self.align = Some(align);
        }
        if let Some(valign) = other.valign {
            self.valign = Some(valign);
        }
        if let Some(gap) = &other.gap {
            self.gap = Some(gap.clone());
        }
        if let Some(wrap) = other.wrap {
            self.wrap = Some(wrap);
        }
    }

    fn has_layout_directives(&self) -> bool {
        self.layout.is_some()
            || self.align.is_some()
            || self.valign.is_some()
            || self.gap.is_some()
            || self.wrap.is_some()
    }

    fn to_scope_style(&self) -> String {
        self.to_flex_style(true)
            .unwrap_or_else(|| "display:flex;flex-direction:column;".to_owned())
    }

    fn to_single_block_style(&self) -> Option<String> {
        if self.layout.is_none()
            && self.valign.is_none()
            && self.gap.is_none()
            && self.wrap.is_none()
        {
            return self
                .align
                .map(|align| format!("text-align:{}", align.css_text_value()));
        }

        self.has_layout_directives()
            .then(|| self.to_flex_style(true))
            .flatten()
    }

    fn to_flex_style(&self, force_layout: bool) -> Option<String> {
        let layout = self.layout.or(force_layout.then_some(KmarkLayout::Column));
        let mut rules = Vec::new();

        if let Some(layout) = layout {
            rules.push("display:flex".to_owned());
            rules.push(format!("flex-direction:{}", layout.css_direction()));
            if let Some(align) = self.align {
                let property = match layout {
                    KmarkLayout::Row => "justify-content",
                    KmarkLayout::Column => "align-items",
                };
                rules.push(format!("{property}:{}", align.css_flex_value()));
            }
            if let Some(valign) = self.valign {
                match layout {
                    KmarkLayout::Row => {
                        rules.push(format!("align-items:{}", valign.css_cross_axis_value()));
                    }
                    KmarkLayout::Column => {
                        if matches!(valign, KmarkValign::Stretch) {
                            rules.push("align-items:stretch".to_owned());
                        } else {
                            rules.push(format!("justify-content:{}", valign.css_main_axis_value()));
                        }
                    }
                }
            }
            if let Some(wrap) = self.wrap {
                rules.push(format!(
                    "flex-wrap:{}",
                    if wrap { "wrap" } else { "nowrap" },
                ));
            }
        }

        if let Some(gap) = &self.gap {
            rules.push(format!("gap:{gap}"));
        }

        (!rules.is_empty()).then(|| format!("{};", rules.join(";")))
    }
}

impl KmarkLayout {
    fn css_direction(self) -> &'static str {
        match self {
            Self::Row => "row",
            Self::Column => "column",
        }
    }
}

impl KmarkAlign {
    fn css_flex_value(self) -> &'static str {
        match self {
            Self::Left => "flex-start",
            Self::Center => "center",
            Self::Right => "flex-end",
        }
    }

    fn css_text_value(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Center => "center",
            Self::Right => "right",
        }
    }
}

impl KmarkValign {
    fn css_cross_axis_value(self) -> &'static str {
        match self {
            Self::Top => "flex-start",
            Self::Center => "center",
            Self::Bottom => "flex-end",
            Self::Stretch => "stretch",
        }
    }

    fn css_main_axis_value(self) -> &'static str {
        match self {
            Self::Top => "flex-start",
            Self::Center => "center",
            Self::Bottom => "flex-end",
            Self::Stretch => "stretch",
        }
    }
}

impl KmarkBlockEnd {
    fn from_start_tag(tag: &Tag<'_>) -> Option<Self> {
        match tag {
            Tag::Paragraph => Some(Self::Paragraph),
            Tag::Heading { .. } => Some(Self::Heading),
            Tag::BlockQuote(_) => Some(Self::BlockQuote),
            Tag::CodeBlock(_) => Some(Self::CodeBlock),
            Tag::List(_) => Some(Self::List),
            Tag::FootnoteDefinition(_) => Some(Self::FootnoteDefinition),
            Tag::DefinitionList => Some(Self::DefinitionList),
            Tag::Table(_) => Some(Self::Table),
            Tag::MetadataBlock(_) => Some(Self::MetadataBlock),
            Tag::HtmlBlock
            | Tag::Item
            | Tag::DefinitionListTitle
            | Tag::DefinitionListDefinition
            | Tag::TableHead
            | Tag::TableRow
            | Tag::TableCell
            | Tag::Emphasis
            | Tag::Strong
            | Tag::Strikethrough
            | Tag::Superscript
            | Tag::Subscript
            | Tag::Link { .. }
            | Tag::Image { .. } => None,
        }
    }

    fn matches_end(self, tag_end: &TagEnd) -> bool {
        matches!(
            (self, tag_end),
            (Self::Paragraph, TagEnd::Paragraph)
                | (Self::Heading, TagEnd::Heading(_))
                | (Self::BlockQuote, TagEnd::BlockQuote(_))
                | (Self::CodeBlock, TagEnd::CodeBlock)
                | (Self::List, TagEnd::List(_))
                | (Self::FootnoteDefinition, TagEnd::FootnoteDefinition)
                | (Self::DefinitionList, TagEnd::DefinitionList)
                | (Self::Table, TagEnd::Table)
                | (Self::MetadataBlock, TagEnd::MetadataBlock(_))
        )
    }
}

impl CssLength {
    fn new(value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
        }
    }

    pub fn as_str(&self) -> &str {
        &self.value
    }
}

impl PageStyle {
    fn default_a4() -> Self {
        Self {
            width: CssLength::new(DEFAULT_PAGE_WIDTH),
            height: CssLength::new(DEFAULT_PAGE_HEIGHT),
            margin_top: CssLength::new(DEFAULT_PAGE_MARGIN_TOP),
            margin_right: CssLength::new(DEFAULT_PAGE_MARGIN_RIGHT),
            margin_bottom: CssLength::new(DEFAULT_PAGE_MARGIN_BOTTOM),
            margin_left: CssLength::new(DEFAULT_PAGE_MARGIN_LEFT),
        }
    }
}

impl PreviewTextStyle {
    fn default_preview() -> Self {
        Self {
            font_size: CssLength::new(DEFAULT_PREVIEW_FONT_SIZE),
        }
    }
}

impl PageGeometryBasis {
    fn default_a4() -> Self {
        Self {
            page_size: PageSizePreset::A4,
            page_orientation: PageOrientation::Portrait,
            page_width: None,
            page_height: None,
        }
    }

    fn apply(&mut self, directive: &PartialPageDirective) {
        if let Some(page_size) = directive.page_size {
            self.page_size = page_size;
            if directive.page_width.is_none() || directive.page_height.is_none() {
                self.page_width = None;
                self.page_height = None;
            }
        }

        if let Some(page_orientation) = directive.page_orientation {
            self.page_orientation = page_orientation;
        }

        if let (Some(page_width), Some(page_height)) =
            (&directive.page_width, &directive.page_height)
        {
            self.page_width = Some(page_width.clone());
            self.page_height = Some(page_height.clone());
        }
    }

    fn to_page_size(&self) -> (CssLength, CssLength) {
        if let (Some(page_width), Some(page_height)) = (&self.page_width, &self.page_height) {
            return (page_width.clone(), page_height.clone());
        }

        let (portrait_width, portrait_height) = self.page_size.portrait_size();

        match self.page_orientation {
            PageOrientation::Portrait => (portrait_width, portrait_height),
            PageOrientation::Landscape => (portrait_height, portrait_width),
        }
    }
}

impl PageSizePreset {
    fn portrait_size(self) -> (CssLength, CssLength) {
        match self {
            Self::A3 => (CssLength::new("297mm"), CssLength::new("420mm")),
            Self::A4 | Self::Custom => (CssLength::new("210mm"), CssLength::new("297mm")),
            Self::A5 => (CssLength::new("148mm"), CssLength::new("210mm")),
            Self::B4 => (CssLength::new("250mm"), CssLength::new("353mm")),
            Self::B5 => (CssLength::new("176mm"), CssLength::new("250mm")),
            Self::Letter => (CssLength::new("8.5in"), CssLength::new("11in")),
            Self::Legal => (CssLength::new("8.5in"), CssLength::new("14in")),
        }
    }
}

impl PartialPageDirective {
    fn merge(&mut self, other: &Self) {
        if let Some(page_size) = other.page_size {
            self.page_size = Some(page_size);
        }
        if let Some(page_orientation) = other.page_orientation {
            self.page_orientation = Some(page_orientation);
        }
        if let Some(page_width) = &other.page_width {
            self.page_width = Some(page_width.clone());
        }
        if let Some(page_height) = &other.page_height {
            self.page_height = Some(page_height.clone());
        }
        if let Some(page_margin) = &other.page_margin {
            self.page_margin = Some(page_margin.clone());
        }
        if let Some(page_margin_top) = &other.page_margin_top {
            self.page_margin_top = Some(page_margin_top.clone());
        }
        if let Some(page_margin_right) = &other.page_margin_right {
            self.page_margin_right = Some(page_margin_right.clone());
        }
        if let Some(page_margin_bottom) = &other.page_margin_bottom {
            self.page_margin_bottom = Some(page_margin_bottom.clone());
        }
        if let Some(page_margin_left) = &other.page_margin_left {
            self.page_margin_left = Some(page_margin_left.clone());
        }
        if let Some(font_size) = &other.font_size {
            self.font_size = Some(font_size.clone());
        }
    }

    fn has_page_directive(&self) -> bool {
        self.page_size.is_some()
            || self.page_orientation.is_some()
            || self.page_width.is_some()
            || self.page_height.is_some()
            || self.page_margin.is_some()
            || self.page_margin_top.is_some()
            || self.page_margin_right.is_some()
            || self.page_margin_bottom.is_some()
            || self.page_margin_left.is_some()
            || self.font_size.is_some()
    }

    fn has_different_page_style_than(&self, other: &Self) -> bool {
        self.page_size != other.page_size
            || self.page_orientation != other.page_orientation
            || self.page_width != other.page_width
            || self.page_height != other.page_height
            || self.page_margin != other.page_margin
            || self.page_margin_top != other.page_margin_top
            || self.page_margin_right != other.page_margin_right
            || self.page_margin_bottom != other.page_margin_bottom
            || self.page_margin_left != other.page_margin_left
            || self.font_size != other.font_size
    }
}

impl DocumentPageConfig {
    fn default_config() -> Self {
        Self {
            geometry: PageGeometryBasis::default_a4(),
            default_page_style: PageStyle::default_a4(),
            default_text_style: PreviewTextStyle::default_preview(),
        }
    }

    fn resolve_page(&self, page_directive: &PartialPageDirective) -> Self {
        let mut geometry = self.geometry.clone();
        geometry.apply(page_directive);

        let (width, height) = geometry.to_page_size();
        let mut page_style = self.default_page_style.clone();
        page_style.width = width;
        page_style.height = height;

        if let Some(page_margin) = &page_directive.page_margin {
            page_style.margin_top = page_margin.clone();
            page_style.margin_right = page_margin.clone();
            page_style.margin_bottom = page_margin.clone();
            page_style.margin_left = page_margin.clone();
        }
        if let Some(page_margin_top) = &page_directive.page_margin_top {
            page_style.margin_top = page_margin_top.clone();
        }
        if let Some(page_margin_right) = &page_directive.page_margin_right {
            page_style.margin_right = page_margin_right.clone();
        }
        if let Some(page_margin_bottom) = &page_directive.page_margin_bottom {
            page_style.margin_bottom = page_margin_bottom.clone();
        }
        if let Some(page_margin_left) = &page_directive.page_margin_left {
            page_style.margin_left = page_margin_left.clone();
        }

        let mut text_style = self.default_text_style.clone();
        if let Some(font_size) = &page_directive.font_size {
            text_style.font_size = font_size.clone();
        }

        Self {
            geometry,
            default_page_style: page_style,
            default_text_style: text_style,
        }
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

    fn has_image_directives(&self) -> bool {
        self.width.is_some()
            || self.height.is_some()
            || self.fit.is_some()
            || self.position.is_some()
            || self.border_size.is_some()
            || self.border_color.is_some()
            || self.border_style.is_some()
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
        if let Some(border_style) = self
            .border_style
            .as_deref()
            .or_else(|| self.border_size.as_ref().map(|_| "solid"))
        {
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

fn is_pending_kmark_target_event(event: &Event<'static>) -> bool {
    match event {
        Event::Start(Tag::HtmlBlock) | Event::End(TagEnd::HtmlBlock) => true,
        Event::Start(Tag::Image { .. }) => true,
        Event::Start(tag) => KmarkBlockEnd::from_start_tag(tag).is_some(),
        _ => false,
    }
}

fn parse_kmark_page_directive_tokens(input: &str) -> Option<PartialPageDirective> {
    let mut directive = PartialPageDirective::default();

    for token in input.split_whitespace() {
        let Some((key, value)) = token.split_once(':') else {
            continue;
        };

        match key {
            "page_size" => {
                if let Some(page_size) = parse_kmark_page_size_value(value) {
                    directive.page_size = Some(page_size);
                }
            }
            "page_orientation" => {
                if let Some(page_orientation) = parse_kmark_page_orientation_value(value) {
                    directive.page_orientation = Some(page_orientation);
                }
            }
            "page_width" => {
                if let Some(page_width) = parse_kmark_page_length_value(value) {
                    directive.page_width = Some(page_width);
                }
            }
            "page_height" => {
                if let Some(page_height) = parse_kmark_page_length_value(value) {
                    directive.page_height = Some(page_height);
                }
            }
            "page_margin" => {
                if let Some(page_margin) = parse_kmark_page_length_value(value) {
                    directive.page_margin = Some(page_margin);
                }
            }
            "page_margin_top" => {
                if let Some(page_margin_top) = parse_kmark_page_length_value(value) {
                    directive.page_margin_top = Some(page_margin_top);
                }
            }
            "page_margin_right" => {
                if let Some(page_margin_right) = parse_kmark_page_length_value(value) {
                    directive.page_margin_right = Some(page_margin_right);
                }
            }
            "page_margin_bottom" => {
                if let Some(page_margin_bottom) = parse_kmark_page_length_value(value) {
                    directive.page_margin_bottom = Some(page_margin_bottom);
                }
            }
            "page_margin_left" => {
                if let Some(page_margin_left) = parse_kmark_page_length_value(value) {
                    directive.page_margin_left = Some(page_margin_left);
                }
            }
            "font_size" => {
                if let Some(font_size) = parse_kmark_page_length_value(value) {
                    directive.font_size = Some(font_size);
                }
            }
            _ => {}
        }
    }

    directive.has_page_directive().then_some(directive)
}

fn parse_kmark_page_size_value(value: &str) -> Option<PageSizePreset> {
    match value.trim().to_ascii_lowercase().as_str() {
        "a3" => Some(PageSizePreset::A3),
        "a4" => Some(PageSizePreset::A4),
        "a5" => Some(PageSizePreset::A5),
        "b4" => Some(PageSizePreset::B4),
        "b5" => Some(PageSizePreset::B5),
        "letter" => Some(PageSizePreset::Letter),
        "legal" => Some(PageSizePreset::Legal),
        "custom" => Some(PageSizePreset::Custom),
        _ => None,
    }
}

fn parse_kmark_page_orientation_value(value: &str) -> Option<PageOrientation> {
    match value.trim() {
        "portrait" => Some(PageOrientation::Portrait),
        "landscape" => Some(PageOrientation::Landscape),
        _ => None,
    }
}

fn parse_kmark_page_length_value(value: &str) -> Option<CssLength> {
    parse_css_physical_length_value(value).map(CssLength::new)
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

    let (define_name, bundle) = parse_kmark_param_bundle_parts(remainder);

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
    parse_kmark_param_bundle_parts(input).1
}

fn parse_kmark_param_bundle_parts(input: &str) -> (Option<String>, KmarkParamBundle) {
    let mut define_name = None;
    let mut bundle = KmarkParamBundle::default();

    for token in input.split_whitespace() {
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
            "w" => {
                if let Some(width) = parse_kmark_size_value(value) {
                    bundle.params.image.width = Some(width);
                }
            }
            "h" => {
                if let Some(height) = parse_kmark_size_value(value) {
                    bundle.params.image.height = Some(height);
                }
            }
            "fit" => {
                if let Some(fit) = parse_kmark_fit_value(value) {
                    bundle.params.image.fit = Some(fit);
                }
            }
            "pos" => {
                if let Some(position) = parse_kmark_position_value(value) {
                    bundle.params.image.position = Some(position);
                }
            }
            "border_size" => {
                if let Some(border_size) = parse_kmark_border_size_value(value) {
                    bundle.params.image.border_size = Some(border_size);
                }
            }
            "border_color" => {
                if let Some(border_color) = parse_kmark_border_color_value(value) {
                    bundle.params.image.border_color = Some(border_color);
                }
            }
            "border_style" => {
                if let Some(border_style) = parse_kmark_border_style_value(value) {
                    bundle.params.image.border_style = Some(border_style);
                }
            }
            "layout" => {
                if let Some(layout) = parse_kmark_layout_value(value) {
                    bundle.params.layout.layout = Some(layout);
                }
            }
            "align" => {
                if let Some(align) = parse_kmark_align_value(value) {
                    bundle.params.layout.align = Some(align);
                }
            }
            "valign" => {
                if let Some(valign) = parse_kmark_valign_value(value) {
                    bundle.params.layout.valign = Some(valign);
                }
            }
            "gap" => {
                if let Some(gap) = parse_kmark_gap_value(value) {
                    bundle.params.layout.gap = Some(gap);
                }
            }
            "wrap" => {
                if let Some(wrap) = parse_kmark_wrap_value(value) {
                    bundle.params.layout.wrap = Some(wrap);
                }
            }
            _ => {}
        }
    }

    (define_name, bundle)
}

fn parse_kmark_layout_value(value: &str) -> Option<KmarkLayout> {
    match value.trim() {
        "row" => Some(KmarkLayout::Row),
        "column" => Some(KmarkLayout::Column),
        _ => None,
    }
}

fn parse_kmark_align_value(value: &str) -> Option<KmarkAlign> {
    match value.trim() {
        "left" => Some(KmarkAlign::Left),
        "center" => Some(KmarkAlign::Center),
        "right" => Some(KmarkAlign::Right),
        _ => None,
    }
}

fn parse_kmark_valign_value(value: &str) -> Option<KmarkValign> {
    match value.trim() {
        "top" => Some(KmarkValign::Top),
        "center" => Some(KmarkValign::Center),
        "bottom" => Some(KmarkValign::Bottom),
        "stretch" => Some(KmarkValign::Stretch),
        _ => None,
    }
}

fn parse_kmark_gap_value(value: &str) -> Option<String> {
    parse_css_length_value(value, false)
}

fn parse_kmark_wrap_value(value: &str) -> Option<bool> {
    match value.trim() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
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

    matches!(
        unit,
        "px" | "%" | "em" | "rem" | "vw" | "vh" | "vmin" | "vmax"
    )
    .then(|| trimmed.to_owned())
}

fn parse_css_physical_length_value(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let numeric_end = trimmed
        .find(|character: char| !character.is_ascii_digit() && character != '.')
        .unwrap_or(trimmed.len());

    if numeric_end == 0 || numeric_end == trimmed.len() {
        return None;
    }

    let number = &trimmed[..numeric_end];
    let unit = &trimmed[numeric_end..];
    let numeric_value = number.parse::<f64>().ok()?;

    if numeric_value < 0.0 {
        return None;
    }

    matches!(unit, "px" | "mm" | "cm" | "in" | "pt" | "pc").then(|| trimmed.to_owned())
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
    matches!(
        value.trim(),
        "solid" | "dashed" | "dotted" | "double" | "none"
    )
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

    if is_data_url(normalized_url) || is_file_url(normalized_url) || is_remote_url(normalized_url) {
        return Some(normalized_url.to_owned());
    }

    if is_windows_absolute_path(normalized_url) || Path::new(normalized_url).is_absolute() {
        return Some(file_path_to_url(&resolve_existing_path_string(
            normalized_url,
        )));
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

    Some((
        format!("//{server}/{share}"),
        segments.collect::<Vec<_>>().join("/"),
    ))
}

fn is_windows_drive_root(path: &str) -> bool {
    let bytes = path.as_bytes();

    bytes.len() == 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/'
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
    let prefix_end = url.find(['/', '?', '#']).unwrap_or(url.len());

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
    fn ignores_page_break_markers_outside_first_column_standalone_line() {
        let rendered_preview = render_markdown_preview(
            "text <!-- --- --> text\n- <!-- --- -->\n  <!-- --- -->\n> <!-- --- -->\n`<!-- --- -->`\n<!-- --- --> text\nlast",
        );

        assert_eq!(rendered_preview.page_htmls.len(), 1);
        assert!(rendered_preview.html.contains("text"));
        assert!(rendered_preview.html.contains("last"));
    }

    #[test]
    fn ignores_page_break_markers_inside_fenced_code_blocks() {
        let rendered_preview = render_markdown_preview("before\n```html\n<!-- --- -->\n```\nafter");

        assert_eq!(rendered_preview.page_htmls.len(), 1);
        assert!(rendered_preview.html.contains("&lt;!-- --- --&gt;"));
    }

    #[test]
    fn accepts_first_column_standalone_page_break_with_trailing_space() {
        let rendered_preview = render_markdown_preview("before\n<!-- --- -->   \nafter");

        assert_eq!(rendered_preview.page_htmls.len(), 2);
        assert_eq!(
            rendered_preview.page_htmls[0],
            "<p data-source-line-start=\"0\" data-source-line-end=\"0\">before</p>"
        );
        assert_eq!(
            rendered_preview.page_htmls[1],
            "<p data-source-line-start=\"2\" data-source-line-end=\"2\">after</p>"
        );
    }

    #[test]
    fn applies_unclosed_scope_page_settings_and_nested_overrides() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_size:A4 page_orientation:portrait page_margin:12mm font_size:11pt -->\n\
             # 1\n\
             <!-- --- -->\n\
             <!-- kmark { page_orientation:landscape font_size:9pt page_margin:8mm -->\n\
             # 2\n\
             <!-- kmark } -->\n\
             # 3",
        );

        assert_eq!(rendered_preview.pages.len(), 3);
        assert_eq!(rendered_preview.default_page_style.width.as_str(), "210mm");
        assert_eq!(rendered_preview.default_page_style.height.as_str(), "297mm");
        assert_eq!(
            rendered_preview.default_page_style.margin_top.as_str(),
            "16mm"
        );
        assert_eq!(
            rendered_preview.default_text_style.font_size.as_str(),
            "10.5pt"
        );
        assert_eq!(rendered_preview.pages[0].page_style.width.as_str(), "210mm");
        assert_eq!(
            rendered_preview.pages[0].page_style.height.as_str(),
            "297mm"
        );
        assert_eq!(
            rendered_preview.pages[0].text_style.font_size.as_str(),
            "11pt"
        );
        assert_eq!(rendered_preview.pages[1].page_style.width.as_str(), "297mm");
        assert_eq!(
            rendered_preview.pages[1].page_style.height.as_str(),
            "210mm"
        );
        assert_eq!(
            rendered_preview.pages[1].page_style.margin_left.as_str(),
            "8mm"
        );
        assert_eq!(
            rendered_preview.pages[1].text_style.font_size.as_str(),
            "9pt"
        );
        assert_eq!(rendered_preview.pages[2].page_style.width.as_str(), "210mm");
        assert_eq!(
            rendered_preview.pages[2].page_style.height.as_str(),
            "297mm"
        );
        assert_eq!(
            rendered_preview.pages[2].text_style.font_size.as_str(),
            "11pt"
        );
    }

    #[test]
    fn keeps_scope_page_directives_out_of_block_decoration_route() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_width:297mm page_height:210mm page_margin:8mm font_size:10pt -->\n\
             ![](image.png)\n\
             <!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" /></p>"
        );
        assert_eq!(rendered_preview.pages[0].page_style.width.as_str(), "297mm");
        assert_eq!(
            rendered_preview.pages[0].page_style.height.as_str(),
            "210mm"
        );
        assert_eq!(
            rendered_preview.pages[0].text_style.font_size.as_str(),
            "10pt"
        );
    }

    #[test]
    fn lets_individual_page_margins_override_common_page_margin() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_margin:10mm page_margin_left:4mm page_margin_bottom:6mm -->\n\
             text\n\
             <!-- kmark } -->",
        );

        let page_style = &rendered_preview.pages[0].page_style;
        assert_eq!(page_style.margin_top.as_str(), "10mm");
        assert_eq!(page_style.margin_right.as_str(), "10mm");
        assert_eq!(page_style.margin_bottom.as_str(), "6mm");
        assert_eq!(page_style.margin_left.as_str(), "4mm");
    }

    #[test]
    fn splits_pages_when_scope_page_style_starts_and_ends() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_size:A4 page_orientation:portrait font_size:11pt -->\n\
             # Normal\n\
             <!-- kmark { page_orientation:landscape font_size:9pt align:center -->\n\
             # Wide\n\
             <!-- kmark } -->\n\
             # Back",
        );

        assert_eq!(rendered_preview.pages.len(), 3);
        assert_eq!(rendered_preview.pages[0].page_style.width.as_str(), "210mm");
        assert_eq!(rendered_preview.pages[1].page_style.width.as_str(), "297mm");
        assert_eq!(
            rendered_preview.pages[1].page_style.height.as_str(),
            "210mm"
        );
        assert_eq!(
            rendered_preview.pages[1].text_style.font_size.as_str(),
            "9pt"
        );
        assert!(rendered_preview.pages[1]
            .html
            .contains("align-items:center"));
        assert_eq!(rendered_preview.pages[2].page_style.width.as_str(), "210mm");
        assert_eq!(
            rendered_preview.pages[2].text_style.font_size.as_str(),
            "11pt"
        );
    }

    #[test]
    fn keeps_scope_page_style_and_block_decoration_across_explicit_page_break() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_orientation:landscape font_size:9pt align:center -->\n\
             # Wide 1\n\
             <!-- --- -->\n\
             # Wide 2\n\
             <!-- kmark } -->",
        );

        assert_eq!(rendered_preview.pages.len(), 2);
        for page in &rendered_preview.pages {
            assert_eq!(page.page_style.width.as_str(), "297mm");
            assert_eq!(page.page_style.height.as_str(), "210mm");
            assert_eq!(page.text_style.font_size.as_str(), "9pt");
            assert!(page.html.contains("align-items:center"));
        }
    }

    #[test]
    fn ignores_legacy_page_scope_comments_as_page_settings() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_scope:page page_width:297mm page_height:210mm font_size:10pt -->\n\
             # Legacy",
        );

        assert_eq!(rendered_preview.pages.len(), 1);
        assert_eq!(rendered_preview.pages[0].page_style.width.as_str(), "210mm");
        assert_eq!(
            rendered_preview.pages[0].page_style.height.as_str(),
            "297mm"
        );
        assert_eq!(
            rendered_preview.pages[0].text_style.font_size.as_str(),
            "10.5pt"
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
        let rendered_preview = render_markdown_preview(
            "| Left | Center | Right |\n| :--- | :----: | ----: |\n| *a* | **b** | ~~c~~ |",
        );

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
        let rendered_preview =
            render_markdown_preview("Note[^alpha].\n\n[^alpha]: Footnote *value*");

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
        fs::create_dir_all(image_file_path.parent().unwrap())
            .expect("failed to create image directory");
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
                "<p data-source-line-start=\"0\" data-source-line-end=\"0\"><img src=\"{}\" alt=\"plot\" data-source-line-start=\"0\" data-source-line-end=\"0\" /></p>",
                resolved_image_url,
            )
        );
    }

    #[test]
    fn allows_data_urls_for_markdown_images() {
        let rendered_preview = render_markdown_preview(
            "![badge](data:image/svg+xml,%3Csvg%20viewBox='0%200%201%201'%3E)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"0\" data-source-line-end=\"0\"><img src=\"data:image/svg+xml,%3Csvg%20viewBox=&#39;0%200%201%201&#39;%3E\" alt=\"badge\" data-source-line-start=\"0\" data-source-line-end=\"0\" /></p>"
        );
    }

    #[test]
    fn applies_kmark_single_image_size_comment() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark w:200 h:100 -->\n![](image.png)");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"width:200px;height:100px;\" /></p>"
        );
    }

    #[test]
    fn preserves_alt_text_when_kmark_comment_applies() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark w:200 -->\n![基板写真](board.png)");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\"><img src=\"board.png\" alt=\"基板写真\" data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"width:200px;\" /></p>"
        );
    }

    #[test]
    fn merges_consecutive_kmark_comments_with_last_write_wins() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:200 -->\n<!-- kmark h:100 -->\n<!-- kmark w:300 -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"3\" data-source-line-end=\"3\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"3\" data-source-line-end=\"3\" style=\"width:300px;height:100px;\" /></p>"
        );
    }

    #[test]
    fn ignores_kmark_single_comment_when_blank_line_exists_before_image() {
        let rendered_preview = render_markdown_preview("<!-- kmark w:200 -->\n\n![](image.png)");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"2\" data-source-line-end=\"2\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"2\" data-source-line-end=\"2\" /></p>"
        );
    }

    #[test]
    fn applies_kmark_scope_to_all_images_in_scope() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { w:200 h:100 -->\n\n![](a.png)\n\n![](b.png)\n\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-scope\" style=\"display:flex;flex-direction:column;\"><p data-source-line-start=\"2\" data-source-line-end=\"2\" style=\"display:contents\"><img src=\"a.png\" alt=\"\" data-source-line-start=\"2\" data-source-line-end=\"2\" style=\"width:200px;height:100px;\" /></p><p data-source-line-start=\"4\" data-source-line-end=\"4\" style=\"display:contents\"><img src=\"b.png\" alt=\"\" data-source-line-start=\"4\" data-source-line-end=\"4\" style=\"width:200px;height:100px;\" /></p></div>"
        );
    }

    #[test]
    fn lets_single_kmark_override_active_scope() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { w:200 h:100 -->\n\n![](a.png)\n\n<!-- kmark h:300 -->\n![](b.png)\n\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-scope\" style=\"display:flex;flex-direction:column;\"><p data-source-line-start=\"2\" data-source-line-end=\"2\" style=\"display:contents\"><img src=\"a.png\" alt=\"\" data-source-line-start=\"2\" data-source-line-end=\"2\" style=\"width:200px;height:100px;\" /></p><p data-source-line-start=\"5\" data-source-line-end=\"5\" style=\"display:contents\"><img src=\"b.png\" alt=\"\" data-source-line-start=\"5\" data-source-line-end=\"5\" style=\"width:200px;height:300px;\" /></p></div>"
        );
    }

    #[test]
    fn applies_defined_kmark_preset_to_image_use_comment() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark define:thumb w:200 h:100 fit:cover -->\n\n<!-- kmark use:thumb -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"3\" data-source-line-end=\"3\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"3\" data-source-line-end=\"3\" style=\"width:200px;height:100px;object-fit:cover;\" /></p>"
        );
    }

    #[test]
    fn supports_separated_kmark_preset_definition_and_scope_usage() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:200 -->\n<!-- kmark h:100 -->\n<!-- kmark fit:cover -->\n<!-- kmark define:thumb -->\n\n<!-- kmark { use:thumb w:300 -->\n![](a.png)\n<!-- kmark h:240 -->\n![](b.png)\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-scope\" style=\"display:flex;flex-direction:column;\"><p data-source-line-start=\"6\" data-source-line-end=\"6\" style=\"display:contents\"><img src=\"a.png\" alt=\"\" data-source-line-start=\"6\" data-source-line-end=\"6\" style=\"width:300px;height:100px;object-fit:cover;\" /></p><p data-source-line-start=\"8\" data-source-line-end=\"8\" style=\"display:contents\"><img src=\"b.png\" alt=\"\" data-source-line-start=\"8\" data-source-line-end=\"8\" style=\"width:300px;height:240px;object-fit:cover;\" /></p></div>"
        );
    }

    #[test]
    fn renders_kmark_scope_layout_styles() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { layout:row gap:16 align:center valign:top wrap:true w:200 fit:cover -->\n\n![](a.png)\n![](b.png)\n\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-scope\" style=\"display:flex;flex-direction:row;justify-content:center;align-items:flex-start;flex-wrap:wrap;gap:16px;\"><p data-source-line-start=\"2\" data-source-line-end=\"3\" style=\"display:contents\"><img src=\"a.png\" alt=\"\" data-source-line-start=\"2\" data-source-line-end=\"2\" style=\"width:200px;object-fit:cover;\" /><img src=\"b.png\" alt=\"\" data-source-line-start=\"3\" data-source-line-end=\"3\" style=\"width:200px;object-fit:cover;\" /></p></div>"
        );
    }

    #[test]
    fn renders_nested_kmark_scopes_with_scope_precedence() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { layout:row gap:24 w:200 h:100 -->\n\n<!-- kmark { layout:column gap:8 w:300 -->\n![](a.png)\n<!-- kmark } -->\n\n![](b.png)\n\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-scope\" style=\"display:flex;flex-direction:row;gap:24px;\"><div class=\"kmark-scope\" style=\"display:flex;flex-direction:column;gap:8px;\"><p data-source-line-start=\"3\" data-source-line-end=\"3\" style=\"display:contents\"><img src=\"a.png\" alt=\"\" data-source-line-start=\"3\" data-source-line-end=\"3\" style=\"width:300px;height:100px;\" /></p></div><p data-source-line-start=\"6\" data-source-line-end=\"6\" style=\"display:contents\"><img src=\"b.png\" alt=\"\" data-source-line-start=\"6\" data-source-line-end=\"6\" style=\"width:200px;height:100px;\" /></p></div>"
        );
    }

    #[test]
    fn applies_single_block_alignment_comment_without_wrapper() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark align:right w:300 -->\n![](image.png)");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"text-align:right\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"width:300px;\" /></p>"
        );
    }

    #[test]
    fn applies_single_align_to_text_paragraph_without_extra_wrapper_gap() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark align:right -->\ntext1\ntext2\ntext3\ntext4\n\ntext5",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"4\" style=\"text-align:right\">text1<br />\ntext2<br />\ntext3<br />\ntext4</p><p data-source-line-start=\"6\" data-source-line-end=\"6\">text5</p>"
        );
    }

    #[test]
    fn applies_single_layout_to_target_block_without_wrapper() {
        let rendered_preview = render_markdown_preview("<!-- kmark layout:row gap:8 -->\n- A\n- B");

        assert_eq!(
            rendered_preview.html,
            "<ul style=\"display:flex;flex-direction:row;gap:8px;\"><li data-source-line-start=\"1\" data-source-line-end=\"1\">A</li><li data-source-line-start=\"2\" data-source-line-end=\"2\">B</li></ul>"
        );
    }

    #[test]
    fn closes_unclosed_kmark_scope_at_end_of_document() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark { layout:row gap:1rem -->\n![](image.png)");

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-scope\" style=\"display:flex;flex-direction:row;gap:1rem;\"><p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"display:contents\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" /></p></div>"
        );
    }

    #[test]
    fn keeps_kmark_presets_lower_priority_than_scope_direct_params() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark define:thumb w:200 h:100 -->\n\n<!-- kmark { w:300 -->\n\n<!-- kmark { use:thumb -->\n![](image.png)\n<!-- kmark } -->\n\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-scope\" style=\"display:flex;flex-direction:column;\"><div class=\"kmark-scope\" style=\"display:flex;flex-direction:column;\"><p data-source-line-start=\"5\" data-source-line-end=\"5\" style=\"display:contents\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"5\" data-source-line-end=\"5\" style=\"width:300px;height:100px;\" /></p></div></div>"
        );
    }

    #[test]
    fn ignores_unknown_kmark_keys_invalid_values_and_unmatched_scope_end() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark } -->\n<!-- kmark unknown:abc style:width:999px onclick:alert(1) w:200 w:abc fit:cover fit:bad border_size:2 border_color:url(javascript:alert(1)) -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"2\" data-source-line-end=\"2\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"2\" data-source-line-end=\"2\" style=\"width:200px;object-fit:cover;border-width:2px;border-style:solid;\" /></p>"
        );
    }

    #[test]
    fn ignores_undefined_kmark_preset_use() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark use:not_found -->\n![](image.png)");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" /></p>"
        );
    }

    #[test]
    fn resolves_relative_images_against_windows_style_markdown_path() {
        let resolved_image_url =
            resolve_image_destination_url("image.png", Some("C:\\workspace\\docs\\notes.md"))
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
