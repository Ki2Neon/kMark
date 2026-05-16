use std::{
    collections::{HashMap, HashSet},
    ops::Range,
    path::Path,
};

use pulldown_cmark::{
    Alignment, CodeBlockKind, Event, HeadingLevel, LinkType, MetadataBlockKind, Options, Parser,
    Tag, TagEnd,
};

use crate::table_format::{has_table_delimiter_pipe, split_table_cells};

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
    pub page_number_config: PageNumberConfig,
    pub page_chrome_config: PageChromeConfig,
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
    pub font_family: String,
    pub heading_font_family: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageNumberConfig {
    pub position: PageNumberPosition,
    pub format: String,
    pub start: u32,
    pub reset: bool,
    pub count: bool,
    pub visible: bool,
    pub style: PageNumberStyle,
    pub font_size: CssLength,
    pub color: String,
    pub margin_top: CssLength,
    pub margin_bottom: CssLength,
    pub margin_left: CssLength,
    pub margin_right: CssLength,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageChromeConfig {
    pub header: PageChromeRegionConfig,
    pub footer: PageChromeRegionConfig,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageChromeRegionConfig {
    pub enabled: bool,
    pub left: Option<String>,
    pub center: Option<String>,
    pub right: Option<String>,
    pub opacity: String,
    pub offset: Option<CssLength>,
    pub border_size: Option<String>,
    pub border_color: Option<String>,
    pub border_style: Option<String>,
    pub font_size: Option<String>,
    pub font_family: Option<String>,
    pub font_color: Option<String>,
    pub padding: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageNumberPosition {
    None,
    TopLeft,
    TopCenter,
    TopRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageNumberStyle {
    Decimal,
    LowerRoman,
    UpperRoman,
    LowerAlpha,
    UpperAlpha,
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
    block_decoration: KmarkRootDecoration,
    image_paragraph_decoration: KmarkRootDecoration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CalloutKind {
    Note,
    Tip,
    Important,
    Warning,
    Caution,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CalloutStart {
    kind: CalloutKind,
    title: String,
    marker_line_end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum CalloutMarkerParagraphState {
    Pending,
    Delayed {
        open_tag: String,
        source_line_end: usize,
    },
    Open,
    Done,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActiveCalloutContext {
    marker_line_end: usize,
    marker_paragraph: CalloutMarkerParagraphState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActiveMermaidBlock {
    index: usize,
    source: String,
    source_line_start: usize,
    source_line_end: usize,
    decoration: KmarkRootDecoration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BlockQuoteRenderKind {
    Normal,
    Callout,
}

type OwnedEvent = (Event<'static>, Range<usize>);

struct HtmlRenderOutput {
    html: String,
    next_mermaid_block_index: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkImageParams {
    width: Option<KmarkSizeValue>,
    height: Option<KmarkSizeValue>,
    position: Option<String>,
    border_size: Option<String>,
    border_color: Option<String>,
    border_style: Option<String>,
    radius: Option<String>,
    background: Option<String>,
    opacity: Option<String>,
    rotate: Option<String>,
    shadow: Option<String>,
    margin: Option<String>,
    padding: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum KmarkSizeValue {
    Length(String),
    Fit,
    PageFit,
    PageFitContain,
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
struct KmarkTextParams {
    color: Option<String>,
    font_size: Option<String>,
    font_weight: Option<String>,
    font_family: Option<String>,
    font_style: Option<String>,
    letter_spacing: Option<String>,
    line_height: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkTableParams {
    cell_padding_x: Option<String>,
    cell_padding_y: Option<String>,
    fit: Option<KmarkTableFit>,
    layout: Option<KmarkTableLayout>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkPageParams {
    valign: Option<KmarkPageValign>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkTocParams {
    enabled: Option<bool>,
    max_depth: Option<u8>,
    min_depth: Option<u8>,
    title: Option<String>,
    ordered: Option<bool>,
    links: Option<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkHeadingNumberParams {
    enabled: Option<bool>,
    from: Option<u8>,
    depth: Option<u8>,
    pattern: Option<KmarkHeadingNumberPattern>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KmarkHeadingNumberPattern {
    Dot,
    DotTrailing,
    Hyphen,
    Chapter,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkParams {
    image: KmarkImageParams,
    layout: KmarkLayoutParams,
    text: KmarkTextParams,
    table: KmarkTableParams,
    page: KmarkPageParams,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkParamBundle {
    preset_use: Option<String>,
    params: KmarkParams,
    toc: KmarkTocParams,
    heading_number: KmarkHeadingNumberParams,
    page_directive: PartialPageDirective,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkParamLayer {
    preset: KmarkParams,
    direct: KmarkParams,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct KmarkScopeContext {
    layer: Option<KmarkParamLayer>,
    renders_wrapper: bool,
}

#[derive(Debug, Clone)]
struct PendingKmarkParams {
    bundle: KmarkParamBundle,
    start_line: usize,
    end_offset: usize,
    end_line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActiveKmarkSingleBlock {
    layer: KmarkParamLayer,
    end: KmarkBlockEnd,
    nested_same_kind_count: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkRootDecoration {
    style: Option<String>,
    page_valign: Option<KmarkPageValign>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkParagraphDecorations {
    block: KmarkRootDecoration,
    image_paragraph: KmarkRootDecoration,
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
enum KmarkPageValign {
    Top,
    Center,
    Bottom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KmarkTableFit {
    Auto,
    Off,
    Shrink,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KmarkTableLayout {
    Auto,
    Fixed,
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
    page_font_size: Option<CssLength>,
    page_font_family: Option<String>,
    page_heading_font_family: Option<String>,
    page_number_position: Option<PageNumberPosition>,
    page_number_display: Option<bool>,
    page_number_format: Option<String>,
    page_number_start: Option<u32>,
    page_number_reset: Option<bool>,
    page_number_count: Option<bool>,
    page_number_visible: Option<bool>,
    page_number_style: Option<PageNumberStyle>,
    page_number_font_size: Option<CssLength>,
    page_number_color: Option<String>,
    page_number_margin_top: Option<CssLength>,
    page_number_margin_bottom: Option<CssLength>,
    page_number_margin_left: Option<CssLength>,
    page_number_margin_right: Option<CssLength>,
    page_header: PartialPageChromeRegionDirective,
    page_footer: PartialPageChromeRegionDirective,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct PartialPageChromeRegionDirective {
    enabled: Option<bool>,
    left: Option<String>,
    center: Option<String>,
    right: Option<String>,
    opacity: Option<String>,
    offset: Option<CssLength>,
    border_size: Option<String>,
    border_color: Option<String>,
    border_style: Option<String>,
    font_size: Option<String>,
    font_family: Option<String>,
    font_color: Option<String>,
    padding: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActiveKmarkScopeLine {
    lines: Vec<String>,
    end_offset: usize,
    page_directive: PartialPageDirective,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActiveKmarkPageDirectiveLine {
    end_offset: usize,
    scope_depth: usize,
    page_directive: PartialPageDirective,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PendingKmarkScopePrelude {
    lines: Vec<String>,
    page_directive: PartialPageDirective,
    start_offset: usize,
    end_offset: usize,
    start_line: usize,
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
    page_number_config: PageNumberConfig,
    page_chrome_config: PageChromeConfig,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct KmarkTocDocument {
    headings: Vec<KmarkTocHeading>,
    generated_heading_ids: HashMap<usize, String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct KmarkHeadingNumberDocument {
    text_by_source_line: HashMap<usize, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct KmarkTocHeading {
    source_line: usize,
    level: u8,
    text: String,
    explicit_id: Option<String>,
    generated_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct KmarkTocConfig {
    min_depth: u8,
    max_depth: u8,
    ordered: bool,
    links: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct KmarkTocRenderNode<'a> {
    heading: &'a KmarkTocHeading,
    children: Vec<KmarkTocRenderNode<'a>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct KmarkTocDirective {
    source_line: usize,
    params: KmarkTocParams,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct KmarkHeadingNumberConfig {
    enabled: bool,
    from: u8,
    depth: u8,
    pattern: KmarkHeadingNumberPattern,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PendingKmarkTocHeading {
    source_line: usize,
    level: u8,
    explicit_id: Option<String>,
    text: String,
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
    toc_document: &'a KmarkTocDocument,
    heading_number_document: &'a KmarkHeadingNumberDocument,
    line_starts: Vec<usize>,
    html: String,
    blockquote_stack: Vec<BlockQuoteRenderKind>,
    callout_stack: Vec<ActiveCalloutContext>,
    image_stack: Vec<ImageContext>,
    suppressed_link_depth: usize,
    suppressed_html_text_depth: usize,
    table_section: TableSection,
    table_alignments: Vec<Alignment>,
    table_cell_index: usize,
    table_body_open: bool,
    table_html_start: Option<usize>,
    table_source_start: Option<usize>,
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
    pending_kmark_image_paragraph_style: Option<String>,
    pending_kmark_page_valign: Option<KmarkPageValign>,
    pending_kmark_table_fit: Option<KmarkTableFit>,
    active_mermaid_block: Option<ActiveMermaidBlock>,
    next_mermaid_block_index: usize,
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
const DEFAULT_PREVIEW_FONT_FAMILY: &str = "BIZ UDPGothic";
const DEFAULT_TOC_TITLE: &str = "目次";
const HEADING_NUMBER_MAX_LEVEL: u8 = 6;

pub fn render_markdown_preview(content: &str) -> RenderedMarkdownPreview {
    render_markdown_preview_with_file_path(content, None)
}

pub fn render_markdown_preview_with_file_path(
    content: &str,
    markdown_file_path: Option<&str>,
) -> RenderedMarkdownPreview {
    let toc_document = collect_kmark_toc_document(content);
    let heading_number_document = collect_kmark_heading_number_document(content);
    let markdown_pages = split_markdown_pages(content);
    let document_page_config = DocumentPageConfig::default_config();
    let mut next_mermaid_block_index = 1usize;
    let pages = markdown_pages
        .segments
        .iter()
        .map(|page_segment| {
            let page_config = document_page_config.resolve_page(&page_segment.page_directive);
            let rendered_page = render_markdown_page(
                &page_segment.content,
                page_segment.line_offset,
                markdown_file_path,
                &toc_document,
                &heading_number_document,
                next_mermaid_block_index,
            );
            next_mermaid_block_index = rendered_page.next_mermaid_block_index;

            RenderedPage {
                html: rendered_page.html,
                page_style: page_config.default_page_style,
                text_style: page_config.default_text_style,
                page_number_config: page_config.page_number_config,
                page_chrome_config: page_config.page_chrome_config,
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
    toc_document: &KmarkTocDocument,
    heading_number_document: &KmarkHeadingNumberDocument,
    next_mermaid_block_index: usize,
) -> HtmlRenderOutput {
    let events = collect_markdown_events(content);
    let mut emitter = HtmlEmitter::new(
        content,
        line_offset,
        markdown_file_path,
        toc_document,
        heading_number_document,
        next_mermaid_block_index,
    );
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
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);
    options
}

fn collect_kmark_toc_document(content: &str) -> KmarkTocDocument {
    let events = collect_markdown_events(content);
    let line_starts = collect_line_starts(content);
    let mut headings = Vec::new();
    let mut directives = Vec::new();
    let mut pending_heading: Option<PendingKmarkTocHeading> = None;

    for (event, range) in events {
        match event {
            Event::Start(Tag::Heading { level, id, .. }) => {
                pending_heading = Some(PendingKmarkTocHeading {
                    source_line: resolve_line_number(&line_starts, range.start),
                    level: heading_level_number(level),
                    explicit_id: id.map(|value| value.to_string()),
                    text: String::new(),
                });
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some(pending) = pending_heading.take() {
                    let text = normalize_toc_heading_text(&pending.text);

                    if !text.is_empty() {
                        headings.push(KmarkTocHeading {
                            source_line: pending.source_line,
                            level: pending.level,
                            text,
                            explicit_id: pending.explicit_id,
                            generated_id: None,
                        });
                    }
                }
            }
            Event::Text(text) => {
                if let Some(pending) = pending_heading.as_mut() {
                    push_text_as_toc_heading_text(&mut pending.text, text.as_ref());
                }
            }
            Event::Code(text) | Event::InlineMath(text) | Event::DisplayMath(text) => {
                if let Some(pending) = pending_heading.as_mut() {
                    pending.text.push_str(text.as_ref());
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some(pending) = pending_heading.as_mut() {
                    pending.text.push(' ');
                }
            }
            Event::Html(html) | Event::InlineHtml(html) => {
                if is_html_line_break(html.as_ref()) {
                    if let Some(pending) = pending_heading.as_mut() {
                        pending.text.push(' ');
                    }
                    continue;
                }

                if let Some(KmarkComment::Params(bundle)) = parse_kmark_comment(html.as_ref()) {
                    if bundle.toc.enabled == Some(true) {
                        let (_, end_line) =
                            resolve_source_line_range(content, &line_starts, 0, &range);
                        directives.push(KmarkTocDirective {
                            source_line: end_line,
                            params: bundle.toc,
                        });
                    }
                }
            }
            _ => {}
        }
    }

    apply_generated_toc_heading_ids(&mut headings, &directives);
    let generated_heading_ids = headings
        .iter()
        .filter_map(|heading| {
            heading
                .generated_id
                .as_ref()
                .map(|id| (heading.source_line, id.clone()))
        })
        .collect();

    KmarkTocDocument {
        headings,
        generated_heading_ids,
    }
}

fn collect_kmark_heading_number_document(content: &str) -> KmarkHeadingNumberDocument {
    let events = collect_markdown_events(content);
    let line_starts = collect_line_starts(content);
    let mut text_by_source_line = HashMap::new();
    let mut scope_stack = Vec::new();
    let mut pending_kmark_params: Option<PendingKmarkParams> = None;
    let mut counters = [0u32; HEADING_NUMBER_MAX_LEVEL as usize];

    for (event, range) in events {
        if let Event::Html(html) | Event::InlineHtml(html) = &event {
            if let Some(comment) = parse_kmark_comment(html.as_ref()) {
                apply_kmark_heading_number_comment(
                    comment,
                    range.clone(),
                    content,
                    &line_starts,
                    &mut pending_kmark_params,
                    &mut scope_stack,
                );
                continue;
            }

            pending_kmark_params = None;
        }

        if let Event::Start(Tag::Heading { level, .. }) = event {
            pending_kmark_params = None;
            let source_line = resolve_line_number(&line_starts, range.start);
            let level = heading_level_number(level);

            if let Some(text) = next_kmark_heading_number_text(&scope_stack, &mut counters, level) {
                text_by_source_line.insert(source_line, text);
            }
        } else if is_pending_heading_number_break_event(&event) {
            pending_kmark_params = None;
        }
    }

    KmarkHeadingNumberDocument {
        text_by_source_line,
    }
}

fn apply_kmark_heading_number_comment(
    comment: KmarkComment,
    range: Range<usize>,
    content: &str,
    line_starts: &[usize],
    pending_kmark_params: &mut Option<PendingKmarkParams>,
    scope_stack: &mut Vec<KmarkHeadingNumberParams>,
) {
    discard_pending_kmark_params_if_gap_is_incompatible_for_heading_numbers(
        pending_kmark_params,
        content,
        line_starts,
        range.start,
    );

    match comment {
        KmarkComment::Params(bundle) => {
            let (start_line, end_line) = resolve_source_line_range(content, line_starts, 0, &range);

            if let Some(pending) = pending_kmark_params.as_mut() {
                pending.bundle.merge(&bundle);
                pending.end_offset = range.end;
                pending.end_line = end_line;
            } else {
                *pending_kmark_params = Some(PendingKmarkParams {
                    bundle,
                    start_line,
                    end_offset: range.end,
                    end_line,
                });
            }
        }
        KmarkComment::Define { .. } => {
            *pending_kmark_params = None;
        }
        KmarkComment::ScopeStart(bundle) => {
            let mut final_bundle = pending_kmark_params
                .take()
                .map(|pending| pending.bundle)
                .unwrap_or_default();
            final_bundle.merge(&bundle);
            scope_stack.push(final_bundle.heading_number);
        }
        KmarkComment::ScopeEnd => {
            *pending_kmark_params = None;
            scope_stack.pop();
        }
    }
}

fn discard_pending_kmark_params_if_gap_is_incompatible_for_heading_numbers(
    pending_kmark_params: &mut Option<PendingKmarkParams>,
    content: &str,
    line_starts: &[usize],
    next_offset: usize,
) {
    let Some(pending) = pending_kmark_params.as_ref() else {
        return;
    };

    let next_start_line = resolve_line_number(line_starts, next_offset);

    if next_start_line > pending.end_line + 1 {
        *pending_kmark_params = None;
        return;
    }

    if next_offset < pending.end_offset {
        return;
    }

    let gap = &content[pending.end_offset..next_offset];

    if !gap.chars().all(char::is_whitespace) || contains_blank_line(gap) {
        *pending_kmark_params = None;
    }
}

fn is_pending_heading_number_break_event(event: &Event<'static>) -> bool {
    match event {
        Event::Start(Tag::HtmlBlock) | Event::End(TagEnd::HtmlBlock) => false,
        Event::Start(tag) => KmarkBlockEnd::from_start_tag(tag).is_some(),
        Event::Rule => true,
        _ => false,
    }
}

fn next_kmark_heading_number_text(
    scope_stack: &[KmarkHeadingNumberParams],
    counters: &mut [u32; HEADING_NUMBER_MAX_LEVEL as usize],
    level: u8,
) -> Option<String> {
    let config = resolve_active_heading_number_config(scope_stack);

    if !config.enabled {
        return None;
    }

    let max_level = config
        .from
        .saturating_add(config.depth)
        .saturating_sub(1)
        .min(HEADING_NUMBER_MAX_LEVEL);

    if level < config.from || level > max_level {
        return None;
    }

    let from_index = usize::from(config.from - 1);
    let level_index = usize::from(level - 1);

    for counter in &mut counters[from_index..level_index] {
        if *counter == 0 {
            *counter = 1;
        }
    }

    counters[level_index] = counters[level_index].saturating_add(1);

    for counter in &mut counters[level_index + 1..] {
        *counter = 0;
    }

    Some(format_kmark_heading_number(
        &counters[from_index..=level_index],
        config.pattern,
    ))
}

fn resolve_active_heading_number_config(
    scope_stack: &[KmarkHeadingNumberParams],
) -> KmarkHeadingNumberConfig {
    let mut config = KmarkHeadingNumberConfig::default_config();

    for params in scope_stack {
        config.apply(params);
    }

    config
}

fn format_kmark_heading_number(counters: &[u32], pattern: KmarkHeadingNumberPattern) -> String {
    match pattern {
        KmarkHeadingNumberPattern::Dot => {
            let number = join_heading_number_components(counters, ".");
            if counters.len() == 1 {
                format!("{number}.")
            } else {
                number
            }
        }
        KmarkHeadingNumberPattern::DotTrailing => {
            format!("{}.", join_heading_number_components(counters, "."))
        }
        KmarkHeadingNumberPattern::Hyphen => join_heading_number_components(counters, "-"),
        KmarkHeadingNumberPattern::Chapter => {
            if counters.len() == 1 {
                format!("第{}章", counters[0])
            } else {
                join_heading_number_components(counters, ".")
            }
        }
    }
}

fn join_heading_number_components(counters: &[u32], separator: &str) -> String {
    counters
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(separator)
}

fn apply_generated_toc_heading_ids(
    headings: &mut [KmarkTocHeading],
    directives: &[KmarkTocDirective],
) {
    let mut used_ids = headings
        .iter()
        .filter_map(|heading| heading.explicit_id.clone())
        .collect::<HashSet<_>>();
    let mut generated_lines = HashSet::new();

    for directive in directives {
        let config = directive.params.to_config();

        if !config.links {
            continue;
        }

        for heading in headings.iter_mut().filter(|heading| {
            heading.source_line > directive.source_line
                && heading.level >= config.min_depth
                && heading.level <= config.max_depth
                && heading.explicit_id.is_none()
        }) {
            if generated_lines.contains(&heading.source_line) {
                continue;
            }

            let id = next_generated_toc_heading_id(heading.source_line, &mut used_ids);
            heading.generated_id = Some(id);
            generated_lines.insert(heading.source_line);
        }
    }
}

fn next_generated_toc_heading_id(source_line: usize, used_ids: &mut HashSet<String>) -> String {
    let base = format!("kmark-heading-{}", source_line + 1);

    if used_ids.insert(base.clone()) {
        return base;
    }

    let mut suffix = 2usize;

    loop {
        let candidate = format!("{base}-{suffix}");

        if used_ids.insert(candidate.clone()) {
            return candidate;
        }

        suffix += 1;
    }
}

fn normalize_toc_heading_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn heading_level_number(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn split_markdown_pages(content: &str) -> MarkdownPageSegments {
    let mut page_segments = Vec::new();
    let mut last_index = 0;
    let mut line_offset = 0usize;
    let mut active_fence = None;
    let mut is_inside_html_comment_block = false;
    let mut active_scope_lines: Vec<ActiveKmarkScopeLine> = Vec::new();
    let mut active_page_directives: Vec<ActiveKmarkPageDirectiveLine> = Vec::new();
    let mut pending_scope_prelude: Option<PendingKmarkScopePrelude> = None;
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
            let current_page_directive =
                resolve_active_page_directive(&active_scope_lines, &active_page_directives);
            let pending_scope_prelude = pending_scope_prelude.take();
            let mut combined_scope_page_directive = pending_scope_prelude
                .as_ref()
                .map(|pending| pending.page_directive.clone())
                .unwrap_or_default();
            combined_scope_page_directive.merge(&scope_page_directive);
            let mut scope_lines = pending_scope_prelude
                .as_ref()
                .map(|pending| pending.lines.clone())
                .unwrap_or_default();
            scope_lines.push(line.to_owned());
            let mut next_scope_lines = active_scope_lines.clone();
            next_scope_lines.push(ActiveKmarkScopeLine {
                lines: scope_lines,
                end_offset: line_span.end,
                page_directive: combined_scope_page_directive,
            });
            let next_page_directive =
                resolve_active_page_directive(&next_scope_lines, &active_page_directives);

            if segment_has_rendered_content
                && current_page_directive.has_different_page_config_than(&next_page_directive)
            {
                let split_start = pending_scope_prelude
                    .as_ref()
                    .map(|pending| pending.start_offset)
                    .unwrap_or(line_span.start);
                let split_line = pending_scope_prelude
                    .as_ref()
                    .map(|pending| pending.start_line)
                    .unwrap_or(line_index);
                push_markdown_page_segment(
                    &mut page_segments,
                    content,
                    last_index,
                    split_start,
                    line_offset,
                    &active_scope_lines,
                    &active_page_directives,
                );
                last_index = split_start;
                line_offset = split_line;
                segment_has_rendered_content = false;
            }

            active_scope_lines = next_scope_lines;
            continue;
        }

        if is_kmark_scope_end_line(line) {
            pending_scope_prelude = None;
            let current_page_directive =
                resolve_active_page_directive(&active_scope_lines, &active_page_directives);
            let mut next_scope_lines = active_scope_lines.clone();
            let closing_scope_depth = next_scope_lines.len();
            next_scope_lines.pop();
            let mut next_page_directives = active_page_directives.clone();
            next_page_directives
                .retain(|directive_line| directive_line.scope_depth < closing_scope_depth);
            let next_page_directive =
                resolve_active_page_directive(&next_scope_lines, &next_page_directives);
            let segment_uses_prefixed_scope = segment_has_rendered_content
                && active_scope_lines
                    .last()
                    .is_some_and(|scope_line| scope_line.end_offset <= last_index);

            if segment_has_rendered_content
                && (current_page_directive.has_different_page_config_than(&next_page_directive)
                    || segment_uses_prefixed_scope)
            {
                push_markdown_page_segment(
                    &mut page_segments,
                    content,
                    last_index,
                    line_span.start,
                    line_offset,
                    &active_scope_lines,
                    &active_page_directives,
                );
                last_index = line_span.end;
                line_offset = line_index + 1;
                segment_has_rendered_content = false;
                active_scope_lines = next_scope_lines;
                active_page_directives = next_page_directives;
                continue;
            }

            active_scope_lines = next_scope_lines;
            active_page_directives = next_page_directives;
        }

        if is_page_break_line(line) {
            pending_scope_prelude = None;
            if segment_has_rendered_content {
                push_markdown_page_segment(
                    &mut page_segments,
                    content,
                    last_index,
                    line_span.start,
                    line_offset,
                    &active_scope_lines,
                    &active_page_directives,
                );
            }

            last_index = line_span.end;
            line_offset = line_index + 1;
            segment_has_rendered_content = false;
            continue;
        }

        if is_unclosed_html_comment_line(line) {
            is_inside_html_comment_block = true;
            continue;
        }

        if is_kmark_toc_directive_line(line) {
            pending_scope_prelude = None;
            segment_has_rendered_content = true;
            continue;
        }

        if let Some(comment) = parse_kmark_scope_prelude_comment(line) {
            update_pending_kmark_scope_prelude(
                &mut pending_scope_prelude,
                comment,
                line,
                line_span.start,
                line_span.end,
                line_index,
            );
            continue;
        }

        if line.trim().is_empty() {
            if pending_scope_prelude
                .as_ref()
                .is_some_and(|pending| pending.page_directive.has_standalone_page_directive())
            {
                if !segment_has_rendered_content {
                    apply_pending_page_directive_before_content(
                        &mut page_segments,
                        content,
                        &mut last_index,
                        &mut line_offset,
                        &active_scope_lines,
                        &mut active_page_directives,
                        &mut pending_scope_prelude,
                        false,
                    );
                }
            } else {
                pending_scope_prelude = None;
            }
            continue;
        }

        if is_kmark_comment_line(line) {
            pending_scope_prelude = None;
            continue;
        }

        if is_standalone_html_comment_line(line) {
            continue;
        }

        if pending_scope_prelude
            .as_ref()
            .is_some_and(|pending| pending.page_directive.has_standalone_page_directive())
        {
            apply_pending_page_directive_before_content(
                &mut page_segments,
                content,
                &mut last_index,
                &mut line_offset,
                &active_scope_lines,
                &mut active_page_directives,
                &mut pending_scope_prelude,
                segment_has_rendered_content,
            );
        } else {
            pending_scope_prelude = None;
        }
        segment_has_rendered_content = true;
    }

    if segment_has_rendered_content {
        push_markdown_page_segment(
            &mut page_segments,
            content,
            last_index,
            content.len(),
            line_offset,
            &active_scope_lines,
            &active_page_directives,
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
    active_scope_lines: &[ActiveKmarkScopeLine],
    active_page_directives: &[ActiveKmarkPageDirectiveLine],
) {
    let prefix_lines = active_scope_lines
        .iter()
        .filter(|scope_line| scope_line.end_offset <= start_index)
        .flat_map(|scope_line| scope_line.lines.iter().map(String::as_str))
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
        page_directive: resolve_active_page_directive_for_segment(
            active_scope_lines,
            active_page_directives,
            start_index,
        ),
    });
}

fn resolve_active_page_directive(
    active_scope_lines: &[ActiveKmarkScopeLine],
    active_page_directives: &[ActiveKmarkPageDirectiveLine],
) -> PartialPageDirective {
    resolve_active_page_directive_at(active_scope_lines, active_page_directives, None)
}

fn resolve_active_page_directive_at(
    active_scope_lines: &[ActiveKmarkScopeLine],
    active_page_directives: &[ActiveKmarkPageDirectiveLine],
    segment_start: Option<usize>,
) -> PartialPageDirective {
    let mut page_directive = PartialPageDirective::default();

    merge_page_directives_for_scope_depth(
        &mut page_directive,
        active_page_directives,
        0,
        segment_start,
    );

    for (scope_index, scope_line) in active_scope_lines.iter().enumerate() {
        let mut scope_directive = scope_line.page_directive.clone();
        if segment_start.is_some_and(|start| scope_line.end_offset <= start) {
            scope_directive.page_number_reset = None;
        }
        page_directive.merge(&scope_directive);
        merge_page_directives_for_scope_depth(
            &mut page_directive,
            active_page_directives,
            scope_index + 1,
            segment_start,
        );
    }

    page_directive
}

fn resolve_active_page_directive_for_segment(
    active_scope_lines: &[ActiveKmarkScopeLine],
    active_page_directives: &[ActiveKmarkPageDirectiveLine],
    segment_start: usize,
) -> PartialPageDirective {
    resolve_active_page_directive_at(
        active_scope_lines,
        active_page_directives,
        Some(segment_start),
    )
}

fn merge_page_directives_for_scope_depth(
    target: &mut PartialPageDirective,
    active_page_directives: &[ActiveKmarkPageDirectiveLine],
    scope_depth: usize,
    segment_start: Option<usize>,
) {
    for directive_line in active_page_directives
        .iter()
        .filter(|directive_line| directive_line.scope_depth == scope_depth)
    {
        let mut directive = directive_line.page_directive.clone();
        if segment_start.is_some_and(|start| directive_line.end_offset <= start) {
            directive.page_number_reset = None;
        }
        target.merge(&directive);
    }
}

fn apply_pending_page_directive_before_content(
    page_segments: &mut Vec<MarkdownPageSegment>,
    content: &str,
    last_index: &mut usize,
    line_offset: &mut usize,
    active_scope_lines: &[ActiveKmarkScopeLine],
    active_page_directives: &mut Vec<ActiveKmarkPageDirectiveLine>,
    pending_scope_prelude: &mut Option<PendingKmarkScopePrelude>,
    segment_has_rendered_content: bool,
) {
    let Some(pending) = pending_scope_prelude.take() else {
        return;
    };

    if !pending.page_directive.has_page_directive() {
        return;
    }

    let current_page_directive =
        resolve_active_page_directive(active_scope_lines, active_page_directives);
    let mut next_page_directives = active_page_directives.clone();
    next_page_directives.push(ActiveKmarkPageDirectiveLine {
        end_offset: pending.end_offset,
        scope_depth: active_scope_lines.len(),
        page_directive: pending.page_directive,
    });
    let next_page_directive =
        resolve_active_page_directive(active_scope_lines, &next_page_directives);

    if segment_has_rendered_content
        && current_page_directive.has_different_page_config_than(&next_page_directive)
    {
        push_markdown_page_segment(
            page_segments,
            content,
            *last_index,
            pending.start_offset,
            *line_offset,
            active_scope_lines,
            active_page_directives,
        );
        *last_index = pending.start_offset;
        *line_offset = pending.start_line;
    }

    *active_page_directives = next_page_directives;
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
    let Some(rest) = strip_markdown_fence_indent(line) else {
        return false;
    };

    rest.starts_with(PAGE_BREAK_TOKEN_OPEN) && !rest.contains(PAGE_BREAK_TOKEN_CLOSE)
}

fn is_standalone_html_comment_line(line: &str) -> bool {
    let Some(rest) = strip_markdown_fence_indent(line) else {
        return false;
    };
    let trimmed = rest.trim_end();

    trimmed.starts_with(PAGE_BREAK_TOKEN_OPEN) && trimmed.ends_with(PAGE_BREAK_TOKEN_CLOSE)
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

fn is_kmark_toc_directive_line(line: &str) -> bool {
    parse_kmark_comment_body(line).is_some_and(|body| {
        if body.starts_with('{') || body == "}" {
            return false;
        }

        let (_, bundle) = parse_kmark_param_bundle_parts(body);
        bundle.toc.enabled == Some(true)
    })
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

fn parse_kmark_scope_prelude_comment(line: &str) -> Option<PartialPageDirective> {
    let remainder = parse_kmark_comment_body(line)?;

    if remainder == "}" || remainder.starts_with('{') {
        return None;
    }

    Some(parse_kmark_page_directive_tokens(remainder).unwrap_or_default())
}

fn update_pending_kmark_scope_prelude(
    pending_scope_prelude: &mut Option<PendingKmarkScopePrelude>,
    page_directive: PartialPageDirective,
    line: &str,
    start_offset: usize,
    end_offset: usize,
    line_index: usize,
) {
    if let Some(pending) = pending_scope_prelude.as_mut() {
        pending.lines.push(line.to_owned());
        pending.page_directive.merge(&page_directive);
        pending.end_offset = end_offset;
        return;
    }

    *pending_scope_prelude = Some(PendingKmarkScopePrelude {
        lines: vec![line.to_owned()],
        page_directive,
        start_offset,
        end_offset,
        start_line: line_index,
    });
}

fn is_kmark_scope_end_line(line: &str) -> bool {
    parse_kmark_comment_body(line).is_some_and(|remainder| remainder == "}")
}

impl<'a> HtmlEmitter<'a> {
    fn new(
        content: &'a str,
        line_offset: usize,
        markdown_file_path: Option<&'a str>,
        toc_document: &'a KmarkTocDocument,
        heading_number_document: &'a KmarkHeadingNumberDocument,
        next_mermaid_block_index: usize,
    ) -> Self {
        Self {
            content,
            line_offset,
            markdown_file_path,
            toc_document,
            heading_number_document,
            line_starts: collect_line_starts(content),
            html: String::new(),
            blockquote_stack: Vec::new(),
            callout_stack: Vec::new(),
            image_stack: Vec::new(),
            suppressed_link_depth: 0,
            suppressed_html_text_depth: 0,
            table_section: TableSection::Head,
            table_alignments: Vec::new(),
            table_cell_index: 0,
            table_body_open: false,
            table_html_start: None,
            table_source_start: None,
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
            pending_kmark_image_paragraph_style: None,
            pending_kmark_page_valign: None,
            pending_kmark_table_fit: None,
            active_mermaid_block: None,
            next_mermaid_block_index,
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

    fn render(mut self, events: Vec<OwnedEvent>) -> HtmlRenderOutput {
        for (event, range) in events {
            self.push_event(event, range);
        }

        self.flush_pending_kmark_toc();
        self.finish_mermaid_block();
        self.close_active_kmark_single_block();
        self.close_unclosed_kmark_scopes();
        HtmlRenderOutput {
            html: self.html,
            next_mermaid_block_index: self.next_mermaid_block_index,
        }
    }

    fn push_event(&mut self, event: Event<'static>, range: Range<usize>) {
        if matches!(event, Event::Html(_) | Event::InlineHtml(_)) {
            self.push_html_event(event, range);
            return;
        }

        self.flush_pending_kmark_toc();
        self.invalidate_pending_kmark_params_before_event(&event, &range);

        match event {
            Event::Start(tag) => self.start_tag(tag, &range),
            Event::End(tag_end) => self.end_tag(tag_end, &range),
            Event::Text(text) => self.push_text_event(&text, &range),
            Event::Code(text) => self.push_code_event(&text, &range),
            Event::SoftBreak => self.push_soft_break_event(&range),
            Event::HardBreak => self.push_hard_break_event(&range),
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

        if self.suppressed_html_text_depth == 0 && is_html_line_break(html.as_ref()) {
            self.flush_pending_kmark_toc();
            self.pending_kmark_params = None;
            self.ensure_callout_marker_paragraph_open();
            self.push_hard_break();
            return;
        }

        self.flush_pending_kmark_toc();
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

        self.ensure_callout_marker_paragraph_open();
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
                            block_decoration: KmarkRootDecoration::default(),
                            image_paragraph_decoration: KmarkRootDecoration::default(),
                        });
                    }
                    return;
                }
                let kmark_decorations = self.take_pending_kmark_paragraph_decorations();
                let paragraph_open_tag = format!("<p{}>", self.source_line_attributes(range),);
                if self.delay_callout_marker_paragraph_if_needed(paragraph_open_tag.clone(), range)
                {
                    return;
                }
                let open_tag_start = self.html.len();
                self.push_raw(&paragraph_open_tag);
                self.paragraph_context = Some(ParagraphContext {
                    open_tag_start,
                    source_line_end: self.resolve_range_end_line(range.clone()),
                    image_count: 0,
                    contains_non_image_content: false,
                    soft_break_ranges: Vec::new(),
                    block_decoration: kmark_decorations.block,
                    image_paragraph_decoration: kmark_decorations.image_paragraph,
                });
            }
            Tag::Heading {
                level,
                id,
                classes,
                attrs,
            } => {
                let decoration = self.take_pending_kmark_block_decoration();
                let source_line = self.resolve_range_start_line(range.clone());
                let mut html = format!("<{level}{}", self.source_line_attributes(range));
                if let Some(id) = id {
                    html.push_str(" id=\"");
                    html.push_str(&escape_html(&id));
                    html.push('"');
                } else if let Some(id) = self.toc_document.generated_heading_id(source_line) {
                    html.push_str(" id=\"");
                    html.push_str(&escape_html(id));
                    html.push('"');
                }
                if !classes.is_empty() || decoration.page_valign.is_some() {
                    html.push_str(" class=\"");
                    for (index, class_name) in classes.iter().enumerate() {
                        if index > 0 {
                            html.push(' ');
                        }
                        html.push_str(&escape_html(class_name));
                    }
                    let page_class_suffix = decoration.class_suffix();
                    if classes.is_empty() {
                        html.push_str(page_class_suffix.trim_start());
                    } else {
                        html.push_str(&page_class_suffix);
                    }
                    html.push('"');
                }
                html.push_str(&decoration.data_and_style_attributes());
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
                if let Some(number_text) = self
                    .heading_number_document
                    .heading_number_text(source_line)
                {
                    self.push_raw("<span class=\"kmark-heading-number\">");
                    self.push_raw(&escape_html(number_text));
                    self.push_raw("</span>");
                }
            }
            Tag::BlockQuote(_) => {
                if let Some(callout_start) =
                    parse_callout_start(self.content, range, self.blockquote_stack.len())
                {
                    self.start_callout(callout_start, range);
                    self.blockquote_stack.push(BlockQuoteRenderKind::Callout);
                } else {
                    let mut html = format!("<blockquote{}", self.source_line_attributes(range));
                    html.push_str(&self.take_pending_kmark_block_attributes());
                    html.push('>');
                    self.push_raw(&html);
                    self.blockquote_stack.push(BlockQuoteRenderKind::Normal);
                }
            }
            Tag::CodeBlock(kind) => {
                if is_mermaid_code_block(&kind) {
                    self.start_mermaid_block(range);
                    return;
                }

                let mut html = format!(
                    "<pre{}{}><code",
                    self.source_line_attributes(range),
                    self.take_pending_kmark_block_attributes(),
                );
                if let Some(language) = code_block_language(&kind) {
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
                let attributes = self.take_pending_kmark_block_attributes();
                self.push_raw(&format!("<ol{}>", attributes));
            }
            Tag::List(Some(start)) => {
                let attributes = self.take_pending_kmark_block_attributes();
                self.push_raw(&format!("<ol start=\"{start}\"{}>", attributes));
            }
            Tag::List(None) => {
                let attributes = self.take_pending_kmark_block_attributes();
                self.push_raw(&format!("<ul{}>", attributes));
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
                let decoration = self.take_pending_kmark_block_decoration();
                self.push_raw(&format!(
                    "<div class=\"footnote-definition{}\" id=\"{}\"{}{}><sup class=\"footnote-definition-label\">{}</sup>",
                    decoration.class_suffix(),
                    footnote_definition_id(number),
                    source_line_attributes,
                    decoration.data_and_style_attributes(),
                    number,
                ));
            }
            Tag::DefinitionList => {
                let attributes = self.take_pending_kmark_block_attributes();
                self.push_raw(&format!("<dl{}>", attributes));
            }
            Tag::DefinitionListTitle => self.push_raw("<dt>"),
            Tag::DefinitionListDefinition => self.push_raw("<dd>"),
            Tag::Table(alignments) => {
                self.table_alignments = alignments;
                self.table_section = TableSection::Head;
                self.table_cell_index = 0;
                self.table_body_open = false;
                self.table_html_start = Some(self.html.len());
                self.table_source_start = Some(range.start);
                let attributes = self.take_pending_kmark_table_attributes();
                self.push_raw(&format!("<table{}>", attributes));
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
                self.ensure_callout_marker_paragraph_open();
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
                let attributes = self.take_pending_kmark_block_attributes();
                self.push_raw(&format!(
                    "<section data-metadata-block=\"{}\"{}>",
                    metadata_block_name(kind),
                    attributes,
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
                if self.skip_unopened_callout_marker_paragraph() {
                    return;
                }
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
                self.finish_open_callout_marker_paragraph();
            }
            TagEnd::Heading(level) => self.push_raw(&format!("</{level}>")),
            TagEnd::BlockQuote(_) => match self
                .blockquote_stack
                .pop()
                .unwrap_or(BlockQuoteRenderKind::Normal)
            {
                BlockQuoteRenderKind::Normal => self.push_raw("</blockquote>"),
                BlockQuoteRenderKind::Callout => self.finish_callout(),
            },
            TagEnd::CodeBlock => {
                if self.active_mermaid_block.is_some() {
                    self.finish_mermaid_block();
                } else {
                    self.push_raw("</code></pre>");
                }
            }
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
                self.apply_table_merges();
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

    fn start_mermaid_block(&mut self, range: &Range<usize>) {
        let index = self.next_mermaid_block_index;
        self.next_mermaid_block_index += 1;
        self.active_mermaid_block = Some(ActiveMermaidBlock {
            index,
            source: String::new(),
            source_line_start: self.resolve_range_start_line(range.clone()),
            source_line_end: self.resolve_range_end_line(range.clone()),
            decoration: self.take_pending_kmark_block_decoration(),
        });
    }

    fn append_mermaid_source(&mut self, text: &str) -> bool {
        let Some(block) = self.active_mermaid_block.as_mut() else {
            return false;
        };

        block.source.push_str(text);
        true
    }

    fn finish_mermaid_block(&mut self) {
        let Some(block) = self.active_mermaid_block.take() else {
            return;
        };

        self.push_raw(&format!(
            "<div id=\"kmark-mermaid-{index}\" class=\"kmark-mermaid-block{class_suffix}\" data-kmark-mermaid-index=\"{index}\" data-kmark-mermaid-state=\"pending\" data-source-line-start=\"{source_line_start}\" data-source-line-end=\"{source_line_end}\"{decoration_attributes}><div class=\"kmark-mermaid-rendered\" aria-live=\"polite\"></div><details class=\"kmark-mermaid-source\" hidden><summary>source</summary><pre><code>{source}</code></pre></details></div>",
            index = block.index,
            class_suffix = block.decoration.class_suffix(),
            source_line_start = block.source_line_start,
            source_line_end = block.source_line_end,
            decoration_attributes = block.decoration.data_and_style_attributes(),
            source = escape_html(&block.source),
        ));
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

        self.ensure_callout_marker_paragraph_open();
        self.mark_paragraph_non_image_content();

        self.push_raw(&format!(
            "<span class=\"math {class_name}\">{}</span>",
            escape_html(text),
        ));
    }

    fn push_text_event(&mut self, text: &str, range: &Range<usize>) {
        if self.append_mermaid_source(text) {
            return;
        }

        if self.should_suppress_callout_marker_event(range) {
            return;
        }

        self.ensure_callout_marker_paragraph_open();
        self.push_text(text);
    }

    fn push_code_event(&mut self, text: &str, range: &Range<usize>) {
        if self.append_mermaid_source(text) {
            return;
        }

        if self.should_suppress_callout_marker_event(range) {
            return;
        }

        self.ensure_callout_marker_paragraph_open();
        self.push_code(text);
    }

    fn push_soft_break_event(&mut self, range: &Range<usize>) {
        if self.append_mermaid_source("\n") {
            return;
        }

        if self.should_suppress_callout_marker_soft_break(range) {
            return;
        }

        self.ensure_callout_marker_paragraph_open();
        self.push_soft_break();
    }

    fn push_hard_break_event(&mut self, range: &Range<usize>) {
        if self.append_mermaid_source("\n") {
            return;
        }

        if self.should_suppress_callout_marker_event(range) {
            return;
        }

        self.ensure_callout_marker_paragraph_open();
        self.push_hard_break();
    }

    fn push_text(&mut self, text: &str) {
        if let Some(image_context) = self.image_stack.last_mut() {
            image_context.alt_text.push_str(text);
            return;
        }

        if self.suppressed_html_text_depth > 0 {
            return;
        }

        if has_visible_markdown_text(text) {
            self.mark_paragraph_non_image_content();
        }

        self.push_text_with_literal_line_breaks(text);
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

    fn push_text_with_literal_line_breaks(&mut self, text: &str) {
        let mut remaining = text;

        while let Some(line_break_index) = remaining.find("\\n") {
            let (before_line_break, after_before) = remaining.split_at(line_break_index);
            self.html.push_str(&escape_html(before_line_break));
            self.push_hard_break();
            remaining = &after_before["\\n".len()..];
        }

        self.html.push_str(&escape_html(remaining));
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

    fn source_line_attributes_from_lines(&self, start_line: usize, end_line: usize) -> String {
        format!(
            " data-source-line-start=\"{}\" data-source-line-end=\"{}\"",
            start_line,
            end_line.max(start_line),
        )
    }

    fn apply_table_merges(&mut self) {
        let Some(html_start) = self.table_html_start.take() else {
            return;
        };
        let Some(source_start) = self.table_source_start.take() else {
            return;
        };
        if html_start > self.html.len() {
            return;
        }

        let Some(markers) =
            collect_table_body_merge_markers(self.content, &self.line_starts, source_start)
        else {
            return;
        };
        if !markers
            .iter()
            .flatten()
            .any(|marker| !matches!(marker, TableMergeMarker::None))
        {
            return;
        }

        let table_html = self.html[html_start..].to_owned();
        let Some(merged_html) = render_table_with_body_merges(&table_html, &markers) else {
            return;
        };
        self.html.replace_range(html_start.., &merged_html);
    }

    fn start_callout(&mut self, callout_start: CalloutStart, range: &Range<usize>) {
        let kind_name = callout_start.kind.name();
        let title = if callout_start.title.trim().is_empty() {
            callout_start.kind.default_title()
        } else {
            callout_start.title.as_str()
        };
        let decoration = self.take_callout_root_decoration();

        self.push_raw(&format!(
            "<div class=\"kmark-callout kmark-callout--{}{}\" data-callout-type=\"{}\"{}{}><div class=\"kmark-callout__title\"><span class=\"kmark-callout__icon\" aria-hidden=\"true\"></span><span class=\"kmark-callout__title-text\">{}</span></div><div class=\"kmark-callout__body\">",
            kind_name,
            decoration.class_suffix(),
            kind_name,
            self.source_line_attributes(range),
            decoration.data_and_style_attributes(),
            escape_html(title),
        ));
        self.callout_stack.push(ActiveCalloutContext {
            marker_line_end: callout_start.marker_line_end,
            marker_paragraph: CalloutMarkerParagraphState::Pending,
        });
    }

    fn finish_callout(&mut self) {
        self.callout_stack.pop();
        self.push_raw("</div></div>");
    }

    fn delay_callout_marker_paragraph_if_needed(
        &mut self,
        open_tag: String,
        range: &Range<usize>,
    ) -> bool {
        let source_line_end = self.resolve_range_end_line(range.clone());
        let Some(context) = self.callout_stack.last_mut() else {
            return false;
        };

        if !matches!(
            context.marker_paragraph,
            CalloutMarkerParagraphState::Pending
        ) || range.start > context.marker_line_end
        {
            return false;
        }

        context.marker_paragraph = CalloutMarkerParagraphState::Delayed {
            open_tag,
            source_line_end,
        };
        true
    }

    fn ensure_callout_marker_paragraph_open(&mut self) {
        let delayed_paragraph = {
            let Some(context) = self.callout_stack.last_mut() else {
                return;
            };

            match std::mem::replace(
                &mut context.marker_paragraph,
                CalloutMarkerParagraphState::Open,
            ) {
                CalloutMarkerParagraphState::Delayed {
                    open_tag,
                    source_line_end,
                } => Some((open_tag, source_line_end)),
                other_state => {
                    context.marker_paragraph = other_state;
                    None
                }
            }
        };

        let Some((open_tag, source_line_end)) = delayed_paragraph else {
            return;
        };

        let open_tag_start = self.html.len();
        self.push_raw(&open_tag);
        self.paragraph_context = Some(ParagraphContext {
            open_tag_start,
            source_line_end,
            image_count: 0,
            contains_non_image_content: false,
            soft_break_ranges: Vec::new(),
            block_decoration: KmarkRootDecoration::default(),
            image_paragraph_decoration: KmarkRootDecoration::default(),
        });
    }

    fn skip_unopened_callout_marker_paragraph(&mut self) -> bool {
        let Some(context) = self.callout_stack.last_mut() else {
            return false;
        };

        if matches!(
            context.marker_paragraph,
            CalloutMarkerParagraphState::Delayed { .. }
        ) {
            context.marker_paragraph = CalloutMarkerParagraphState::Done;
            return true;
        }

        false
    }

    fn finish_open_callout_marker_paragraph(&mut self) {
        let Some(context) = self.callout_stack.last_mut() else {
            return;
        };

        if matches!(context.marker_paragraph, CalloutMarkerParagraphState::Open) {
            context.marker_paragraph = CalloutMarkerParagraphState::Done;
        }
    }

    fn should_suppress_callout_marker_event(&self, range: &Range<usize>) -> bool {
        self.callout_stack.last().is_some_and(|context| {
            matches!(
                context.marker_paragraph,
                CalloutMarkerParagraphState::Delayed { .. } | CalloutMarkerParagraphState::Open
            ) && range.end <= context.marker_line_end
        })
    }

    fn should_suppress_callout_marker_soft_break(&self, range: &Range<usize>) -> bool {
        self.callout_stack.last().is_some_and(|context| {
            matches!(
                context.marker_paragraph,
                CalloutMarkerParagraphState::Delayed { .. }
            ) && range.start <= context.marker_line_end
        })
    }

    fn apply_kmark_comment(&mut self, comment: KmarkComment, range: Range<usize>) {
        self.discard_pending_kmark_params_if_gap_is_incompatible(range.start);

        if !matches!(comment, KmarkComment::Params(_)) {
            self.flush_pending_kmark_toc();
        }

        match comment {
            KmarkComment::Params(bundle) => {
                let start_line = self.resolve_range_start_line(range.clone());
                let end_line = self.resolve_range_end_line(range.clone());
                if let Some(pending) = self.pending_kmark_params.as_mut() {
                    pending.bundle.merge(&bundle);
                    pending.end_offset = range.end;
                    pending.end_line = end_line;
                } else {
                    self.pending_kmark_params = Some(PendingKmarkParams {
                        bundle,
                        start_line,
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
                    self.kmark_scope_stack.push(KmarkScopeContext {
                        layer: None,
                        renders_wrapper: false,
                    });
                    return;
                }

                let decoration = KmarkRootDecoration {
                    style: resolved_params.to_scope_root_style(),
                    page_valign: resolved_params.page.valign,
                };
                let renders_wrapper = !decoration.is_empty();
                if renders_wrapper {
                    self.push_raw(&format!(
                        "<div class=\"kmark-scope{}\"{}>",
                        decoration.class_suffix(),
                        decoration.data_and_style_attributes(),
                    ));
                }
                self.kmark_scope_stack.push(KmarkScopeContext {
                    layer: Some(layer),
                    renders_wrapper,
                });
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

        if pending.bundle.toc.enabled == Some(true) {
            return;
        }

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

    fn flush_pending_kmark_toc(&mut self) -> bool {
        let should_render_toc = self
            .pending_kmark_params
            .as_ref()
            .is_some_and(|pending| pending.bundle.toc.enabled == Some(true));

        if !should_render_toc {
            return false;
        }

        let Some(pending) = self.pending_kmark_params.take() else {
            return false;
        };

        self.push_kmark_toc(&pending);
        true
    }

    fn push_kmark_toc(&mut self, pending: &PendingKmarkParams) {
        let config = pending.bundle.toc.to_config();
        let headings = self
            .toc_document
            .headings_after_line(pending.end_line, &config);
        let layer = self.resolve_kmark_bundle_layer(&pending.bundle);
        let resolved_params = layer.resolved_params();
        let decoration = KmarkRootDecoration {
            style: resolved_params.to_single_block_root_style(),
            page_valign: resolved_params.page.valign,
        };
        let title = pending
            .bundle
            .toc
            .title
            .as_deref()
            .unwrap_or(DEFAULT_TOC_TITLE);
        let mut html = format!(
            "<nav class=\"kmark-toc{}\"{}{}>",
            decoration.class_suffix(),
            self.source_line_attributes_from_lines(pending.start_line, pending.end_line),
            decoration.data_and_style_attributes(),
        );

        if !title.is_empty() {
            html.push_str("<div class=\"kmark-toc__title\">");
            html.push_str(&escape_html(title));
            html.push_str("</div>");
        }

        if !headings.is_empty() {
            let tree = build_kmark_toc_tree(&headings);
            push_kmark_toc_node_list(
                &mut html,
                &tree,
                config.ordered,
                config.links,
                self.heading_number_document,
                false,
            );
        }

        html.push_str("</nav>");
        self.push_raw(&html);
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
        self.resolve_visual_params(single_layer).to_image_style()
    }

    fn resolve_visual_params(&self, single_layer: Option<&KmarkParamLayer>) -> KmarkParams {
        let active_layer = self
            .active_kmark_single_block
            .as_ref()
            .map(|active_single| &active_single.layer);

        self.resolve_params_with_layers(active_layer, single_layer)
    }

    fn resolve_active_block_params(&self) -> KmarkParams {
        if let Some(active_single) = self.active_kmark_single_block.as_ref() {
            self.resolve_params_with_layers(Some(&active_single.layer), None)
        } else {
            self.resolve_active_scope_block_params()
        }
    }

    fn resolve_active_scope_block_params(&self) -> KmarkParams {
        self.resolve_params_with_layers(None, None)
    }

    fn resolve_scoped_single_block_params(&self, single_layer: &KmarkParamLayer) -> KmarkParams {
        self.resolve_params_with_layers(Some(single_layer), None)
    }

    fn resolve_params_with_layers(
        &self,
        first_extra_layer: Option<&KmarkParamLayer>,
        second_extra_layer: Option<&KmarkParamLayer>,
    ) -> KmarkParams {
        let mut final_params = KmarkParams::default();

        for scope in &self.kmark_scope_stack {
            if let Some(layer) = &scope.layer {
                final_params.merge(&layer.preset);
            }
        }
        for layer in [first_extra_layer, second_extra_layer]
            .into_iter()
            .flatten()
        {
            final_params.merge(&layer.preset);
        }

        for scope in &self.kmark_scope_stack {
            if let Some(layer) = &scope.layer {
                final_params.merge(&layer.direct);
            }
        }
        for layer in [first_extra_layer, second_extra_layer]
            .into_iter()
            .flatten()
        {
            final_params.merge(&layer.direct);
        }

        final_params
    }

    fn take_callout_root_decoration(&mut self) -> KmarkRootDecoration {
        let params = self.resolve_active_block_params();
        let decoration = KmarkRootDecoration {
            style: params.to_callout_root_style(),
            page_valign: params.page.valign,
        };
        let should_consume_current_single_block = self
            .active_kmark_single_block
            .as_ref()
            .is_some_and(|active_single| {
                active_single.end == KmarkBlockEnd::BlockQuote
                    && active_single.nested_same_kind_count == 0
            });

        self.clear_pending_kmark_render_state();
        if should_consume_current_single_block {
            self.active_kmark_single_block = None;
        }

        decoration
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

        let resolved_params = self.resolve_scoped_single_block_params(&layer);

        self.pending_kmark_params = None;
        if matches!(end, KmarkBlockEnd::Table) {
            self.pending_kmark_block_style = resolved_params.to_table_root_style();
            self.pending_kmark_table_fit = resolved_params.table.fit;
        } else {
            self.pending_kmark_block_style = resolved_params.to_single_block_root_style();
            self.pending_kmark_table_fit = None;
        }
        self.pending_kmark_image_paragraph_style = resolved_params.to_image_paragraph_root_style();
        self.pending_kmark_page_valign = resolved_params.page.valign;
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
        self.clear_pending_kmark_render_state();
    }

    fn take_pending_kmark_block_decoration(&mut self) -> KmarkRootDecoration {
        if !self.has_pending_kmark_block_decoration() {
            return self.active_scope_block_decoration();
        }

        let decoration = KmarkRootDecoration {
            style: self.pending_kmark_block_style.take(),
            page_valign: self.pending_kmark_page_valign.take(),
        };
        self.clear_pending_kmark_auxiliary_render_state();
        decoration
    }

    fn take_pending_kmark_paragraph_decorations(&mut self) -> KmarkParagraphDecorations {
        if !self.has_pending_kmark_block_decoration() {
            self.pending_kmark_table_fit = None;
            return KmarkParagraphDecorations {
                block: self.active_scope_block_decoration(),
                image_paragraph: KmarkRootDecoration::default(),
            };
        }

        self.pending_kmark_table_fit = None;

        KmarkParagraphDecorations {
            block: KmarkRootDecoration {
                style: self.pending_kmark_block_style.take(),
                page_valign: self.pending_kmark_page_valign,
            },
            image_paragraph: KmarkRootDecoration {
                style: self.pending_kmark_image_paragraph_style.take(),
                page_valign: self.pending_kmark_page_valign.take(),
            },
        }
    }

    fn active_scope_block_decoration(&self) -> KmarkRootDecoration {
        let params = self.resolve_active_scope_block_params();

        KmarkRootDecoration {
            style: params.to_scoped_block_root_style(),
            page_valign: None,
        }
    }

    fn take_pending_kmark_block_attributes(&mut self) -> String {
        self.take_pending_kmark_block_decoration()
            .attributes_with_optional_class()
    }

    fn take_pending_kmark_table_attributes(&mut self) -> String {
        let (decoration, fit) = if !self.has_pending_kmark_block_decoration() {
            let params = self.resolve_active_scope_block_params();
            (
                KmarkRootDecoration {
                    style: params.to_table_root_style(),
                    page_valign: None,
                },
                params.table.fit,
            )
        } else {
            let decoration = KmarkRootDecoration {
                style: self.pending_kmark_block_style.take(),
                page_valign: self.pending_kmark_page_valign.take(),
            };
            let fit = self.pending_kmark_table_fit.take();
            self.clear_pending_kmark_auxiliary_render_state();
            (decoration, fit)
        };

        let mut attributes = decoration.attributes_with_optional_class();
        if let Some(fit) = fit {
            attributes.push_str(" data-kmark-table-fit=\"");
            attributes.push_str(fit.name());
            attributes.push('"');
        }

        attributes
    }

    fn has_pending_kmark_block_decoration(&self) -> bool {
        self.pending_kmark_block_style.is_some() || self.pending_kmark_page_valign.is_some()
    }

    fn clear_pending_kmark_render_state(&mut self) {
        self.pending_kmark_block_style = None;
        self.pending_kmark_image_paragraph_style = None;
        self.pending_kmark_page_valign = None;
        self.pending_kmark_table_fit = None;
    }

    fn clear_pending_kmark_auxiliary_render_state(&mut self) {
        self.pending_kmark_image_paragraph_style = None;
        self.pending_kmark_table_fit = None;
    }

    fn close_kmark_scope(&mut self) {
        if self
            .kmark_scope_stack
            .pop()
            .is_some_and(|context| context.renders_wrapper)
        {
            self.push_raw("</div>");
        }
    }

    fn close_unclosed_kmark_scopes(&mut self) {
        while let Some(context) = self.kmark_scope_stack.pop() {
            if context.renders_wrapper {
                self.push_raw("</div>");
            }
        }
    }

    fn is_inside_kmark_scope(&self) -> bool {
        self.kmark_scope_stack
            .iter()
            .any(|context| context.renders_wrapper)
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

        let should_flatten_image_paragraph =
            self.should_flatten_kmark_scope_image_paragraph(&context);
        let decoration = if context.image_count > 0 && !context.contains_non_image_content {
            &context.image_paragraph_decoration
        } else {
            &context.block_decoration
        };

        if !decoration.is_empty() {
            self.patch_tag_attributes(
                context.open_tag_start,
                &decoration.attributes_with_optional_class(),
            );
        }

        if should_flatten_image_paragraph {
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

    fn patch_tag_attributes(&mut self, open_tag_start: usize, attributes: &str) {
        if attributes.is_empty() {
            return;
        }

        let Some(relative_tag_end_offset) = self.html[open_tag_start..].find('>') else {
            return;
        };
        let tag_end_offset = open_tag_start + relative_tag_end_offset;
        self.html.insert_str(tag_end_offset, attributes);
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

impl KmarkTocDocument {
    fn headings_after_line<'a>(
        &'a self,
        source_line: usize,
        config: &KmarkTocConfig,
    ) -> Vec<&'a KmarkTocHeading> {
        self.headings
            .iter()
            .filter(|heading| {
                heading.source_line > source_line
                    && heading.level >= config.min_depth
                    && heading.level <= config.max_depth
            })
            .collect()
    }

    fn generated_heading_id(&self, source_line: usize) -> Option<&str> {
        self.generated_heading_ids
            .get(&source_line)
            .map(String::as_str)
    }
}

impl KmarkTocHeading {
    fn link_id(&self) -> Option<&str> {
        self.explicit_id.as_deref().or(self.generated_id.as_deref())
    }
}

impl KmarkTocParams {
    fn merge(&mut self, other: &Self) {
        if let Some(enabled) = other.enabled {
            self.enabled = Some(enabled);
        }
        if let Some(max_depth) = other.max_depth {
            self.max_depth = Some(max_depth);
        }
        if let Some(min_depth) = other.min_depth {
            self.min_depth = Some(min_depth);
        }
        if let Some(title) = &other.title {
            self.title = Some(title.clone());
        }
        if let Some(ordered) = other.ordered {
            self.ordered = Some(ordered);
        }
        if let Some(links) = other.links {
            self.links = Some(links);
        }
    }

    fn to_config(&self) -> KmarkTocConfig {
        KmarkTocConfig {
            min_depth: self.min_depth.unwrap_or(1),
            max_depth: self.max_depth.unwrap_or(6),
            ordered: self.ordered.unwrap_or(false),
            links: self.links.unwrap_or(true),
        }
    }
}

fn build_kmark_toc_tree<'a>(headings: &[&'a KmarkTocHeading]) -> Vec<KmarkTocRenderNode<'a>> {
    let mut roots = Vec::new();
    let mut stack: Vec<(u8, Vec<usize>)> = Vec::new();

    for heading in headings {
        while stack
            .last()
            .is_some_and(|(level, _)| *level >= heading.level)
        {
            stack.pop();
        }

        let parent_path = stack
            .last()
            .map(|(_, path)| path.clone())
            .unwrap_or_default();
        let siblings = kmark_toc_nodes_at_path_mut(&mut roots, &parent_path);
        let node_index = siblings.len();
        siblings.push(KmarkTocRenderNode {
            heading: *heading,
            children: Vec::new(),
        });

        let mut node_path = parent_path;
        node_path.push(node_index);
        stack.push((heading.level, node_path));
    }

    roots
}

fn kmark_toc_nodes_at_path_mut<'nodes, 'heading>(
    nodes: &'nodes mut Vec<KmarkTocRenderNode<'heading>>,
    path: &[usize],
) -> &'nodes mut Vec<KmarkTocRenderNode<'heading>> {
    if let Some((&index, rest)) = path.split_first() {
        return kmark_toc_nodes_at_path_mut(&mut nodes[index].children, rest);
    }

    nodes
}

fn push_kmark_toc_node_list(
    html: &mut String,
    nodes: &[KmarkTocRenderNode<'_>],
    ordered: bool,
    links: bool,
    heading_number_document: &KmarkHeadingNumberDocument,
    nested: bool,
) {
    let tag_name = if ordered { "ol" } else { "ul" };
    let class_name = if nested {
        "kmark-toc__list kmark-toc__list--nested"
    } else {
        "kmark-toc__list"
    };

    html.push_str(&format!("<{tag_name} class=\"{class_name}\">"));

    for node in nodes {
        html.push_str(&format!(
            "<li class=\"kmark-toc__item kmark-toc__item--depth-{}\" data-toc-depth=\"{}\">",
            node.heading.level, node.heading.level,
        ));
        push_kmark_toc_node_label(html, node.heading, links, heading_number_document);
        if !node.children.is_empty() {
            push_kmark_toc_node_list(
                html,
                &node.children,
                ordered,
                links,
                heading_number_document,
                true,
            );
        }
        html.push_str("</li>");
    }

    html.push_str(&format!("</{tag_name}>"));
}

fn push_kmark_toc_node_label(
    html: &mut String,
    heading: &KmarkTocHeading,
    links: bool,
    heading_number_document: &KmarkHeadingNumberDocument,
) {
    if links {
        if let Some(id) = heading.link_id() {
            html.push_str("<a class=\"kmark-toc__link\" href=\"#");
            html.push_str(&escape_html(id));
            html.push_str("\">");
            push_kmark_toc_node_label_content(html, heading, heading_number_document);
            html.push_str("</a>");
            return;
        }
    }

    html.push_str("<span class=\"kmark-toc__text\">");
    push_kmark_toc_node_label_content(html, heading, heading_number_document);
    html.push_str("</span>");
}

fn push_kmark_toc_node_label_content(
    html: &mut String,
    heading: &KmarkTocHeading,
    heading_number_document: &KmarkHeadingNumberDocument,
) {
    if let Some(number_text) = heading_number_document.heading_number_text(heading.source_line) {
        html.push_str("<span class=\"kmark-heading-number\">");
        html.push_str(&escape_html(number_text));
        html.push_str("</span>");
    }

    html.push_str(&escape_html(&heading.text));
}

impl KmarkParamBundle {
    fn merge(&mut self, other: &Self) {
        if let Some(preset_use) = &other.preset_use {
            self.preset_use = Some(preset_use.clone());
        }
        self.params.merge(&other.params);
        self.toc.merge(&other.toc);
        self.heading_number.merge(&other.heading_number);
        self.page_directive.merge(&other.page_directive);
    }
}

impl KmarkHeadingNumberDocument {
    fn heading_number_text(&self, source_line: usize) -> Option<&str> {
        self.text_by_source_line
            .get(&source_line)
            .map(String::as_str)
    }
}

impl KmarkHeadingNumberConfig {
    fn default_config() -> Self {
        Self {
            enabled: false,
            from: 1,
            depth: 3,
            pattern: KmarkHeadingNumberPattern::Dot,
        }
    }

    fn apply(&mut self, params: &KmarkHeadingNumberParams) {
        if let Some(enabled) = params.enabled {
            self.enabled = enabled;
        }
        if let Some(from) = params.from {
            self.from = from;
        }
        if let Some(depth) = params.depth {
            self.depth = depth;
        }
        if let Some(pattern) = params.pattern {
            self.pattern = pattern;
        }
    }
}

impl KmarkHeadingNumberParams {
    fn merge(&mut self, other: &Self) {
        if let Some(enabled) = other.enabled {
            self.enabled = Some(enabled);
        }
        if let Some(from) = other.from {
            self.from = Some(from);
        }
        if let Some(depth) = other.depth {
            self.depth = Some(depth);
        }
        if let Some(pattern) = other.pattern {
            self.pattern = Some(pattern);
        }
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
        self.text.merge(&other.text);
        self.table.merge(&other.table);
        self.page.merge(&other.page);
    }

    fn has_directives(&self) -> bool {
        self.image.has_image_directives()
            || self.layout.has_layout_directives()
            || self.text.has_text_directives()
            || self.table.has_table_directives()
            || self.page.has_page_directives()
    }

    fn to_callout_root_style(&self) -> Option<String> {
        let mut rules = Vec::new();

        if let Some(image_style) = self.image.to_box_style() {
            rules.push(image_style);
        }
        if let Some(width_style) = self.to_text_block_width_style(true) {
            rules.push(width_style);
        }
        if let Some(text_style) = self.text.to_style() {
            rules.push(text_style);
        }
        if let Some(layout_style) = self.layout.to_single_block_style() {
            rules.push(layout_style);
        }

        (!rules.is_empty()).then(|| rules.join(""))
    }

    fn to_scope_root_style(&self) -> Option<String> {
        let mut rules = Vec::new();

        if self.page.valign.is_some() {
            if let Some(image_style) = self.image.to_box_style() {
                rules.push(image_style);
            }
        }
        if self.layout.has_layout_directives() || self.image.has_image_directives() {
            rules.push(self.layout.to_scope_style());
        }

        (!rules.is_empty()).then(|| rules.join(""))
    }

    fn to_single_block_root_style(&self) -> Option<String> {
        let mut rules = Vec::new();

        if let Some(image_style) = self.image.to_box_style() {
            rules.push(image_style);
        }
        if let Some(width_style) = self.to_text_block_width_style(true) {
            rules.push(width_style);
        }
        if let Some(text_style) = self.text.to_style() {
            rules.push(text_style);
        }
        if let Some(layout_style) = self.layout.to_single_block_style() {
            rules.push(layout_style);
        }

        (!rules.is_empty()).then(|| rules.join(""))
    }

    fn to_scoped_block_root_style(&self) -> Option<String> {
        let mut rules = Vec::new();

        if let Some(image_style) = self.image.to_box_style() {
            rules.push(image_style);
        }
        if let Some(width_style) = self.to_text_block_width_style(false) {
            rules.push(width_style);
        }
        if let Some(text_style) = self.text.to_style() {
            rules.push(text_style);
        }

        (!rules.is_empty()).then(|| rules.join(""))
    }

    fn to_table_root_style(&self) -> Option<String> {
        let mut rules = Vec::new();

        if let Some(image_style) = self.image.to_box_style() {
            rules.push(image_style);
        }
        if self.layout.has_plain_text_align()
            && self.image.has_explicit_width()
            && !self.image.has_page_fit_dimension()
        {
            match self.layout.align {
                Some(KmarkAlign::Center) => {
                    rules.push("margin-left:auto".to_owned());
                    rules.push("margin-right:auto".to_owned());
                }
                Some(KmarkAlign::Right) => {
                    rules.push("margin-left:auto".to_owned());
                }
                Some(KmarkAlign::Left) | None => {}
            }
        }
        if let Some(text_style) = self.text.to_style() {
            rules.push(text_style);
        }
        if let Some(table_style) = self.table.to_style() {
            rules.push(table_style);
        }

        (!rules.is_empty()).then(|| rules.join(""))
    }

    fn to_image_style(&self) -> Option<String> {
        self.image.to_style(&self.layout)
    }

    fn to_text_block_width_style(&self, fit_plain_align: bool) -> Option<String> {
        let mut rules = Vec::new();
        let should_fit_content = !self.image.has_explicit_width()
            && (self.image.has_box_directives()
                || self.text.has_text_box_directives()
                || (fit_plain_align && self.layout.has_plain_text_align()));

        if should_fit_content {
            rules.push("display:table".to_owned());
            rules.push("width:fit-content".to_owned());
            rules.push("max-width:100%".to_owned());
            rules.push("box-sizing:border-box".to_owned());
        }

        if self.layout.has_plain_text_align()
            && !self.image.has_page_fit_dimension()
            && (should_fit_content || self.image.has_explicit_width())
        {
            match self.layout.align {
                Some(KmarkAlign::Center) => {
                    rules.push("margin-left:auto".to_owned());
                    rules.push("margin-right:auto".to_owned());
                }
                Some(KmarkAlign::Right) => {
                    rules.push("margin-left:auto".to_owned());
                }
                Some(KmarkAlign::Left) | None => {}
            }
        }

        (!rules.is_empty()).then(|| format!("{};", rules.join(";")))
    }

    fn to_image_paragraph_root_style(&self) -> Option<String> {
        let mut rules = Vec::new();

        if self.image.has_page_fit_dimension() {
            rules.push("margin:0;".to_owned());
        }
        if self.page.valign.is_some() {
            if let Some(image_style) = self.image.to_box_style() {
                rules.push(image_style);
            }
        }
        if let Some(layout_style) = self.layout.to_single_block_style() {
            rules.push(layout_style);
        }

        (!rules.is_empty()).then(|| rules.join(""))
    }
}

impl KmarkPageParams {
    fn merge(&mut self, other: &Self) {
        if let Some(valign) = other.valign {
            self.valign = Some(valign);
        }
    }

    fn has_page_directives(&self) -> bool {
        self.valign.is_some()
    }
}

impl KmarkRootDecoration {
    fn is_empty(&self) -> bool {
        self.style.is_none() && self.page_valign.is_none()
    }

    fn class_suffix(&self) -> String {
        self.page_valign
            .map(|valign| format!(" kmark-page-valign kmark-page-valign--{}", valign.name()))
            .unwrap_or_default()
    }

    fn data_attribute(&self) -> String {
        self.page_valign
            .map(|valign| format!(" data-page-valign=\"{}\"", valign.name()))
            .unwrap_or_default()
    }

    fn style_attribute(&self) -> String {
        self.style
            .as_ref()
            .map(|style| format!(" style=\"{}\"", escape_html(style)))
            .unwrap_or_default()
    }

    fn data_and_style_attributes(&self) -> String {
        format!("{}{}", self.data_attribute(), self.style_attribute())
    }

    fn attributes_with_optional_class(&self) -> String {
        let mut attributes = String::new();
        if self.page_valign.is_some() {
            attributes.push_str(" class=\"");
            attributes.push_str(self.class_suffix().trim_start());
            attributes.push('"');
        }
        attributes.push_str(&self.data_and_style_attributes());
        attributes
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

    fn has_plain_text_align(&self) -> bool {
        self.align.is_some()
            && self.layout.is_none()
            && self.valign.is_none()
            && self.gap.is_none()
            && self.wrap.is_none()
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

impl KmarkTextParams {
    fn merge(&mut self, other: &Self) {
        if let Some(color) = &other.color {
            self.color = Some(color.clone());
        }
        if let Some(font_size) = &other.font_size {
            self.font_size = Some(font_size.clone());
        }
        if let Some(font_weight) = &other.font_weight {
            self.font_weight = Some(font_weight.clone());
        }
        if let Some(font_family) = &other.font_family {
            self.font_family = Some(font_family.clone());
        }
        if let Some(font_style) = &other.font_style {
            self.font_style = Some(font_style.clone());
        }
        if let Some(letter_spacing) = &other.letter_spacing {
            self.letter_spacing = Some(letter_spacing.clone());
        }
        if let Some(line_height) = &other.line_height {
            self.line_height = Some(line_height.clone());
        }
    }

    fn has_text_directives(&self) -> bool {
        self.color.is_some()
            || self.font_size.is_some()
            || self.font_weight.is_some()
            || self.font_family.is_some()
            || self.font_style.is_some()
            || self.letter_spacing.is_some()
            || self.line_height.is_some()
    }

    fn has_text_box_directives(&self) -> bool {
        self.color.is_some()
            || self.font_size.is_some()
            || self.font_weight.is_some()
            || self.font_family.is_some()
            || self.font_style.is_some()
            || self.letter_spacing.is_some()
    }

    fn to_style(&self) -> Option<String> {
        let mut rules = Vec::new();

        self.push_style_rules(&mut rules);

        (!rules.is_empty()).then(|| format!("{};", rules.join(";")))
    }

    fn push_style_rules(&self, rules: &mut Vec<String>) {
        if let Some(color) = &self.color {
            rules.push(format!("color:{color}"));
        }
        if let Some(font_size) = &self.font_size {
            rules.push(format!("font-size:{font_size}"));
        }
        if let Some(font_weight) = &self.font_weight {
            rules.push(format!("font-weight:{font_weight}"));
        }
        if let Some(font_family) = &self.font_family {
            rules.push(format!("font-family:{font_family}"));
        }
        if let Some(font_style) = &self.font_style {
            rules.push(format!("font-style:{font_style}"));
        }
        if let Some(letter_spacing) = &self.letter_spacing {
            rules.push(format!("letter-spacing:{letter_spacing}"));
        }
        if let Some(line_height) = &self.line_height {
            rules.push(format!("line-height:{line_height}"));
        }
    }
}

impl KmarkTableParams {
    fn merge(&mut self, other: &Self) {
        if let Some(cell_padding_x) = &other.cell_padding_x {
            self.cell_padding_x = Some(cell_padding_x.clone());
        }
        if let Some(cell_padding_y) = &other.cell_padding_y {
            self.cell_padding_y = Some(cell_padding_y.clone());
        }
        if let Some(fit) = other.fit {
            self.fit = Some(fit);
        }
        if let Some(layout) = other.layout {
            self.layout = Some(layout);
        }
    }

    fn has_table_directives(&self) -> bool {
        self.cell_padding_x.is_some()
            || self.cell_padding_y.is_some()
            || self.fit.is_some()
            || self.layout.is_some()
    }

    fn to_style(&self) -> Option<String> {
        let mut rules = Vec::new();

        if let Some(cell_padding_x) = &self.cell_padding_x {
            rules.push(format!("--kmark-table-cell-padding-x:{cell_padding_x}"));
        }
        if let Some(cell_padding_y) = &self.cell_padding_y {
            rules.push(format!("--kmark-table-cell-padding-y:{cell_padding_y}"));
        }
        if let Some(layout) = self.layout {
            rules.push(format!("table-layout:{}", layout.css_value()));
        }

        (!rules.is_empty()).then(|| format!("{};", rules.join(";")))
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

impl KmarkPageValign {
    fn name(self) -> &'static str {
        match self {
            Self::Top => "top",
            Self::Center => "center",
            Self::Bottom => "bottom",
        }
    }
}

impl KmarkTableFit {
    fn name(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Off => "off",
            Self::Shrink => "shrink",
        }
    }
}

impl KmarkTableLayout {
    fn css_value(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Fixed => "fixed",
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
            font_family: DEFAULT_PREVIEW_FONT_FAMILY.to_owned(),
            heading_font_family: String::new(),
        }
    }
}

impl PageNumberConfig {
    fn default_config() -> Self {
        Self {
            position: PageNumberPosition::None,
            format: "{page}".to_owned(),
            start: 1,
            reset: false,
            count: true,
            visible: true,
            style: PageNumberStyle::Decimal,
            font_size: CssLength::new("10pt"),
            color: "#666".to_owned(),
            margin_top: CssLength::new("8mm"),
            margin_bottom: CssLength::new("8mm"),
            margin_left: CssLength::new("12mm"),
            margin_right: CssLength::new("12mm"),
        }
    }

    fn apply(&mut self, directive: &PartialPageDirective) {
        if let Some(position) = directive.page_number_position {
            self.position = position;
        }
        if let Some(display) = directive.page_number_display {
            self.visible = display;
            if display && matches!(self.position, PageNumberPosition::None) {
                self.position = PageNumberPosition::BottomCenter;
            }
        }
        if let Some(format) = &directive.page_number_format {
            self.format = format.clone();
        }
        if let Some(start) = directive.page_number_start {
            self.start = start;
        }
        if let Some(reset) = directive.page_number_reset {
            self.reset = reset;
        }
        if let Some(count) = directive.page_number_count {
            self.count = count;
        }
        if let Some(visible) = directive.page_number_visible {
            self.visible = visible;
        }
        if let Some(style) = directive.page_number_style {
            self.style = style;
        }
        if let Some(font_size) = &directive.page_number_font_size {
            self.font_size = font_size.clone();
        }
        if let Some(color) = &directive.page_number_color {
            self.color = color.clone();
        }
        if let Some(margin_top) = &directive.page_number_margin_top {
            self.margin_top = margin_top.clone();
        }
        if let Some(margin_bottom) = &directive.page_number_margin_bottom {
            self.margin_bottom = margin_bottom.clone();
        }
        if let Some(margin_left) = &directive.page_number_margin_left {
            self.margin_left = margin_left.clone();
        }
        if let Some(margin_right) = &directive.page_number_margin_right {
            self.margin_right = margin_right.clone();
        }
    }
}

impl PageChromeConfig {
    fn default_config() -> Self {
        Self {
            header: PageChromeRegionConfig::default_config(),
            footer: PageChromeRegionConfig::default_config(),
        }
    }

    fn apply(&mut self, directive: &PartialPageDirective) {
        self.header.apply(&directive.page_header);
        self.footer.apply(&directive.page_footer);
    }
}

impl PageChromeRegionConfig {
    fn default_config() -> Self {
        Self {
            enabled: false,
            left: None,
            center: None,
            right: None,
            opacity: "1".to_owned(),
            offset: None,
            border_size: None,
            border_color: None,
            border_style: None,
            font_size: None,
            font_family: None,
            font_color: None,
            padding: None,
        }
    }

    fn apply(&mut self, directive: &PartialPageChromeRegionDirective) {
        if directive.enabled == Some(false) {
            self.enabled = false;
            self.left = None;
            self.center = None;
            self.right = None;
            return;
        }

        if let Some(left) = &directive.left {
            self.left = Some(left.clone());
        }
        if let Some(center) = &directive.center {
            self.center = Some(center.clone());
        }
        if let Some(right) = &directive.right {
            self.right = Some(right.clone());
        }
        if let Some(opacity) = &directive.opacity {
            self.opacity = opacity.clone();
        }
        if let Some(offset) = &directive.offset {
            self.offset = Some(offset.clone());
        }
        if let Some(border_size) = &directive.border_size {
            self.border_size = Some(border_size.clone());
        }
        if let Some(border_color) = &directive.border_color {
            self.border_color = Some(border_color.clone());
        }
        if let Some(border_style) = &directive.border_style {
            self.border_style = Some(border_style.clone());
        }
        if let Some(font_size) = &directive.font_size {
            self.font_size = Some(font_size.clone());
        }
        if let Some(font_family) = &directive.font_family {
            self.font_family = Some(font_family.clone());
        }
        if let Some(font_color) = &directive.font_color {
            self.font_color = Some(font_color.clone());
        }
        if let Some(padding) = &directive.padding {
            self.padding = Some(padding.clone());
        }

        self.enabled = self.left.is_some() || self.center.is_some() || self.right.is_some();
    }
}

impl PageNumberPosition {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::TopLeft => "top-left",
            Self::TopCenter => "top-center",
            Self::TopRight => "top-right",
            Self::BottomLeft => "bottom-left",
            Self::BottomCenter => "bottom-center",
            Self::BottomRight => "bottom-right",
        }
    }
}

impl PageNumberStyle {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Decimal => "decimal",
            Self::LowerRoman => "lower-roman",
            Self::UpperRoman => "upper-roman",
            Self::LowerAlpha => "lower-alpha",
            Self::UpperAlpha => "upper-alpha",
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
        if let Some(page_font_size) = &other.page_font_size {
            self.page_font_size = Some(page_font_size.clone());
        }
        if let Some(page_font_family) = &other.page_font_family {
            self.page_font_family = Some(page_font_family.clone());
        }
        if let Some(page_heading_font_family) = &other.page_heading_font_family {
            self.page_heading_font_family = Some(page_heading_font_family.clone());
        }
        if let Some(page_number_position) = other.page_number_position {
            self.page_number_position = Some(page_number_position);
        }
        if let Some(page_number_display) = other.page_number_display {
            self.page_number_display = Some(page_number_display);
            if page_number_display
                && other.page_number_position.is_none()
                && matches!(
                    self.page_number_position,
                    None | Some(PageNumberPosition::None)
                )
            {
                self.page_number_position = Some(PageNumberPosition::BottomCenter);
            }
        }
        if let Some(page_number_format) = &other.page_number_format {
            self.page_number_format = Some(page_number_format.clone());
        }
        if let Some(page_number_start) = other.page_number_start {
            self.page_number_start = Some(page_number_start);
        }
        if let Some(page_number_reset) = other.page_number_reset {
            self.page_number_reset = Some(page_number_reset);
        }
        if let Some(page_number_count) = other.page_number_count {
            self.page_number_count = Some(page_number_count);
        }
        if let Some(page_number_visible) = other.page_number_visible {
            self.page_number_visible = Some(page_number_visible);
        }
        if let Some(page_number_style) = other.page_number_style {
            self.page_number_style = Some(page_number_style);
        }
        if let Some(page_number_font_size) = &other.page_number_font_size {
            self.page_number_font_size = Some(page_number_font_size.clone());
        }
        if let Some(page_number_color) = &other.page_number_color {
            self.page_number_color = Some(page_number_color.clone());
        }
        if let Some(page_number_margin_top) = &other.page_number_margin_top {
            self.page_number_margin_top = Some(page_number_margin_top.clone());
        }
        if let Some(page_number_margin_bottom) = &other.page_number_margin_bottom {
            self.page_number_margin_bottom = Some(page_number_margin_bottom.clone());
        }
        if let Some(page_number_margin_left) = &other.page_number_margin_left {
            self.page_number_margin_left = Some(page_number_margin_left.clone());
        }
        if let Some(page_number_margin_right) = &other.page_number_margin_right {
            self.page_number_margin_right = Some(page_number_margin_right.clone());
        }
        self.page_header.merge(&other.page_header);
        self.page_footer.merge(&other.page_footer);
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
            || self.page_font_size.is_some()
            || self.page_font_family.is_some()
            || self.page_heading_font_family.is_some()
            || self.has_page_number_directive()
            || self.has_page_chrome_directive()
    }

    fn has_standalone_page_directive(&self) -> bool {
        self.page_size.is_some()
            || self.page_orientation.is_some()
            || self.page_width.is_some()
            || self.page_height.is_some()
            || self.page_margin.is_some()
            || self.page_margin_top.is_some()
            || self.page_margin_right.is_some()
            || self.page_margin_bottom.is_some()
            || self.page_margin_left.is_some()
            || self.page_font_size.is_some()
            || self.page_font_family.is_some()
            || self.page_heading_font_family.is_some()
            || self.has_page_number_directive()
            || self.has_page_chrome_directive()
    }

    fn has_page_number_directive(&self) -> bool {
        self.page_number_position.is_some()
            || self.page_number_display.is_some()
            || self.page_number_format.is_some()
            || self.page_number_start.is_some()
            || self.page_number_reset.is_some()
            || self.page_number_count.is_some()
            || self.page_number_visible.is_some()
            || self.page_number_style.is_some()
            || self.page_number_font_size.is_some()
            || self.page_number_color.is_some()
            || self.page_number_margin_top.is_some()
            || self.page_number_margin_bottom.is_some()
            || self.page_number_margin_left.is_some()
            || self.page_number_margin_right.is_some()
    }

    fn has_page_chrome_directive(&self) -> bool {
        self.page_header.has_directive() || self.page_footer.has_directive()
    }

    fn has_different_page_config_than(&self, other: &Self) -> bool {
        self.page_size != other.page_size
            || self.page_orientation != other.page_orientation
            || self.page_width != other.page_width
            || self.page_height != other.page_height
            || self.page_margin != other.page_margin
            || self.page_margin_top != other.page_margin_top
            || self.page_margin_right != other.page_margin_right
            || self.page_margin_bottom != other.page_margin_bottom
            || self.page_margin_left != other.page_margin_left
            || self.page_font_size != other.page_font_size
            || self.page_font_family != other.page_font_family
            || self.page_heading_font_family != other.page_heading_font_family
            || self.page_number_position != other.page_number_position
            || self.page_number_display != other.page_number_display
            || self.page_number_format != other.page_number_format
            || self.page_number_start != other.page_number_start
            || self.page_number_reset != other.page_number_reset
            || self.page_number_count != other.page_number_count
            || self.page_number_visible != other.page_number_visible
            || self.page_number_style != other.page_number_style
            || self.page_number_font_size != other.page_number_font_size
            || self.page_number_color != other.page_number_color
            || self.page_number_margin_top != other.page_number_margin_top
            || self.page_number_margin_bottom != other.page_number_margin_bottom
            || self.page_number_margin_left != other.page_number_margin_left
            || self.page_number_margin_right != other.page_number_margin_right
            || self.page_header != other.page_header
            || self.page_footer != other.page_footer
    }
}

impl PartialPageChromeRegionDirective {
    fn set_enabled(&mut self, enabled: bool) {
        self.enabled = Some(enabled);
        if !enabled {
            self.left = None;
            self.center = None;
            self.right = None;
        }
    }

    fn set_left(&mut self, value: String) {
        self.left = Some(value);
        self.enabled = Some(true);
    }

    fn set_center(&mut self, value: String) {
        self.center = Some(value);
        self.enabled = Some(true);
    }

    fn set_right(&mut self, value: String) {
        self.right = Some(value);
        self.enabled = Some(true);
    }

    fn set_opacity(&mut self, value: String) {
        self.opacity = Some(value);
    }

    fn set_offset(&mut self, value: CssLength) {
        self.offset = Some(value);
    }

    fn set_border_size(&mut self, value: String) {
        self.border_size = Some(value);
    }

    fn set_border_color(&mut self, value: String) {
        self.border_color = Some(value);
    }

    fn set_border_style(&mut self, value: String) {
        self.border_style = Some(value);
    }

    fn set_font_size(&mut self, value: String) {
        self.font_size = Some(value);
    }

    fn set_font_family(&mut self, value: String) {
        self.font_family = Some(value);
    }

    fn set_font_color(&mut self, value: String) {
        self.font_color = Some(value);
    }

    fn set_padding(&mut self, value: String) {
        self.padding = Some(value);
    }

    fn merge(&mut self, other: &Self) {
        if other.enabled == Some(false) {
            self.set_enabled(false);
            return;
        }

        if let Some(left) = &other.left {
            self.left = Some(left.clone());
        }
        if let Some(center) = &other.center {
            self.center = Some(center.clone());
        }
        if let Some(right) = &other.right {
            self.right = Some(right.clone());
        }
        if let Some(opacity) = &other.opacity {
            self.opacity = Some(opacity.clone());
        }
        if let Some(offset) = &other.offset {
            self.offset = Some(offset.clone());
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
        if let Some(font_size) = &other.font_size {
            self.font_size = Some(font_size.clone());
        }
        if let Some(font_family) = &other.font_family {
            self.font_family = Some(font_family.clone());
        }
        if let Some(font_color) = &other.font_color {
            self.font_color = Some(font_color.clone());
        }
        if let Some(padding) = &other.padding {
            self.padding = Some(padding.clone());
        }
        if other.enabled == Some(true)
            || other.left.is_some()
            || other.center.is_some()
            || other.right.is_some()
        {
            self.enabled = Some(true);
        }
    }

    fn has_directive(&self) -> bool {
        self.enabled.is_some()
            || self.left.is_some()
            || self.center.is_some()
            || self.right.is_some()
            || self.opacity.is_some()
            || self.offset.is_some()
            || self.border_size.is_some()
            || self.border_color.is_some()
            || self.border_style.is_some()
            || self.font_size.is_some()
            || self.font_family.is_some()
            || self.font_color.is_some()
            || self.padding.is_some()
    }
}

impl DocumentPageConfig {
    fn default_config() -> Self {
        Self {
            geometry: PageGeometryBasis::default_a4(),
            default_page_style: PageStyle::default_a4(),
            default_text_style: PreviewTextStyle::default_preview(),
            page_number_config: PageNumberConfig::default_config(),
            page_chrome_config: PageChromeConfig::default_config(),
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
        if let Some(page_font_size) = &page_directive.page_font_size {
            text_style.font_size = page_font_size.clone();
        }
        if let Some(page_font_family) = &page_directive.page_font_family {
            text_style.font_family = page_font_family.clone();
        }
        if let Some(page_heading_font_family) = &page_directive.page_heading_font_family {
            text_style.heading_font_family = page_heading_font_family.clone();
        }

        let mut page_number_config = self.page_number_config.clone();
        page_number_config.apply(page_directive);
        let mut page_chrome_config = self.page_chrome_config.clone();
        page_chrome_config.apply(page_directive);

        Self {
            geometry,
            default_page_style: page_style,
            default_text_style: text_style,
            page_number_config,
            page_chrome_config,
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
        if let Some(radius) = &other.radius {
            self.radius = Some(radius.clone());
        }
        if let Some(background) = &other.background {
            self.background = Some(background.clone());
        }
        if let Some(opacity) = &other.opacity {
            self.opacity = Some(opacity.clone());
        }
        if let Some(rotate) = &other.rotate {
            self.rotate = Some(rotate.clone());
        }
        if let Some(shadow) = &other.shadow {
            self.shadow = Some(shadow.clone());
        }
        if let Some(margin) = &other.margin {
            self.margin = Some(margin.clone());
        }
        if let Some(padding) = &other.padding {
            self.padding = Some(padding.clone());
        }
    }

    fn has_image_directives(&self) -> bool {
        self.width.is_some()
            || self.height.is_some()
            || self.position.is_some()
            || self.border_size.is_some()
            || self.border_color.is_some()
            || self.border_style.is_some()
            || self.radius.is_some()
            || self.background.is_some()
            || self.opacity.is_some()
            || self.rotate.is_some()
            || self.shadow.is_some()
            || self.margin.is_some()
            || self.padding.is_some()
    }

    fn has_box_directives(&self) -> bool {
        self.width.is_some()
            || self.height.is_some()
            || self.border_size.is_some()
            || self.border_color.is_some()
            || self.border_style.is_some()
            || self.radius.is_some()
            || self.background.is_some()
            || self.opacity.is_some()
            || self.rotate.is_some()
            || self.shadow.is_some()
            || self.margin.is_some()
            || self.padding.is_some()
    }

    fn has_explicit_width(&self) -> bool {
        self.width.is_some()
    }

    fn has_page_fit_dimension(&self) -> bool {
        self.width.as_ref().is_some_and(KmarkSizeValue::is_page_fit)
            || self
                .height
                .as_ref()
                .is_some_and(KmarkSizeValue::is_page_fit)
    }

    fn has_page_fit_contain_dimension(&self) -> bool {
        self.width
            .as_ref()
            .is_some_and(KmarkSizeValue::is_page_fit_contain)
            || self
                .height
                .as_ref()
                .is_some_and(KmarkSizeValue::is_page_fit_contain)
    }

    fn to_style(&self, layout: &KmarkLayoutParams) -> Option<String> {
        let mut rules = Vec::new();

        self.push_size_style_rules(&mut rules);
        if self.has_page_fit_dimension() {
            rules.push("display:block".to_owned());
        }
        if self.has_page_fit_contain_dimension() {
            rules.push("object-fit:contain".to_owned());
        }
        if let Some(position) = &self.position {
            rules.push(format!("object-position:{position}"));
        }
        self.push_decoration_style_rules(&mut rules);
        self.push_fit_box_style_rules(&mut rules);
        self.push_page_fit_align_style_rules(layout, &mut rules);

        (!rules.is_empty()).then(|| format!("{};", rules.join(";")))
    }

    fn to_box_style(&self) -> Option<String> {
        let mut rules = Vec::new();

        self.push_box_style_rules(&mut rules);

        (!rules.is_empty()).then(|| format!("{};", rules.join(";")))
    }

    fn push_box_style_rules(&self, rules: &mut Vec<String>) {
        self.push_size_style_rules(rules);
        self.push_decoration_style_rules(rules);
        self.push_fit_box_style_rules(rules);
    }

    fn push_size_style_rules(&self, rules: &mut Vec<String>) {
        if let Some(width) = &self.width {
            width.push_width_style_rules(rules);
        }
        if let Some(height) = &self.height {
            height.push_height_style_rules(rules);
        }
    }

    fn push_decoration_style_rules(&self, rules: &mut Vec<String>) {
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
        if let Some(radius) = &self.radius {
            rules.push(format!("border-radius:{radius}"));
        }
        if let Some(background) = &self.background {
            rules.push(format!("background:{background}"));
        }
        if let Some(opacity) = &self.opacity {
            rules.push(format!("opacity:{opacity}"));
        }
        if let Some(rotate) = &self.rotate {
            rules.push(format!("transform:{rotate}"));
        }
        if let Some(shadow) = &self.shadow {
            rules.push(format!("box-shadow:{shadow}"));
        }
        if let Some(margin) = &self.margin {
            if !self.has_page_fit_dimension() {
                rules.push(format!("margin:{margin}"));
            }
        }
        if let Some(padding) = &self.padding {
            rules.push(format!("padding:{padding}"));
        }
    }

    fn push_fit_box_style_rules(&self, rules: &mut Vec<String>) {
        if self
            .width
            .as_ref()
            .is_some_and(KmarkSizeValue::needs_box_sizing)
            || self
                .height
                .as_ref()
                .is_some_and(KmarkSizeValue::needs_box_sizing)
        {
            rules.push("box-sizing:border-box".to_owned());
        }

        if self.has_page_fit_dimension() {
            rules.push("margin:0".to_owned());
        }
    }

    fn push_page_fit_align_style_rules(&self, layout: &KmarkLayoutParams, rules: &mut Vec<String>) {
        if !self.has_page_fit_dimension() || !layout.has_plain_text_align() {
            return;
        }

        match layout.align {
            Some(KmarkAlign::Center) => {
                rules.push("margin-left:auto".to_owned());
                rules.push("margin-right:auto".to_owned());
            }
            Some(KmarkAlign::Right) => {
                rules.push("margin-left:auto".to_owned());
                rules.push("margin-right:0".to_owned());
            }
            Some(KmarkAlign::Left) | None => {}
        }
    }
}

impl KmarkSizeValue {
    fn is_page_fit(&self) -> bool {
        matches!(self, Self::PageFit | Self::PageFitContain)
    }

    fn is_page_fit_contain(&self) -> bool {
        matches!(self, Self::PageFitContain)
    }

    fn needs_box_sizing(&self) -> bool {
        matches!(self, Self::Fit | Self::PageFit | Self::PageFitContain)
    }

    fn push_width_style_rules(&self, rules: &mut Vec<String>) {
        match self {
            Self::Length(width) => rules.push(format!("width:{width}")),
            Self::Fit => {
                rules.push("width:fit-content".to_owned());
                rules.push("max-width:100%".to_owned());
            }
            Self::PageFit => {
                rules.push("width:var(--kmark-page-fit-width,100%)".to_owned());
            }
            Self::PageFitContain => {
                rules.push("max-width:var(--kmark-page-fit-width,100%)".to_owned());
                rules.push("width:var(--kmark-page-fit-contain-width,auto)".to_owned());
            }
        }
    }

    fn push_height_style_rules(&self, rules: &mut Vec<String>) {
        match self {
            Self::Length(height) => rules.push(format!("height:{height}")),
            Self::Fit => rules.push("height:fit-content".to_owned()),
            Self::PageFit => {
                rules.push("height:var(--kmark-page-fit-height,auto)".to_owned());
            }
            Self::PageFitContain => {
                rules.push("max-height:var(--kmark-page-fit-height,none)".to_owned());
                rules.push("height:var(--kmark-page-fit-contain-height,auto)".to_owned());
            }
        }
    }
}

fn footnote_definition_id(number: usize) -> String {
    format!("fn-{number}")
}

fn footnote_reference_id(number: usize, occurrence: usize) -> String {
    format!("fnref-{number}-{occurrence}")
}

fn metadata_block_name(kind: MetadataBlockKind) -> &'static str {
    match kind {
        MetadataBlockKind::YamlStyle => "yaml",
        MetadataBlockKind::PlusesStyle => "pluses",
    }
}

impl CalloutKind {
    fn from_marker(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "note" => Some(Self::Note),
            "tip" => Some(Self::Tip),
            "important" => Some(Self::Important),
            "warning" => Some(Self::Warning),
            "caution" => Some(Self::Caution),
            _ => None,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Tip => "tip",
            Self::Important => "important",
            Self::Warning => "warning",
            Self::Caution => "caution",
        }
    }

    fn default_title(self) -> &'static str {
        match self {
            Self::Note => "Note",
            Self::Tip => "Tip",
            Self::Important => "Important",
            Self::Warning => "Warning",
            Self::Caution => "Caution",
        }
    }
}

fn parse_callout_start(
    content: &str,
    range: &Range<usize>,
    blockquote_depth: usize,
) -> Option<CalloutStart> {
    let line_span = first_line_span_in_range(content, range.clone())?;
    let line = &content[line_span.start..line_span.content_end];
    let quote_content = strip_blockquote_markers(line, blockquote_depth + 1)?;
    let (kind, title) = parse_callout_marker_line(quote_content.trim_start())?;

    Some(CalloutStart {
        kind,
        title,
        marker_line_end: line_span.content_end,
    })
}

fn first_line_span_in_range(content: &str, range: Range<usize>) -> Option<MarkdownLineSpan> {
    if range.start >= range.end || range.start >= content.len() {
        return None;
    }

    let start = range.start;
    let mut end = start;
    let bounded_end = range.end.min(content.len());
    let bytes = content.as_bytes();

    while end < bounded_end && bytes[end] != b'\n' {
        end += 1;
    }

    let mut content_end = end;
    if content_end > start && bytes[content_end - 1] == b'\r' {
        content_end -= 1;
    }
    let line_end = if end < bounded_end { end + 1 } else { end };

    Some(MarkdownLineSpan {
        start,
        content_end,
        end: line_end,
    })
}

fn strip_blockquote_markers(line: &str, marker_count: usize) -> Option<&str> {
    let bytes = line.as_bytes();
    let mut offset = 0usize;

    for _ in 0..marker_count {
        while matches!(bytes.get(offset), Some(b' ' | b'\t')) {
            offset += 1;
        }

        if !matches!(bytes.get(offset), Some(b'>')) {
            return None;
        }
        offset += 1;

        if matches!(bytes.get(offset), Some(b' ' | b'\t')) {
            offset += 1;
        }
    }

    Some(&line[offset..])
}

fn parse_callout_marker_line(line: &str) -> Option<(CalloutKind, String)> {
    let rest = line.strip_prefix("[!")?;
    let type_end = rest.find(']')?;
    let kind = CalloutKind::from_marker(&rest[..type_end])?;
    let mut title = rest[type_end + 1..].trim_start();

    if title.starts_with('+') || title.starts_with('-') {
        title = title[1..].trim_start();
    }

    Some((kind, title.trim().to_owned()))
}

fn code_block_language(kind: &CodeBlockKind<'_>) -> Option<String> {
    match kind {
        CodeBlockKind::Indented => None,
        CodeBlockKind::Fenced(info) => {
            let language = info.split_whitespace().next().unwrap_or_default().trim();
            (!language.is_empty()).then_some(language.to_string())
        }
    }
}

fn is_mermaid_code_block(kind: &CodeBlockKind<'_>) -> bool {
    code_block_language(kind).is_some_and(|language| language.eq_ignore_ascii_case("mermaid"))
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

    for (key, value) in split_kmark_param_pairs(input) {
        let value = value.as_str();

        if key == "page_scope" {
            return None;
        }

        match key.as_str() {
            "page_size" => {
                if let Some(page_size) = parse_kmark_page_size_value(value) {
                    directive.page_size = Some(page_size);
                }
            }
            "page_orientation" | "orientation" => {
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
            "page_font_size" => {
                if let Some(page_font_size) = parse_kmark_page_length_value(value) {
                    directive.page_font_size = Some(page_font_size);
                }
            }
            "page_font_family" => {
                if let Some(page_font_family) = parse_kmark_font_family_value(value) {
                    directive.page_font_family = Some(page_font_family);
                }
            }
            "page_heading_font_family" => {
                if let Some(page_heading_font_family) = parse_kmark_font_family_value(value) {
                    directive.page_heading_font_family = Some(page_heading_font_family);
                }
            }
            "page_number" => {
                if let Some((position, display)) = parse_kmark_page_number_value(value) {
                    directive.page_number_position = position;
                    directive.page_number_display = display;
                }
            }
            "page_number_format" => {
                if let Some(format) = parse_kmark_page_number_format_value(value) {
                    directive.page_number_format = Some(format);
                }
            }
            "page_number_start" => {
                if let Some(start) = parse_kmark_positive_u32_value(value) {
                    directive.page_number_start = Some(start);
                }
            }
            "page_number_reset" => {
                if let Some(reset) = parse_kmark_bool_value(value) {
                    directive.page_number_reset = Some(reset);
                }
            }
            "page_number_count" => {
                if let Some(count) = parse_kmark_bool_value(value) {
                    directive.page_number_count = Some(count);
                }
            }
            "page_number_visible" => {
                if let Some(visible) = parse_kmark_bool_value(value) {
                    directive.page_number_visible = Some(visible);
                }
            }
            "page_number_style" => {
                if let Some(style) = parse_kmark_page_number_style_value(value) {
                    directive.page_number_style = Some(style);
                }
            }
            "page_number_font_size" => {
                if let Some(font_size) = parse_kmark_page_length_value(value) {
                    directive.page_number_font_size = Some(font_size);
                }
            }
            "page_number_color" => {
                if let Some(color) = parse_kmark_border_color_value(trim_kmark_quotes(value)) {
                    directive.page_number_color = Some(color);
                }
            }
            "page_number_margin_top" => {
                if let Some(margin_top) = parse_kmark_page_length_value(value) {
                    directive.page_number_margin_top = Some(margin_top);
                }
            }
            "page_number_margin_bottom" => {
                if let Some(margin_bottom) = parse_kmark_page_length_value(value) {
                    directive.page_number_margin_bottom = Some(margin_bottom);
                }
            }
            "page_number_margin_left" => {
                if let Some(margin_left) = parse_kmark_page_length_value(value) {
                    directive.page_number_margin_left = Some(margin_left);
                }
            }
            "page_number_margin_right" => {
                if let Some(margin_right) = parse_kmark_page_length_value(value) {
                    directive.page_number_margin_right = Some(margin_right);
                }
            }
            "page_header" => {
                if let Some(enabled) = parse_kmark_bool_value(value) {
                    directive.page_header.set_enabled(enabled);
                }
            }
            "page_header_left" => {
                if let Some(text) = parse_kmark_page_chrome_text_value(value) {
                    directive.page_header.set_left(text);
                }
            }
            "page_header_center" => {
                if let Some(text) = parse_kmark_page_chrome_text_value(value) {
                    directive.page_header.set_center(text);
                }
            }
            "page_header_right" => {
                if let Some(text) = parse_kmark_page_chrome_text_value(value) {
                    directive.page_header.set_right(text);
                }
            }
            "page_header_opacity" => {
                if let Some(opacity) = parse_kmark_opacity_value(value) {
                    directive.page_header.set_opacity(opacity);
                }
            }
            "page_header_offset" => {
                if let Some(offset) = parse_kmark_page_length_value(value) {
                    directive.page_header.set_offset(offset);
                }
            }
            "page_header_border_size" => {
                if let Some(border_size) = parse_kmark_border_size_value(value) {
                    directive.page_header.set_border_size(border_size);
                }
            }
            "page_header_border_color" => {
                if let Some(border_color) = parse_kmark_border_color_value(value) {
                    directive.page_header.set_border_color(border_color);
                }
            }
            "page_header_border_style" => {
                if let Some(border_style) = parse_kmark_border_style_value(value) {
                    directive.page_header.set_border_style(border_style);
                }
            }
            "page_header_font_size" => {
                if let Some(font_size) = parse_kmark_font_size_value(value) {
                    directive.page_header.set_font_size(font_size);
                }
            }
            "page_header_font_family" => {
                if let Some(font_family) = parse_kmark_font_family_value(value) {
                    directive.page_header.set_font_family(font_family);
                }
            }
            "page_header_font_color" => {
                if let Some(font_color) = parse_kmark_color_value(value) {
                    directive.page_header.set_font_color(font_color);
                }
            }
            "page_header_padding" => {
                if let Some(padding) = parse_kmark_padding_value(value) {
                    directive.page_header.set_padding(padding);
                }
            }
            "page_footer" => {
                if let Some(enabled) = parse_kmark_bool_value(value) {
                    directive.page_footer.set_enabled(enabled);
                }
            }
            "page_footer_left" => {
                if let Some(text) = parse_kmark_page_chrome_text_value(value) {
                    directive.page_footer.set_left(text);
                }
            }
            "page_footer_center" => {
                if let Some(text) = parse_kmark_page_chrome_text_value(value) {
                    directive.page_footer.set_center(text);
                }
            }
            "page_footer_right" => {
                if let Some(text) = parse_kmark_page_chrome_text_value(value) {
                    directive.page_footer.set_right(text);
                }
            }
            "page_footer_opacity" => {
                if let Some(opacity) = parse_kmark_opacity_value(value) {
                    directive.page_footer.set_opacity(opacity);
                }
            }
            "page_footer_offset" => {
                if let Some(offset) = parse_kmark_page_length_value(value) {
                    directive.page_footer.set_offset(offset);
                }
            }
            "page_footer_border_size" => {
                if let Some(border_size) = parse_kmark_border_size_value(value) {
                    directive.page_footer.set_border_size(border_size);
                }
            }
            "page_footer_border_color" => {
                if let Some(border_color) = parse_kmark_border_color_value(value) {
                    directive.page_footer.set_border_color(border_color);
                }
            }
            "page_footer_border_style" => {
                if let Some(border_style) = parse_kmark_border_style_value(value) {
                    directive.page_footer.set_border_style(border_style);
                }
            }
            "page_footer_font_size" => {
                if let Some(font_size) = parse_kmark_font_size_value(value) {
                    directive.page_footer.set_font_size(font_size);
                }
            }
            "page_footer_font_family" => {
                if let Some(font_family) = parse_kmark_font_family_value(value) {
                    directive.page_footer.set_font_family(font_family);
                }
            }
            "page_footer_font_color" => {
                if let Some(font_color) = parse_kmark_color_value(value) {
                    directive.page_footer.set_font_color(font_color);
                }
            }
            "page_footer_padding" => {
                if let Some(padding) = parse_kmark_padding_value(value) {
                    directive.page_footer.set_padding(padding);
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
    parse_css_physical_length_value(trim_kmark_quotes(value)).map(CssLength::new)
}

fn parse_kmark_page_number_value(
    value: &str,
) -> Option<(Option<PageNumberPosition>, Option<bool>)> {
    match trim_kmark_quotes(value) {
        "show" => Some((None, Some(true))),
        "hide" => Some((None, Some(false))),
        value => parse_kmark_page_number_position_value(value).map(|position| {
            (
                Some(position),
                Some(!matches!(position, PageNumberPosition::None)),
            )
        }),
    }
}

fn parse_kmark_page_number_position_value(value: &str) -> Option<PageNumberPosition> {
    match trim_kmark_quotes(value) {
        "none" => Some(PageNumberPosition::None),
        "top-left" => Some(PageNumberPosition::TopLeft),
        "top-center" => Some(PageNumberPosition::TopCenter),
        "top-right" => Some(PageNumberPosition::TopRight),
        "bottom-left" => Some(PageNumberPosition::BottomLeft),
        "bottom-center" => Some(PageNumberPosition::BottomCenter),
        "bottom-right" => Some(PageNumberPosition::BottomRight),
        _ => None,
    }
}

fn parse_kmark_page_number_format_value(value: &str) -> Option<String> {
    let format = trim_kmark_quotes(value);

    (!format.is_empty()).then(|| format.replace("\\\"", "\"").replace("\\'", "'"))
}

fn parse_kmark_page_chrome_text_value(value: &str) -> Option<String> {
    let text = trim_kmark_quotes(value);

    text.chars()
        .all(|character| !character.is_control())
        .then(|| text.replace("\\\"", "\"").replace("\\'", "'"))
}

fn parse_kmark_positive_u32_value(value: &str) -> Option<u32> {
    let number = trim_kmark_quotes(value).parse::<u32>().ok()?;

    (number > 0).then_some(number)
}

fn parse_kmark_bool_value(value: &str) -> Option<bool> {
    match trim_kmark_quotes(value) {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

fn parse_kmark_page_number_style_value(value: &str) -> Option<PageNumberStyle> {
    match trim_kmark_quotes(value) {
        "decimal" => Some(PageNumberStyle::Decimal),
        "lower-roman" => Some(PageNumberStyle::LowerRoman),
        "upper-roman" => Some(PageNumberStyle::UpperRoman),
        "lower-alpha" => Some(PageNumberStyle::LowerAlpha),
        "upper-alpha" => Some(PageNumberStyle::UpperAlpha),
        _ => None,
    }
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

fn split_kmark_tokens(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut token = String::new();
    let mut quote = None;
    let mut escaped = false;

    for character in input.chars() {
        if escaped {
            token.push(character);
            escaped = false;
            continue;
        }

        if quote.is_some() && character == '\\' {
            token.push(character);
            escaped = true;
            continue;
        }

        if matches!(quote, Some(active_quote) if character == active_quote) {
            token.push(character);
            quote = None;
            continue;
        }

        if quote.is_none() && matches!(character, '"' | '\'') {
            token.push(character);
            quote = Some(character);
            continue;
        }

        if quote.is_none() && character.is_whitespace() {
            if !token.is_empty() {
                tokens.push(std::mem::take(&mut token));
            }
            continue;
        }

        token.push(character);
    }

    if !token.is_empty() {
        tokens.push(token);
    }

    tokens
}

fn split_kmark_param_pairs(input: &str) -> Vec<(String, String)> {
    let mut pairs: Vec<(String, String)> = Vec::new();

    for token in split_kmark_tokens(input) {
        if token.chars().all(|character| character == '}') {
            continue;
        }

        if let Some((key, value)) = token.split_once(':') {
            pairs.push((key.to_owned(), value.to_owned()));
            continue;
        }

        if let Some((_, value)) = pairs.last_mut() {
            if !value.is_empty() {
                value.push(' ');
            }
            value.push_str(&token);
        }
    }

    pairs
}

fn trim_kmark_quotes(value: &str) -> &str {
    let trimmed = value.trim();

    if trimmed.len() >= 2 {
        let mut chars = trimmed.chars();
        let Some(first) = chars.next() else {
            return trimmed;
        };
        let Some(last) = trimmed.chars().last() else {
            return trimmed;
        };

        if matches!(first, '"' | '\'') && first == last {
            return &trimmed[first.len_utf8()..trimmed.len() - last.len_utf8()];
        }
    }

    trimmed
}

fn parse_kmark_param_bundle(input: &str) -> KmarkParamBundle {
    parse_kmark_param_bundle_parts(input).1
}

fn parse_kmark_param_bundle_parts(input: &str) -> (Option<String>, KmarkParamBundle) {
    let mut define_name = None;
    let mut bundle = KmarkParamBundle::default();
    bundle.page_directive = parse_kmark_page_directive_tokens(input).unwrap_or_default();

    for (key, value) in split_kmark_param_pairs(input) {
        match key.as_str() {
            "define" => {
                if let Some(preset_name) = normalize_kmark_preset_name(&value) {
                    define_name = Some(preset_name);
                }
            }
            "use" => {
                if let Some(preset_name) = normalize_kmark_preset_name(&value) {
                    bundle.preset_use = Some(preset_name);
                }
            }
            "toc" => {
                if let Some(enabled) = parse_kmark_bool_value(&value) {
                    bundle.toc.enabled = Some(enabled);
                }
            }
            "toc_depth" => {
                if let Some(depth) = parse_kmark_toc_depth_value(&value) {
                    bundle.toc.max_depth = Some(depth);
                }
            }
            "toc_min_depth" => {
                if let Some(depth) = parse_kmark_toc_depth_value(&value) {
                    bundle.toc.min_depth = Some(depth);
                }
            }
            "toc_title" => {
                if let Some(title) = parse_kmark_toc_title_value(&value) {
                    bundle.toc.title = Some(title);
                }
            }
            "toc_ordered" => {
                if let Some(ordered) = parse_kmark_bool_value(&value) {
                    bundle.toc.ordered = Some(ordered);
                }
            }
            "toc_links" => {
                if let Some(links) = parse_kmark_bool_value(&value) {
                    bundle.toc.links = Some(links);
                }
            }
            "heading_number" => {
                if let Some(enabled) = parse_kmark_bool_value(&value) {
                    bundle.heading_number.enabled = Some(enabled);
                }
            }
            "heading_number_from" => {
                if let Some(from) = parse_kmark_heading_number_level_value(&value) {
                    bundle.heading_number.from = Some(from);
                }
            }
            "heading_number_depth" => {
                if let Some(depth) = parse_kmark_heading_number_level_value(&value) {
                    bundle.heading_number.depth = Some(depth);
                }
            }
            "heading_number_pattern" => {
                if let Some(pattern) = parse_kmark_heading_number_pattern_value(&value) {
                    bundle.heading_number.pattern = Some(pattern);
                }
            }
            "w" | "width" => {
                if let Some(width) = parse_kmark_size_value(&value) {
                    bundle.params.image.width = Some(width);
                }
            }
            "h" | "height" => {
                if let Some(height) = parse_kmark_size_value(&value) {
                    bundle.params.image.height = Some(height);
                }
            }
            "pos" => {
                if let Some(position) = parse_kmark_position_value(&value) {
                    bundle.params.image.position = Some(position);
                }
            }
            "border_size" => {
                if let Some(border_size) = parse_kmark_border_size_value(&value) {
                    bundle.params.image.border_size = Some(border_size);
                }
            }
            "border_color" => {
                if let Some(border_color) = parse_kmark_border_color_value(&value) {
                    bundle.params.image.border_color = Some(border_color);
                }
            }
            "border_style" => {
                if let Some(border_style) = parse_kmark_border_style_value(&value) {
                    bundle.params.image.border_style = Some(border_style);
                }
            }
            "radius" => {
                if let Some(radius) = parse_kmark_radius_value(&value) {
                    bundle.params.image.radius = Some(radius);
                }
            }
            "bg" | "background" => {
                if let Some(background) = parse_kmark_background_value(&value) {
                    bundle.params.image.background = Some(background);
                }
            }
            "opacity" => {
                if let Some(opacity) = parse_kmark_opacity_value(&value) {
                    bundle.params.image.opacity = Some(opacity);
                }
            }
            "rotate" => {
                if let Some(rotate) = parse_kmark_rotate_value(&value) {
                    bundle.params.image.rotate = Some(rotate);
                }
            }
            "shadow" => {
                if let Some(shadow) = parse_kmark_shadow_value(&value) {
                    bundle.params.image.shadow = Some(shadow);
                }
            }
            "margin" => {
                if let Some(margin) = parse_kmark_margin_value(&value) {
                    bundle.params.image.margin = Some(margin);
                }
            }
            "padding" => {
                if let Some(padding) = parse_kmark_padding_value(&value) {
                    bundle.params.image.padding = Some(padding);
                }
            }
            "color" => {
                if let Some(color) = parse_kmark_color_value(&value) {
                    bundle.params.text.color = Some(color);
                }
            }
            "font_size" => {
                if let Some(font_size) = parse_kmark_font_size_value(&value) {
                    bundle.params.text.font_size = Some(font_size);
                }
            }
            "font_weight" => {
                if let Some(font_weight) = parse_kmark_font_weight_value(&value) {
                    bundle.params.text.font_weight = Some(font_weight);
                }
            }
            "font_family" => {
                if let Some(font_family) = parse_kmark_font_family_value(&value) {
                    bundle.params.text.font_family = Some(font_family);
                }
            }
            "font_style" => {
                if let Some(font_style) = parse_kmark_font_style_value(&value) {
                    bundle.params.text.font_style = Some(font_style);
                }
            }
            "letter_spacing" => {
                if let Some(letter_spacing) = parse_kmark_letter_spacing_value(&value) {
                    bundle.params.text.letter_spacing = Some(letter_spacing);
                }
            }
            "line_height" => {
                if let Some(line_height) = parse_kmark_line_height_value(&value) {
                    bundle.params.text.line_height = Some(line_height);
                }
            }
            "table_cell_padding" => {
                if let Some((cell_padding_y, cell_padding_x)) =
                    parse_kmark_table_cell_padding_value(&value)
                {
                    bundle.params.table.cell_padding_y = Some(cell_padding_y);
                    bundle.params.table.cell_padding_x = Some(cell_padding_x);
                }
            }
            "table_cell_padding_x" => {
                if let Some(cell_padding_x) = parse_kmark_table_cell_padding_axis_value(&value) {
                    bundle.params.table.cell_padding_x = Some(cell_padding_x);
                }
            }
            "table_cell_padding_y" => {
                if let Some(cell_padding_y) = parse_kmark_table_cell_padding_axis_value(&value) {
                    bundle.params.table.cell_padding_y = Some(cell_padding_y);
                }
            }
            "table_fit" => {
                if let Some(fit) = parse_kmark_table_fit_value(&value) {
                    bundle.params.table.fit = Some(fit);
                }
            }
            "table_layout" => {
                if let Some(layout) = parse_kmark_table_layout_value(&value) {
                    bundle.params.table.layout = Some(layout);
                }
            }
            "layout" => {
                if let Some(layout) = parse_kmark_layout_value(&value) {
                    bundle.params.layout.layout = Some(layout);
                }
            }
            "align" => {
                if let Some(align) = parse_kmark_align_value(&value) {
                    bundle.params.layout.align = Some(align);
                }
            }
            "valign" => {
                if let Some(valign) = parse_kmark_valign_value(&value) {
                    bundle.params.layout.valign = Some(valign);
                }
            }
            "page_valign" => {
                if let Some(valign) = parse_kmark_page_valign_value(&value) {
                    bundle.params.page.valign = Some(valign);
                }
            }
            "gap" => {
                if let Some(gap) = parse_kmark_gap_value(&value) {
                    bundle.params.layout.gap = Some(gap);
                }
            }
            "wrap" => {
                if let Some(wrap) = parse_kmark_wrap_value(&value) {
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

fn parse_kmark_page_valign_value(value: &str) -> Option<KmarkPageValign> {
    match value.trim() {
        "top" => Some(KmarkPageValign::Top),
        "center" => Some(KmarkPageValign::Center),
        "bottom" => Some(KmarkPageValign::Bottom),
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

fn parse_kmark_toc_depth_value(value: &str) -> Option<u8> {
    let depth = trim_kmark_quotes(value).trim().parse::<u8>().ok()?;

    (1..=6).contains(&depth).then_some(depth)
}

fn parse_kmark_heading_number_level_value(value: &str) -> Option<u8> {
    let level = trim_kmark_quotes(value).trim().parse::<u8>().ok()?;

    (1..=HEADING_NUMBER_MAX_LEVEL)
        .contains(&level)
        .then_some(level)
}

fn parse_kmark_heading_number_pattern_value(value: &str) -> Option<KmarkHeadingNumberPattern> {
    match trim_kmark_quotes(value).trim() {
        "dot" => Some(KmarkHeadingNumberPattern::Dot),
        "dot_trailing" => Some(KmarkHeadingNumberPattern::DotTrailing),
        "hyphen" => Some(KmarkHeadingNumberPattern::Hyphen),
        "chapter" => Some(KmarkHeadingNumberPattern::Chapter),
        _ => None,
    }
}

fn parse_kmark_toc_title_value(value: &str) -> Option<String> {
    let title = trim_kmark_quotes(value);

    title
        .chars()
        .all(|character| !character.is_control())
        .then(|| title.replace("\\\"", "\"").replace("\\'", "'"))
}

fn parse_kmark_size_value(value: &str) -> Option<KmarkSizeValue> {
    match trim_kmark_quotes(value).trim() {
        "fit" => Some(KmarkSizeValue::Fit),
        "page_fit" => Some(KmarkSizeValue::PageFit),
        "page_fit_contain" => Some(KmarkSizeValue::PageFitContain),
        value => parse_css_length_value(value, true).map(KmarkSizeValue::Length),
    }
}

fn parse_kmark_border_size_value(value: &str) -> Option<String> {
    parse_css_length_value(value, false)
}

fn parse_kmark_radius_value(value: &str) -> Option<String> {
    parse_css_length_value(value, false)
}

fn parse_kmark_background_value(value: &str) -> Option<String> {
    parse_kmark_color_value(value)
}

fn parse_kmark_opacity_value(value: &str) -> Option<String> {
    let trimmed = trim_kmark_quotes(value).trim();
    let opacity = trimmed.parse::<f64>().ok()?;

    (0.0..=1.0).contains(&opacity).then(|| trimmed.to_owned())
}

fn parse_kmark_rotate_value(value: &str) -> Option<String> {
    let trimmed = trim_kmark_quotes(value).trim();

    if trimmed.parse::<f64>().is_ok() {
        return Some(format!("rotate({trimmed}deg)"));
    }

    for unit in ["deg", "rad", "turn"] {
        if let Some(number) = trimmed.strip_suffix(unit) {
            return number
                .parse::<f64>()
                .is_ok()
                .then(|| format!("rotate({trimmed})"));
        }
    }

    None
}

fn parse_kmark_shadow_value(value: &str) -> Option<String> {
    let trimmed = trim_kmark_quotes(value).trim();

    match trimmed {
        "true" | "md" => return Some("0 2px 8px #0003".to_owned()),
        "sm" => return Some("0 1px 3px #0002".to_owned()),
        "lg" => return Some("0 4px 16px #0004".to_owned()),
        "false" | "none" => return Some("none".to_owned()),
        _ => {}
    }

    parse_css_box_shadow_value(trimmed)
}

fn parse_kmark_margin_value(value: &str) -> Option<String> {
    parse_css_box_spacing_value(value, true)
}

fn parse_kmark_padding_value(value: &str) -> Option<String> {
    parse_css_box_spacing_value(value, false)
}

fn parse_kmark_font_size_value(value: &str) -> Option<String> {
    parse_css_length_value(value, false)
}

fn parse_kmark_font_weight_value(value: &str) -> Option<String> {
    let trimmed = trim_kmark_quotes(value).trim();

    if matches!(trimmed, "normal" | "bold" | "bolder" | "lighter") {
        return Some(trimmed.to_owned());
    }

    let weight = trimmed.parse::<u16>().ok()?;

    (matches!(weight, 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900))
        .then(|| trimmed.to_owned())
}

fn parse_kmark_font_family_value(value: &str) -> Option<String> {
    let trimmed = trim_kmark_quotes(value).trim();

    (!trimmed.is_empty()
        && trimmed.chars().all(|character| {
            !character.is_control() && !matches!(character, '\\' | ';' | '{' | '}' | '<' | '>')
        }))
    .then(|| trimmed.to_owned())
}

fn parse_kmark_font_style_value(value: &str) -> Option<String> {
    matches!(
        trim_kmark_quotes(value).trim(),
        "normal" | "italic" | "oblique"
    )
    .then(|| trim_kmark_quotes(value).trim().to_owned())
}

fn parse_kmark_letter_spacing_value(value: &str) -> Option<String> {
    parse_css_length_value(value, false)
}

fn parse_kmark_line_height_value(value: &str) -> Option<String> {
    let trimmed = trim_kmark_quotes(value).trim();

    if trimmed == "normal" {
        return Some(trimmed.to_owned());
    }

    if trimmed.parse::<f64>().is_ok() {
        return Some(trimmed.to_owned());
    }

    parse_css_length_value(trimmed, false)
}

fn parse_kmark_table_cell_padding_value(value: &str) -> Option<(String, String)> {
    let trimmed = trim_kmark_quotes(value).trim();
    let parts = trimmed.split_whitespace().collect::<Vec<_>>();

    match parts.as_slice() {
        [padding] => {
            let padding = parse_kmark_table_cell_padding_axis_value(padding)?;
            Some((padding.clone(), padding))
        }
        [padding_y, padding_x] => Some((
            parse_kmark_table_cell_padding_axis_value(padding_y)?,
            parse_kmark_table_cell_padding_axis_value(padding_x)?,
        )),
        _ => None,
    }
}

fn parse_kmark_table_cell_padding_axis_value(value: &str) -> Option<String> {
    parse_css_length_value(value, false)
}

fn parse_kmark_table_fit_value(value: &str) -> Option<KmarkTableFit> {
    match trim_kmark_quotes(value).trim() {
        "auto" => Some(KmarkTableFit::Auto),
        "off" => Some(KmarkTableFit::Off),
        "shrink" => Some(KmarkTableFit::Shrink),
        _ => None,
    }
}

fn parse_kmark_table_layout_value(value: &str) -> Option<KmarkTableLayout> {
    match trim_kmark_quotes(value).trim() {
        "auto" => Some(KmarkTableLayout::Auto),
        "fixed" => Some(KmarkTableLayout::Fixed),
        _ => None,
    }
}

fn parse_css_length_value(value: &str, allow_auto: bool) -> Option<String> {
    let trimmed = trim_kmark_quotes(value).trim();

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
        "px" | "%"
            | "em"
            | "rem"
            | "vw"
            | "vh"
            | "vmin"
            | "vmax"
            | "mm"
            | "cm"
            | "in"
            | "pt"
            | "pc"
    )
    .then(|| trimmed.to_owned())
}

fn parse_css_signed_length_value(value: &str, allow_unitless_zero: bool) -> Option<String> {
    let trimmed = trim_kmark_quotes(value).trim();

    if allow_unitless_zero && trimmed == "0" {
        return Some("0".to_owned());
    }

    let numeric_end = trimmed
        .find(|character: char| !character.is_ascii_digit() && character != '.' && character != '-')
        .unwrap_or(trimmed.len());

    if numeric_end == 0 || numeric_end == trimmed.len() {
        return None;
    }

    let number = &trimmed[..numeric_end];
    let unit = &trimmed[numeric_end..];

    if number.parse::<f64>().is_err() {
        return None;
    }

    matches!(unit, "px" | "em" | "rem" | "mm" | "cm" | "in" | "pt" | "pc")
        .then(|| trimmed.to_owned())
}

fn parse_css_box_spacing_value(value: &str, allow_auto: bool) -> Option<String> {
    let trimmed = trim_kmark_quotes(value).trim();
    let parts = trimmed.split_whitespace().collect::<Vec<_>>();

    if parts.is_empty() || parts.len() > 4 {
        return None;
    }

    let parsed = parts
        .iter()
        .map(|part| parse_css_length_value(part, allow_auto))
        .collect::<Option<Vec<_>>>()?;

    Some(parsed.join(" "))
}

fn parse_css_box_shadow_value(value: &str) -> Option<String> {
    let parts = value.split_whitespace().collect::<Vec<_>>();

    if parts.len() < 2 || parts.len() > 6 {
        return None;
    }

    let mut parsed = Vec::new();
    let mut length_count = 0usize;
    let mut color_count = 0usize;

    for part in parts {
        if part == "inset" && parsed.is_empty() {
            parsed.push(part.to_owned());
            continue;
        }

        if let Some(length) = parse_css_signed_length_value(part, true) {
            length_count += 1;
            parsed.push(length);
            continue;
        }

        if let Some(color) = parse_kmark_color_value(part) {
            color_count += 1;
            if color_count > 1 {
                return None;
            }
            parsed.push(color);
            continue;
        }

        return None;
    }

    (length_count >= 2).then(|| parsed.join(" "))
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
    parse_kmark_color_value(value)
}

fn parse_kmark_color_value(value: &str) -> Option<String> {
    let trimmed = trim_kmark_quotes(value).trim();

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

fn push_text_as_toc_heading_text(output: &mut String, text: &str) {
    let mut remaining = text;

    while let Some(line_break_index) = remaining.find("\\n") {
        let (before_line_break, after_before) = remaining.split_at(line_break_index);
        output.push_str(before_line_break);
        output.push(' ');
        remaining = &after_before["\\n".len()..];
    }

    output.push_str(remaining);
}

fn has_visible_markdown_text(text: &str) -> bool {
    let mut characters = text.chars().peekable();

    while let Some(character) = characters.next() {
        if character.is_whitespace() {
            continue;
        }

        if character == '\\' && characters.peek() == Some(&'n') {
            characters.next();
            continue;
        }

        return true;
    }

    false
}

fn is_html_line_break(html: &str) -> bool {
    let trimmed = html.trim();

    if !trimmed.starts_with('<') || !trimmed.ends_with('>') {
        return false;
    }

    let tag_body = trimmed[1..trimmed.len() - 1].trim();
    let tag_name = tag_body.strip_suffix('/').unwrap_or(tag_body).trim();

    tag_name.eq_ignore_ascii_case("br")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TableMergeMarker {
    None,
    Left,
    Up,
}

#[derive(Debug, Clone)]
struct HtmlTableBodyRow {
    open_tag: String,
    cells: Vec<HtmlTableBodyCell>,
}

#[derive(Debug, Clone)]
struct HtmlTableBodyCell {
    open_tag: String,
    content: String,
}

#[derive(Debug, Clone, Copy)]
struct TableCellSpan {
    owner: (usize, usize),
    hidden: bool,
    rowspan: usize,
    colspan: usize,
}

#[derive(Debug, Clone, Copy)]
struct TableCellBounds {
    min_row: usize,
    max_row: usize,
    min_col: usize,
    max_col: usize,
    count: usize,
}

fn collect_table_body_merge_markers(
    content: &str,
    line_starts: &[usize],
    table_source_start: usize,
) -> Option<Vec<Vec<TableMergeMarker>>> {
    let mut line_index = resolve_line_number(line_starts, table_source_start);
    let mut table_lines = Vec::new();

    while let Some(line) = source_line_text(content, line_starts, line_index) {
        if !has_table_delimiter_pipe(line) {
            break;
        }
        table_lines.push(line);
        line_index += 1;
    }

    if table_lines.len() < 3 {
        return None;
    }

    Some(
        table_lines[2..]
            .iter()
            .map(|line| {
                split_table_cells(line)
                    .into_iter()
                    .map(|cell| match cell.as_str() {
                        "<" => TableMergeMarker::Left,
                        "^" => TableMergeMarker::Up,
                        _ => TableMergeMarker::None,
                    })
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>(),
    )
}

fn source_line_text<'a>(
    content: &'a str,
    line_starts: &[usize],
    line_index: usize,
) -> Option<&'a str> {
    let start = *line_starts.get(line_index)?;
    let end = line_starts
        .get(line_index + 1)
        .copied()
        .unwrap_or(content.len());
    let line = &content[start..end];
    let line = line.strip_suffix('\n').unwrap_or(line);
    let line = line.strip_suffix('\r').unwrap_or(line);

    Some(line)
}

fn render_table_with_body_merges(
    table_html: &str,
    markers: &[Vec<TableMergeMarker>],
) -> Option<String> {
    let tbody_open = "<tbody>";
    let tbody_close = "</tbody>";
    let tbody_start = table_html.find(tbody_open)? + tbody_open.len();
    let tbody_end = table_html.rfind(tbody_close)?;
    if tbody_start > tbody_end {
        return None;
    }

    let mut rows = parse_html_table_body_rows(&table_html[tbody_start..tbody_end])?;
    if rows.is_empty() {
        return None;
    }
    apply_table_body_merges(&mut rows, markers)?;

    let mut html = String::with_capacity(table_html.len());
    html.push_str(&table_html[..tbody_start]);
    for row in rows {
        html.push_str(&row.open_tag);
        for cell in row.cells {
            html.push_str(&cell.open_tag);
            html.push_str(&cell.content);
            html.push_str("</td>");
        }
        html.push_str("</tr>");
    }
    html.push_str(&table_html[tbody_end..]);

    Some(html)
}

fn parse_html_table_body_rows(body_html: &str) -> Option<Vec<HtmlTableBodyRow>> {
    let mut rows = Vec::new();
    let mut rest = body_html;

    while !rest.is_empty() {
        if rest.trim().is_empty() {
            break;
        }

        let tr_start = rest.find("<tr")?;
        if !rest[..tr_start].trim().is_empty() {
            return None;
        }

        let tr_open_end = tr_start + rest[tr_start..].find('>')?;
        let tr_content_start = tr_open_end + 1;
        let tr_close = tr_content_start + rest[tr_content_start..].find("</tr>")?;
        let row_html = &rest[tr_content_start..tr_close];

        rows.push(HtmlTableBodyRow {
            open_tag: rest[tr_start..=tr_open_end].to_owned(),
            cells: parse_html_table_body_cells(row_html)?,
        });

        rest = &rest[tr_close + "</tr>".len()..];
    }

    Some(rows)
}

fn parse_html_table_body_cells(row_html: &str) -> Option<Vec<HtmlTableBodyCell>> {
    let mut cells = Vec::new();
    let mut rest = row_html;

    while !rest.is_empty() {
        if rest.trim().is_empty() {
            break;
        }

        let td_start = rest.find("<td")?;
        if !rest[..td_start].trim().is_empty() {
            return None;
        }

        let td_open_end = td_start + rest[td_start..].find('>')?;
        let td_content_start = td_open_end + 1;
        let td_close = td_content_start + rest[td_content_start..].find("</td>")?;

        cells.push(HtmlTableBodyCell {
            open_tag: rest[td_start..=td_open_end].to_owned(),
            content: rest[td_content_start..td_close].to_owned(),
        });

        rest = &rest[td_close + "</td>".len()..];
    }

    Some(cells)
}

fn apply_table_body_merges(
    rows: &mut [HtmlTableBodyRow],
    markers: &[Vec<TableMergeMarker>],
) -> Option<()> {
    let mut spans = rows
        .iter()
        .enumerate()
        .map(|(row_index, row)| {
            (0..row.cells.len())
                .map(|column_index| TableCellSpan {
                    owner: (row_index, column_index),
                    hidden: false,
                    rowspan: 1,
                    colspan: 1,
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    for row_index in 0..spans.len() {
        for column_index in 0..spans[row_index].len() {
            let marker = markers
                .get(row_index)
                .and_then(|row| row.get(column_index))
                .copied()
                .unwrap_or(TableMergeMarker::None);

            match marker {
                TableMergeMarker::None => {}
                TableMergeMarker::Left => {
                    if column_index == 0 {
                        continue;
                    }
                    let owner = spans[row_index][column_index - 1].owner;
                    spans[row_index][column_index].owner = owner;
                    spans[row_index][column_index].hidden = true;
                }
                TableMergeMarker::Up => {
                    if row_index == 0 || column_index >= spans[row_index - 1].len() {
                        continue;
                    }
                    let owner = spans[row_index - 1][column_index].owner;
                    spans[row_index][column_index].owner = owner;
                    spans[row_index][column_index].hidden = true;
                }
            }
        }
    }

    let mut bounds_by_owner: HashMap<(usize, usize), TableCellBounds> = HashMap::new();
    for (row_index, row) in spans.iter().enumerate() {
        for (column_index, span) in row.iter().enumerate() {
            bounds_by_owner
                .entry(span.owner)
                .and_modify(|bounds| {
                    bounds.min_row = bounds.min_row.min(row_index);
                    bounds.max_row = bounds.max_row.max(row_index);
                    bounds.min_col = bounds.min_col.min(column_index);
                    bounds.max_col = bounds.max_col.max(column_index);
                    bounds.count += 1;
                })
                .or_insert(TableCellBounds {
                    min_row: row_index,
                    max_row: row_index,
                    min_col: column_index,
                    max_col: column_index,
                    count: 1,
                });
        }
    }

    for (owner, bounds) in &bounds_by_owner {
        if bounds.count == 1 {
            continue;
        }

        for row_index in bounds.min_row..=bounds.max_row {
            for column_index in bounds.min_col..=bounds.max_col {
                if spans
                    .get(row_index)
                    .and_then(|row| row.get(column_index))
                    .map(|span| span.owner)
                    != Some(*owner)
                {
                    return None;
                }
            }
        }

        let owner_span = spans.get_mut(owner.0)?.get_mut(owner.1)?;
        owner_span.rowspan = bounds.max_row - bounds.min_row + 1;
        owner_span.colspan = bounds.max_col - bounds.min_col + 1;
    }

    for (row_index, row) in rows.iter_mut().enumerate() {
        let mut visible_cells = Vec::with_capacity(row.cells.len());
        for (column_index, cell) in row.cells.drain(..).enumerate() {
            let span = spans[row_index][column_index];
            if span.hidden {
                continue;
            }

            visible_cells.push(HtmlTableBodyCell {
                open_tag: table_body_cell_open_tag_with_span(
                    &cell.open_tag,
                    span.rowspan,
                    span.colspan,
                )?,
                content: cell.content,
            });
        }
        row.cells = visible_cells;
    }

    Some(())
}

fn table_body_cell_open_tag_with_span(
    open_tag: &str,
    rowspan: usize,
    colspan: usize,
) -> Option<String> {
    if rowspan <= 1 && colspan <= 1 {
        return Some(open_tag.to_owned());
    }

    let insert_position = open_tag.rfind('>')?;
    let mut tag = String::with_capacity(open_tag.len() + 28);
    tag.push_str(&open_tag[..insert_position]);
    if rowspan > 1 {
        tag.push_str(" rowspan=\"");
        tag.push_str(&rowspan.to_string());
        tag.push('"');
    }
    if colspan > 1 {
        tag.push_str(" colspan=\"");
        tag.push_str(&colspan.to_string());
        tag.push('"');
    }
    tag.push_str(&open_tag[insert_position..]);

    Some(tag)
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
        resolve_image_destination_url, CssLength, PageNumberPosition, PageNumberStyle,
    };

    fn extract_toc_html(html: &str) -> &str {
        let start = html
            .find("<nav class=\"kmark-toc")
            .expect("toc start missing");
        let end = html[start..].find("</nav>").expect("toc end missing") + start + "</nav>".len();

        &html[start..end]
    }

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
    fn renders_kmark_toc_from_following_headings_across_page_breaks() {
        let rendered_preview = render_markdown_preview(
            "# Before\n\n\
             <!-- kmark toc:true -->\n\n\
             ## First\n\n\
             <!-- --- -->\n\
             ### Child\n\n\
             # Later",
        );

        let toc_html = extract_toc_html(&rendered_preview.html);

        assert_eq!(rendered_preview.pages.len(), 2);
        assert!(toc_html.contains("<div class=\"kmark-toc__title\">目次</div>"));
        assert!(toc_html.contains("href=\"#kmark-heading-5\""));
        assert!(toc_html.contains("href=\"#kmark-heading-8\""));
        assert!(toc_html.contains("href=\"#kmark-heading-10\""));
        assert!(toc_html.contains(">First</a>"));
        assert!(toc_html.contains(">Child</a>"));
        assert!(toc_html.contains(">Later</a>"));
        assert!(!toc_html.contains("Before"));
        assert!(rendered_preview
            .html
            .contains("<h2 data-source-line-start=\"4\" data-source-line-end=\"4\" id=\"kmark-heading-5\">First</h2>"));
        assert!(rendered_preview
            .html
            .contains("<h3 data-source-line-start=\"7\" data-source-line-end=\"7\" id=\"kmark-heading-8\">Child</h3>"));
    }

    #[test]
    fn keeps_kmark_toc_as_rendered_page_content_before_page_break() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark toc:true -->\n<!-- --- -->\n# Later");

        assert_eq!(rendered_preview.pages.len(), 2);
        assert!(rendered_preview.page_htmls[0].contains("<nav class=\"kmark-toc\""));
        assert!(rendered_preview.page_htmls[0].contains("href=\"#kmark-heading-3\""));
        assert!(rendered_preview.page_htmls[1].contains(
            "<h1 data-source-line-start=\"2\" data-source-line-end=\"2\" id=\"kmark-heading-3\">Later</h1>"
        ));
    }

    #[test]
    fn renders_kmark_toc_depth_title_ordered_and_link_options() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark toc:true toc_min_depth:2 toc_depth:3 toc_title:\"\" toc_ordered:true toc_links:false -->\n\
             # One\n\
             ## Two\n\
             #### Four\n\
             ### Three",
        );
        let toc_html = extract_toc_html(&rendered_preview.html);

        assert!(!toc_html.contains("kmark-toc__title"));
        assert!(toc_html.contains("<ol class=\"kmark-toc__list\">"));
        assert!(!toc_html.contains("href="));
        assert!(toc_html.contains(">Two</span>"));
        assert!(toc_html.contains(">Three</span>"));
        assert!(!toc_html.contains("One"));
        assert!(!toc_html.contains("Four"));
        assert!(!rendered_preview.html.contains("id=\"kmark-heading-"));
    }

    #[test]
    fn applies_kmark_toc_root_decoration_without_affecting_next_block() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark toc:true w:80% align:center -->\n\
             # Title\n\n\
             Body",
        );
        let toc_html = extract_toc_html(&rendered_preview.html);

        assert!(toc_html
            .contains("style=\"width:80%;margin-left:auto;margin-right:auto;text-align:center\""));
        assert!(rendered_preview
            .html
            .contains("<h1 data-source-line-start=\"1\" data-source-line-end=\"1\" id=\"kmark-heading-2\">Title</h1>"));
        assert!(!rendered_preview.html.contains("<h1 data-source-line-start=\"1\" data-source-line-end=\"1\" id=\"kmark-heading-2\" style="));
    }

    #[test]
    fn preserves_explicit_heading_id_in_kmark_toc() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark toc:true -->\n# Manual {#manual}\n## Auto");
        let toc_html = extract_toc_html(&rendered_preview.html);

        assert!(toc_html.contains("href=\"#manual\""));
        assert!(toc_html.contains("href=\"#kmark-heading-3\""));
        assert!(rendered_preview.html.contains(
            "<h1 data-source-line-start=\"1\" data-source-line-end=\"1\" id=\"manual\">Manual</h1>"
        ));
    }

    #[test]
    fn renders_heading_numbers_in_kmark_toc_labels() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark toc:true toc_min_depth:2 toc_depth:3 -->\n\
             <!-- kmark heading_number:true heading_number_from:2 heading_number_depth:3 heading_number_pattern:dot -->\n\
             <!-- kmark { -->\n\n\
             # Title\n\
             ## Overview\n\
             ### Detail\n\
             <!-- kmark } -->",
        );
        let toc_html = extract_toc_html(&rendered_preview.html);

        assert!(toc_html.contains("><span class=\"kmark-heading-number\">1.</span>Overview</a>"));
        assert!(toc_html.contains("><span class=\"kmark-heading-number\">1.1</span>Detail</a>"));
        assert!(!toc_html.contains("Title"));
    }

    #[test]
    fn applies_unclosed_scope_page_settings_and_nested_overrides() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_size:A4 page_orientation:portrait page_margin:12mm page_font_size:11pt -->\n\
             # 1\n\
             <!-- --- -->\n\
             <!-- kmark { page_orientation:landscape page_font_size:9pt page_margin:8mm -->\n\
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
            "<!-- kmark { page_width:297mm page_height:210mm page_margin:8mm page_font_size:10pt -->\n\
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
    fn keeps_single_block_font_size_out_of_page_directives() {
        let rendered_preview = render_markdown_preview(
            "# Title\n\n\
             <!-- kmark color:#c00000 font_size:14pt font_weight:bold -->\n\
             社外秘 paragraph\n\n\
             <!-- kmark color:#0b3d91 font_size:18pt align:center -->\n\
             # CONFIDENTIAL heading",
        );

        assert_eq!(rendered_preview.pages.len(), 1);
        assert_eq!(
            rendered_preview.pages[0].text_style.font_size.as_str(),
            "10.5pt"
        );
        assert!(rendered_preview.html.contains(
            "style=\"display:table;width:fit-content;max-width:100%;box-sizing:border-box;color:#c00000;font-size:14pt;font-weight:bold;\""
        ));
        assert!(rendered_preview.html.contains(
            "style=\"display:table;width:fit-content;max-width:100%;box-sizing:border-box;margin-left:auto;margin-right:auto;color:#0b3d91;font-size:18pt;text-align:center\""
        ));
    }

    #[test]
    fn keeps_scope_font_size_as_text_decoration_not_page_font_size() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { color:#c00000 font_size:16pt -->\n\
             # Body\n\
             <!-- kmark } -->",
        );

        assert_eq!(rendered_preview.pages.len(), 1);
        assert_eq!(
            rendered_preview.pages[0].text_style.font_size.as_str(),
            "10.5pt"
        );
        assert!(rendered_preview.html.contains("font-size:16pt"));
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
    fn accepts_page_directives_used_by_completion() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_size:A4 orientation:landscape page_margin:15mm page_font_size:12pt } -->\n\
             # Alias",
        );

        assert_eq!(rendered_preview.pages[0].page_style.width.as_str(), "297mm");
        assert_eq!(
            rendered_preview.pages[0].page_style.height.as_str(),
            "210mm"
        );
        assert_eq!(
            rendered_preview.pages[0].page_style.margin_top.as_str(),
            "15mm"
        );
        assert_eq!(
            rendered_preview.pages[0].text_style.font_size.as_str(),
            "12pt"
        );
    }

    #[test]
    fn applies_standalone_page_font_size_to_following_pages() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_font_size:12pt -->\n\
             \n\
             # First\n\
             <!-- --- -->\n\
             # Second",
        );

        assert_eq!(rendered_preview.pages.len(), 2);
        for page in &rendered_preview.pages {
            assert_eq!(page.text_style.font_size.as_str(), "12pt");
        }
    }

    #[test]
    fn applies_standalone_page_font_families_to_following_pages() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_font_family:\"游ゴシック\" page_heading_font_family:\"Noto Serif JP\" -->\n\
             # First\n\
             <!-- --- -->\n\
             # Second",
        );

        assert_eq!(rendered_preview.pages.len(), 2);
        for page in &rendered_preview.pages {
            assert_eq!(page.text_style.font_family.as_str(), "游ゴシック");
            assert_eq!(
                page.text_style.heading_font_family.as_str(),
                "Noto Serif JP"
            );
        }
    }

    #[test]
    fn leaves_page_heading_font_family_empty_to_inherit_body_font() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark page_font_family:\"Yu Gothic\" -->\n# First");

        assert_eq!(
            rendered_preview.pages[0].text_style.font_family.as_str(),
            "Yu Gothic"
        );
        assert_eq!(
            rendered_preview.pages[0]
                .text_style
                .heading_font_family
                .as_str(),
            ""
        );
    }

    #[test]
    fn keeps_block_font_family_out_of_page_directives() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark font_family:\"Yu Gothic\" -->\nBody");

        assert_eq!(
            rendered_preview.pages[0].text_style.font_family.as_str(),
            "BIZ UDPGothic"
        );
        assert_eq!(
            rendered_preview.pages[0]
                .text_style
                .heading_font_family
                .as_str(),
            ""
        );
        assert!(rendered_preview.html.contains("font-family:Yu Gothic"));
    }

    #[test]
    fn applies_page_number_config_from_scope() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_number:bottom-right page_number_format:\"Page {page} / {total}\" page_number_reset:true page_number_start:3 page_number_style:lower-roman page_number_font_size:9pt page_number_color:#666 page_number_margin_bottom:6mm page_number_margin_right:10mm -->\n\
             # Body",
        );
        let page_number = &rendered_preview.pages[0].page_number_config;

        assert_eq!(page_number.position, PageNumberPosition::BottomRight);
        assert_eq!(page_number.format, "Page {page} / {total}");
        assert_eq!(page_number.start, 3);
        assert!(page_number.reset);
        assert!(page_number.count);
        assert!(page_number.visible);
        assert_eq!(page_number.style, PageNumberStyle::LowerRoman);
        assert_eq!(page_number.font_size.as_str(), "9pt");
        assert_eq!(page_number.color, "#666");
        assert_eq!(page_number.margin_bottom.as_str(), "6mm");
        assert_eq!(page_number.margin_right.as_str(), "10mm");
    }

    #[test]
    fn enables_page_header_from_center_text_without_explicit_flag() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark page_header_center:\"社外秘\" -->\n# Body");
        let header = &rendered_preview.pages[0].page_chrome_config.header;

        assert!(header.enabled);
        assert_eq!(header.left.as_deref(), None);
        assert_eq!(header.center.as_deref(), Some("社外秘"));
        assert_eq!(header.right.as_deref(), None);
    }

    #[test]
    fn ignores_regular_html_comments_before_page_directives_when_splitting_pages() {
        let rendered_preview = render_markdown_preview(
            "<!-- header -->\n\
             <!-- kmark page_header_right:\"Secret\" page_font_size:9pt -->\n\
             # Body",
        );

        assert_eq!(rendered_preview.pages.len(), 1);
        assert_eq!(
            rendered_preview.pages[0].html,
            "<h1 data-source-line-start=\"2\" data-source-line-end=\"2\">Body</h1>"
        );
        assert_eq!(
            rendered_preview.pages[0]
                .page_chrome_config
                .header
                .right
                .as_deref(),
            Some("Secret")
        );
        assert_eq!(
            rendered_preview.pages[0].text_style.font_size.as_str(),
            "9pt"
        );
    }

    #[test]
    fn applies_page_header_and_footer_slots() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_header_left:\"HL\" page_header_center:\"HC\" page_header_right:\"HR\" page_footer_left:\"FL\" page_footer_center:\"FC\" page_footer_right:\"FR\" -->\n# Body",
        );
        let chrome = &rendered_preview.pages[0].page_chrome_config;

        assert!(chrome.header.enabled);
        assert_eq!(chrome.header.left.as_deref(), Some("HL"));
        assert_eq!(chrome.header.center.as_deref(), Some("HC"));
        assert_eq!(chrome.header.right.as_deref(), Some("HR"));
        assert!(chrome.footer.enabled);
        assert_eq!(chrome.footer.left.as_deref(), Some("FL"));
        assert_eq!(chrome.footer.center.as_deref(), Some("FC"));
        assert_eq!(chrome.footer.right.as_deref(), Some("FR"));
    }

    #[test]
    fn applies_page_chrome_opacity_and_margin_offsets() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_header_center:\"Header\" page_header_opacity:0.45 page_header_offset:5mm page_footer_right:\"Footer\" page_footer_opacity:0.7 page_footer_offset:6mm -->\n# Body",
        );
        let chrome = &rendered_preview.pages[0].page_chrome_config;

        assert_eq!(chrome.header.opacity.as_str(), "0.45");
        assert_eq!(
            chrome.header.offset.as_ref().map(CssLength::as_str),
            Some("5mm")
        );
        assert_eq!(chrome.footer.opacity.as_str(), "0.7");
        assert_eq!(
            chrome.footer.offset.as_ref().map(CssLength::as_str),
            Some("6mm")
        );
    }

    #[test]
    fn applies_page_chrome_border_and_font_styles() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_header_center:\"Header\" page_header_border_size:1px page_header_border_color:#999 page_header_border_style:dashed page_header_font_size:9pt page_header_font_family:\"Yu Gothic\" page_header_font_color:#333 page_header_padding:1mm 2mm page_footer_right:\"Footer\" page_footer_border_size:2px page_footer_border_color:red page_footer_border_style:double page_footer_font_size:8pt page_footer_font_family:\"Noto Sans\" page_footer_font_color:blue page_footer_padding:0.2em 0.6em -->\n# Body",
        );
        let chrome = &rendered_preview.pages[0].page_chrome_config;

        assert_eq!(chrome.header.border_size.as_deref(), Some("1px"));
        assert_eq!(chrome.header.border_color.as_deref(), Some("#999"));
        assert_eq!(chrome.header.border_style.as_deref(), Some("dashed"));
        assert_eq!(chrome.header.font_size.as_deref(), Some("9pt"));
        assert_eq!(chrome.header.font_family.as_deref(), Some("Yu Gothic"));
        assert_eq!(chrome.header.font_color.as_deref(), Some("#333"));
        assert_eq!(chrome.header.padding.as_deref(), Some("1mm 2mm"));
        assert_eq!(chrome.footer.border_size.as_deref(), Some("2px"));
        assert_eq!(chrome.footer.border_color.as_deref(), Some("red"));
        assert_eq!(chrome.footer.border_style.as_deref(), Some("double"));
        assert_eq!(chrome.footer.font_size.as_deref(), Some("8pt"));
        assert_eq!(chrome.footer.font_family.as_deref(), Some("Noto Sans"));
        assert_eq!(chrome.footer.font_color.as_deref(), Some("blue"));
        assert_eq!(chrome.footer.padding.as_deref(), Some("0.2em 0.6em"));
    }

    #[test]
    fn ignores_invalid_page_chrome_opacity_and_margin_offsets() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_header_center:\"Header\" page_header_opacity:2 page_header_offset:auto page_footer_right:\"Footer\" page_footer_opacity:-1 page_footer_offset:none -->\n# Body",
        );
        let chrome = &rendered_preview.pages[0].page_chrome_config;

        assert_eq!(chrome.header.opacity.as_str(), "1");
        assert_eq!(chrome.header.offset.as_ref().map(CssLength::as_str), None);
        assert_eq!(chrome.footer.opacity.as_str(), "1");
        assert_eq!(chrome.footer.offset.as_ref().map(CssLength::as_str), None);
    }

    #[test]
    fn limits_page_chrome_to_kmark_scope() {
        let rendered_preview = render_markdown_preview(
            "# Before\n\
             <!-- --- -->\n\
             <!-- kmark page_header_center:\"Scoped\" -->\n\
             <!-- kmark page_footer_right:\"Internal\" -->\n\
             <!-- kmark { -->\n\
             # Inside\n\
             <!-- kmark } -->\n\
             <!-- --- -->\n\
             # After",
        );

        assert_eq!(rendered_preview.pages.len(), 3);
        assert!(!rendered_preview.pages[0].page_chrome_config.header.enabled);
        assert_eq!(
            rendered_preview.pages[1]
                .page_chrome_config
                .header
                .center
                .as_deref(),
            Some("Scoped")
        );
        assert_eq!(
            rendered_preview.pages[1]
                .page_chrome_config
                .footer
                .right
                .as_deref(),
            Some("Internal")
        );
        assert!(!rendered_preview.pages[2].page_chrome_config.header.enabled);
        assert!(!rendered_preview.pages[2].page_chrome_config.footer.enabled);
    }

    #[test]
    fn restores_outer_page_header_after_nested_scope() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_header_center:\"共通\" -->\n\
             <!-- kmark { -->\n\
             # Outer\n\
             <!-- --- -->\n\
             <!-- kmark page_header_center:\"補足\" -->\n\
             <!-- kmark { -->\n\
             # Inner\n\
             <!-- kmark } -->\n\
             <!-- --- -->\n\
             # Outer Again\n\
             <!-- kmark } -->",
        );

        assert_eq!(rendered_preview.pages.len(), 3);
        assert_eq!(
            rendered_preview.pages[0]
                .page_chrome_config
                .header
                .center
                .as_deref(),
            Some("共通")
        );
        assert_eq!(
            rendered_preview.pages[1]
                .page_chrome_config
                .header
                .center
                .as_deref(),
            Some("補足")
        );
        assert_eq!(
            rendered_preview.pages[2]
                .page_chrome_config
                .header
                .center
                .as_deref(),
            Some("共通")
        );
    }

    #[test]
    fn page_header_and_footer_false_clear_previous_slots() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_header_center:\"Secret\" page_footer_right:\"Hidden\" -->\n\
             # First\n\
             <!-- --- -->\n\
             <!-- kmark page_header:false page_footer:false -->\n\
             # Second",
        );

        assert_eq!(rendered_preview.pages.len(), 2);
        assert!(rendered_preview.pages[0].page_chrome_config.header.enabled);
        assert!(rendered_preview.pages[0].page_chrome_config.footer.enabled);
        assert!(!rendered_preview.pages[1].page_chrome_config.header.enabled);
        assert_eq!(
            rendered_preview.pages[1]
                .page_chrome_config
                .header
                .center
                .as_deref(),
            None
        );
        assert!(!rendered_preview.pages[1].page_chrome_config.footer.enabled);
        assert_eq!(
            rendered_preview.pages[1]
                .page_chrome_config
                .footer
                .right
                .as_deref(),
            None
        );
    }

    #[test]
    fn keeps_page_number_config_independent_from_page_chrome() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_number:bottom-center page_header_center:\"Secret\" -->\n# Body",
        );
        let page = &rendered_preview.pages[0];

        assert_eq!(
            page.page_number_config.position,
            PageNumberPosition::BottomCenter
        );
        assert_eq!(
            page.page_chrome_config.header.center.as_deref(),
            Some("Secret")
        );
    }

    #[test]
    fn ignores_page_chrome_keys_inside_multiline_html_comments() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_header_center:\"Hidden\"\n\
             -->\n\
             # Body",
        );
        let header = &rendered_preview.pages[0].page_chrome_config.header;

        assert!(!header.enabled);
        assert_eq!(header.center.as_deref(), None);
    }

    #[test]
    fn applies_standalone_page_number_font_size_to_following_pages() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_number:show page_number_format:\"{page}\" page_number_font_size:12pt -->\n\
             \n\
             # First\n\
             <!-- --- -->\n\
             # Second",
        );

        assert_eq!(rendered_preview.pages.len(), 2);
        for page in &rendered_preview.pages {
            assert_eq!(
                page.page_number_config.position,
                PageNumberPosition::BottomCenter
            );
            assert!(page.page_number_config.visible);
            assert_eq!(page.page_number_config.font_size.as_str(), "12pt");
            assert_eq!(page.text_style.font_size.as_str(), "10.5pt");
        }
    }

    #[test]
    fn keeps_page_number_font_size_separate_from_page_font_size() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_number:show page_font_size:16pt page_number_font_size:8pt -->\n\
             # Body",
        );
        let page = &rendered_preview.pages[0];

        assert_eq!(page.text_style.font_size.as_str(), "16pt");
        assert_eq!(page.page_number_config.font_size.as_str(), "8pt");
    }

    #[test]
    fn keeps_page_number_font_size_across_hide_and_show() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_number:show page_number_font_size:10pt -->\n\
             # First\n\
             <!-- --- -->\n\
             <!-- kmark page_number:hide -->\n\
             # Second\n\
             <!-- --- -->\n\
             <!-- kmark page_number:show -->\n\
             # Third",
        );

        assert_eq!(rendered_preview.pages.len(), 3);
        assert!(rendered_preview.pages[0].page_number_config.visible);
        assert_eq!(
            rendered_preview.pages[0]
                .page_number_config
                .font_size
                .as_str(),
            "10pt"
        );
        assert!(!rendered_preview.pages[1].page_number_config.visible);
        assert_eq!(
            rendered_preview.pages[1]
                .page_number_config
                .font_size
                .as_str(),
            "10pt"
        );
        assert_eq!(
            rendered_preview.pages[1].page_number_config.position,
            PageNumberPosition::BottomCenter
        );
        assert!(rendered_preview.pages[2].page_number_config.visible);
        assert_eq!(
            rendered_preview.pages[2]
                .page_number_config
                .font_size
                .as_str(),
            "10pt"
        );
        assert_eq!(
            rendered_preview.pages[2].page_number_config.position,
            PageNumberPosition::BottomCenter
        );
    }

    #[test]
    fn falls_back_to_default_for_invalid_page_number_font_size() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_number:show page_number_font_size:large -->\n# Body",
        );
        let page_number = &rendered_preview.pages[0].page_number_config;

        assert_eq!(page_number.position, PageNumberPosition::BottomCenter);
        assert_eq!(page_number.font_size.as_str(), "10pt");
    }

    #[test]
    fn ignores_kmark_keys_inside_multiline_html_comments() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark {\n\
             page_number:show\n\
             page_number_font_size:18pt\n\
             } -->\n\
             # Body",
        );
        let page_number = &rendered_preview.pages[0].page_number_config;

        assert_eq!(page_number.position, PageNumberPosition::None);
        assert_eq!(page_number.font_size.as_str(), "10pt");
    }

    #[test]
    fn applies_separated_page_directives_to_following_scope() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_size:A5 -->\n\
             <!-- kmark page_orientation:landscape -->\n\
             <!-- kmark page_width:120mm -->\n\
             <!-- kmark page_height:90mm -->\n\
             <!-- kmark page_margin:12mm -->\n\
             <!-- kmark page_margin_left:7mm -->\n\
             <!-- kmark page_font_size:9pt -->\n\
             <!-- kmark page_number:bottom-center -->\n\
             <!-- kmark page_number_format:\"Page {page}\" -->\n\
             <!-- kmark page_number_reset:true -->\n\
             <!-- kmark page_number_start:4 -->\n\
             <!-- kmark page_number_count:false -->\n\
             <!-- kmark page_number_visible:false -->\n\
             <!-- kmark page_number_style:upper-alpha -->\n\
             <!-- kmark page_number_font_size:8pt -->\n\
             <!-- kmark page_number_color:\"#777\" -->\n\
             <!-- kmark page_number_margin_top:3mm -->\n\
             <!-- kmark page_number_margin_bottom:4mm -->\n\
             <!-- kmark page_number_margin_left:5mm -->\n\
             <!-- kmark page_number_margin_right:6mm -->\n\
             <!-- kmark { -->\n\
             # Body",
        );
        let page = &rendered_preview.pages[0];
        let page_number = &page.page_number_config;

        assert_eq!(page.page_style.width.as_str(), "120mm");
        assert_eq!(page.page_style.height.as_str(), "90mm");
        assert_eq!(page.page_style.margin_top.as_str(), "12mm");
        assert_eq!(page.page_style.margin_left.as_str(), "7mm");
        assert_eq!(page.text_style.font_size.as_str(), "9pt");
        assert_eq!(page_number.position, PageNumberPosition::BottomCenter);
        assert_eq!(page_number.format, "Page {page}");
        assert_eq!(page_number.start, 4);
        assert!(page_number.reset);
        assert!(!page_number.count);
        assert!(!page_number.visible);
        assert_eq!(page_number.style, PageNumberStyle::UpperAlpha);
        assert_eq!(page_number.font_size.as_str(), "8pt");
        assert_eq!(page_number.color, "#777");
        assert_eq!(page_number.margin_top.as_str(), "3mm");
        assert_eq!(page_number.margin_bottom.as_str(), "4mm");
        assert_eq!(page_number.margin_left.as_str(), "5mm");
        assert_eq!(page_number.margin_right.as_str(), "6mm");
    }

    #[test]
    fn keeps_page_number_reset_only_on_scope_start_segment() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_number:bottom-center page_number_reset:true -->\n\
             # First\n\
             <!-- --- -->\n\
             # Second",
        );

        assert!(rendered_preview.pages[0].page_number_config.reset);
        assert!(!rendered_preview.pages[1].page_number_config.reset);
    }

    #[test]
    fn keeps_separated_scope_block_params_across_page_breaks() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:200 -->\n\
             <!-- kmark align:right -->\n\
             <!-- kmark { -->\n\
             ![](a.png)\n\
             <!-- --- -->\n\
             ![](b.png)\n\
             <!-- kmark } -->",
        );

        assert_eq!(rendered_preview.pages.len(), 2);
        for page in &rendered_preview.pages {
            assert!(page.html.contains("align-items:flex-end"));
            assert!(page.html.contains("width:200px;"));
        }
    }

    #[test]
    fn does_not_split_nested_layout_scopes_when_document_header_scope_is_prefixed() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { -->\n\
             # Previous\n\
             <!-- --- -->\n\
             <!-- kmark { layout:row -->\n\
             <!-- kmark { layout:column margin:1px -->\n\
             #### Synthetic section Alpha\n\
             ![h:210](alpha.jpeg)\n\
             <!-- kmark } -->\n\
             <!-- kmark { layout:column margin:1px -->\n\
             #### Synthetic section Beta\n\
             ![h:210](beta.jpeg)\n\
             <!-- kmark } -->\n\
             <!-- kmark } -->",
        );

        assert_eq!(rendered_preview.pages.len(), 2);
        assert_eq!(
            rendered_preview.pages[1]
                .html
                .matches("display:flex;flex-direction:row;")
                .count(),
            1
        );
        assert_eq!(
            rendered_preview.pages[1]
                .html
                .matches("display:flex;flex-direction:column;")
                .count(),
            2
        );
        assert!(rendered_preview.pages[1]
            .html
            .contains("Synthetic section Alpha"));
        assert!(rendered_preview.pages[1]
            .html
            .contains("Synthetic section Beta"));
    }

    #[test]
    fn splits_pages_when_scope_page_style_starts_and_ends() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_size:A4 page_orientation:portrait page_font_size:11pt -->\n\
             # Normal\n\
             <!-- kmark { page_orientation:landscape page_font_size:9pt align:center -->\n\
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
            "<!-- kmark { page_orientation:landscape page_font_size:9pt align:center -->\n\
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
    fn renders_mermaid_code_block_placeholders_with_escaped_source() {
        let rendered_preview = render_markdown_preview(
            "```MERMAID title=\"sample\"\nflowchart TD\n  A[\"<script>\"] --> B\n```",
        );

        assert_eq!(
            rendered_preview.html,
            "<div id=\"kmark-mermaid-1\" class=\"kmark-mermaid-block\" data-kmark-mermaid-index=\"1\" data-kmark-mermaid-state=\"pending\" data-source-line-start=\"0\" data-source-line-end=\"3\"><div class=\"kmark-mermaid-rendered\" aria-live=\"polite\"></div><details class=\"kmark-mermaid-source\" hidden><summary>source</summary><pre><code>flowchart TD\n  A[&quot;&lt;script&gt;&quot;] --&gt; B\n</code></pre></details></div>"
        );
    }

    #[test]
    fn detects_spaced_tilde_mermaid_fences_and_keeps_ids_unique_across_pages() {
        let rendered_preview = render_markdown_preview(
            "~~~ mermaid\nflowchart TD\n  A --> B\n~~~\n<!-- --- -->\n```mermaid\nflowchart TD\n  C --> D\n```",
        );

        assert_eq!(rendered_preview.pages.len(), 2);
        assert!(rendered_preview.pages[0]
            .html
            .contains("id=\"kmark-mermaid-1\""));
        assert!(rendered_preview.pages[1]
            .html
            .contains("id=\"kmark-mermaid-2\""));
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
    fn renders_literal_line_break_escape_in_markdown_text() {
        let rendered_preview = render_markdown_preview("first\\nsecond");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"0\" data-source-line-end=\"0\">first<br />\nsecond</p>"
        );
    }

    #[test]
    fn keeps_literal_line_break_escape_inside_code_text() {
        let rendered_preview = render_markdown_preview("`first\\nsecond`");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"0\" data-source-line-end=\"0\"><code>first\\nsecond</code></p>"
        );
    }

    #[test]
    fn renders_safe_html_line_breaks_without_enabling_other_html() {
        let rendered_preview = render_markdown_preview("first<br>second<br />third<BR/>fourth");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"0\" data-source-line-end=\"0\">first<br />\nsecond<br />\nthird<br />\nfourth</p>"
        );
    }

    #[test]
    fn renders_callout_with_default_title() {
        let rendered_preview = render_markdown_preview("> [!NOTE]\n> これは補足です。");

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-callout kmark-callout--note\" data-callout-type=\"note\" data-source-line-start=\"0\" data-source-line-end=\"1\"><div class=\"kmark-callout__title\"><span class=\"kmark-callout__icon\" aria-hidden=\"true\"></span><span class=\"kmark-callout__title-text\">Note</span></div><div class=\"kmark-callout__body\"><p data-source-line-start=\"0\" data-source-line-end=\"1\">これは補足です。</p></div></div>"
        );
    }

    #[test]
    fn renders_callout_with_custom_title_case_insensitive_type_and_fold_marker() {
        let rendered_preview =
            render_markdown_preview("> [!Warning]- 電源投入前の注意\n> 配線を確認してください。");

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-callout kmark-callout--warning\" data-callout-type=\"warning\" data-source-line-start=\"0\" data-source-line-end=\"1\"><div class=\"kmark-callout__title\"><span class=\"kmark-callout__icon\" aria-hidden=\"true\"></span><span class=\"kmark-callout__title-text\">電源投入前の注意</span></div><div class=\"kmark-callout__body\"><p data-source-line-start=\"0\" data-source-line-end=\"1\">配線を確認してください。</p></div></div>"
        );
    }

    #[test]
    fn leaves_unsupported_callout_type_as_normal_blockquote() {
        let rendered_preview = render_markdown_preview("> [!CUSTOM]\n> 独自タイプです。");

        assert_eq!(
            rendered_preview.html,
            "<blockquote data-source-line-start=\"0\" data-source-line-end=\"1\"><p data-source-line-start=\"0\" data-source-line-end=\"1\">[!CUSTOM]<br />\n独自タイプです。</p></blockquote>"
        );
    }

    #[test]
    fn applies_kmark_single_comment_to_callout_root() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:80% align:center -->\n> [!IMPORTANT] 重要\n> この内容は重要です。",
        );

        assert!(rendered_preview.html.contains(
            "<div class=\"kmark-callout kmark-callout--important\" data-callout-type=\"important\" data-source-line-start=\"1\" data-source-line-end=\"2\" style=\"width:80%;margin-left:auto;margin-right:auto;text-align:center\">"
        ));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-callout__title-text\">重要</span>"));
        assert!(rendered_preview.html.contains(
            "<p data-source-line-start=\"1\" data-source-line-end=\"2\">この内容は重要です。</p>"
        ));
    }

    #[test]
    fn keeps_block_markdown_inside_callout_body() {
        let rendered_preview = render_markdown_preview(
            "> [!TIP] 作業のコツ\n\
             > 以下を確認してください。\n\
             >\n\
             > - 保存していること\n\
             > - 印刷で崩れていないこと\n\
             >\n\
             > ```c\n\
             > int main(void) {\n\
             >     return 0;\n\
             > }\n\
             > ```\n\
             >\n\
             > | 項目 | 状態 |\n\
             > | --- | --- |\n\
             > | preview | ok |",
        );

        assert!(rendered_preview
            .html
            .contains("<div class=\"kmark-callout__body\"><p"));
        assert!(rendered_preview
            .html
            .contains("<ul><li data-source-line-start=\"3\""));
        assert!(rendered_preview
            .html
            .contains("<pre data-source-line-start=\"6\""));
        assert!(rendered_preview.html.contains("<table>"));
    }

    #[test]
    fn renders_table_left_merge_marker_as_colspan() {
        let rendered_preview = render_markdown_preview(
            "| A | B | C |\n\
             | --- | --- | --- |\n\
             | 親 | < | 通常 |",
        );

        assert!(rendered_preview
            .html
            .contains("<td colspan=\"2\">親</td><td>通常</td>"));
        assert!(!rendered_preview.html.contains("<td>&lt;</td>"));
    }

    #[test]
    fn renders_table_up_merge_marker_as_rowspan() {
        let rendered_preview = render_markdown_preview(
            "| 分類 | 項目 |\n\
             | --- | --- |\n\
             | 入力 | A |\n\
             | ^ | B |\n\
             | ^ | C |",
        );

        assert!(rendered_preview
            .html
            .contains("<td rowspan=\"3\">入力</td><td>A</td>"));
        assert!(!rendered_preview.html.contains("<td>^</td>"));
    }

    #[test]
    fn renders_rectangular_table_merge_as_rowspan_and_colspan() {
        let rendered_preview = render_markdown_preview(
            "| A | B | C |\n\
             | --- | --- | --- |\n\
             | 親 | < | 通常 |\n\
             | ^ | < | 通常 |",
        );

        assert!(rendered_preview
            .html
            .contains("<td rowspan=\"2\" colspan=\"2\">親</td><td>通常</td>"));
        assert!(!rendered_preview.html.contains("<td>&lt;</td>"));
        assert!(!rendered_preview.html.contains("<td>^</td>"));
    }

    #[test]
    fn keeps_escaped_table_merge_markers_as_text() {
        let rendered_preview = render_markdown_preview(
            "| A | B |\n\
             | --- | --- |\n\
             | \\< | \\^ |",
        );

        assert!(rendered_preview.html.contains("<td>&lt;</td><td>^</td>"));
        assert!(!rendered_preview.html.contains("rowspan=\""));
        assert!(!rendered_preview.html.contains("colspan=\""));
    }

    #[test]
    fn keeps_invalid_table_merge_markers_as_text() {
        let invalid_left = render_markdown_preview(
            "| A | B |\n\
             | --- | --- |\n\
             | < | B |",
        );
        let invalid_up = render_markdown_preview(
            "| A | B |\n\
             | --- | --- |\n\
             | ^ | B |",
        );

        assert!(invalid_left.html.contains("<td>&lt;</td><td>B</td>"));
        assert!(!invalid_left.html.contains("colspan=\""));
        assert!(invalid_up.html.contains("<td>^</td><td>B</td>"));
        assert!(!invalid_up.html.contains("rowspan=\""));
    }

    #[test]
    fn falls_back_to_literal_markers_for_non_rectangular_table_merge() {
        let rendered_preview = render_markdown_preview(
            "| A | B |\n\
             | --- | --- |\n\
             | 親 | 通常 |\n\
             | ^ | < |",
        );

        assert!(rendered_preview.html.contains("<td>^</td><td>&lt;</td>"));
        assert!(!rendered_preview.html.contains("rowspan=\""));
        assert!(!rendered_preview.html.contains("colspan=\""));
    }

    #[test]
    fn renders_page_valign_on_single_block_root() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_valign:bottom align:right w:80% -->\n作成者: 山口",
        );

        assert!(rendered_preview.html.contains(
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" class=\"kmark-page-valign kmark-page-valign--bottom\" data-page-valign=\"bottom\" style=\"width:80%;margin-left:auto;text-align:right\">作成者: 山口</p>"
        ));
    }

    #[test]
    fn renders_page_valign_on_scope_root() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { page_valign:bottom align:right } -->\n作成者: 山口\n\n承認者: ________\n<!-- kmark } -->",
        );

        assert!(rendered_preview.html.contains(
            "<div class=\"kmark-scope kmark-page-valign kmark-page-valign--bottom\" data-page-valign=\"bottom\" style=\"display:flex;flex-direction:column;align-items:flex-end;\">"
        ));
        assert!(rendered_preview.html.contains(
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\">作成者: 山口</p>"
        ));
        assert!(rendered_preview.html.contains(
            "<p data-source-line-start=\"3\" data-source-line-end=\"3\">承認者: ________</p>"
        ));
    }

    #[test]
    fn renders_page_valign_on_callout_root() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark page_valign:bottom -->\n> [!NOTE] 備考\n> この資料は社内用です。",
        );

        assert!(rendered_preview.html.contains(
            "<div class=\"kmark-callout kmark-callout--note kmark-page-valign kmark-page-valign--bottom\" data-callout-type=\"note\" data-source-line-start=\"1\" data-source-line-end=\"2\" data-page-valign=\"bottom\">"
        ));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-callout__title-text\">備考</span>"));
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
    fn applies_table_params_to_following_table_root() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark table_cell_padding:0.3mm 1mm line_height:1.05 font_size:8.5pt table_fit:shrink table_layout:fixed -->\n| A | B |\n| - | - |\n| 1 | 2 |",
        );

        assert!(rendered_preview.html.contains(
            "<table style=\"font-size:8.5pt;line-height:1.05;--kmark-table-cell-padding-x:1mm;--kmark-table-cell-padding-y:0.3mm;table-layout:fixed;\" data-kmark-table-fit=\"shrink\">"
        ));
    }

    #[test]
    fn applies_scoped_table_params_to_tables_without_cell_specific_markup() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { table_cell_padding_x:1mm table_cell_padding_y:0.3mm table_fit:off -->\n| A |\n| - |\n| B |\n<!-- kmark } -->",
        );

        assert!(rendered_preview.html.contains(
            "<table style=\"--kmark-table-cell-padding-x:1mm;--kmark-table-cell-padding-y:0.3mm;\" data-kmark-table-fit=\"off\">"
        ));
        assert!(!rendered_preview.html.contains("class=\"kmark-scope\""));
        assert!(!rendered_preview.html.contains("<td style=\"--kmark-table"));
        assert!(!rendered_preview.html.contains("<th style=\"--kmark-table"));
    }

    #[test]
    fn keeps_table_only_scope_inherited_without_rendered_wrapper_or_image_flattening() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark table_cell_padding:1 -->\n\
             <!-- kmark { -->\n\
             # First\n\
             <!-- --- -->\n\
             ![](image.png)\n\
             \n\
             | A |\n\
             | - |\n\
             | B |",
        );

        assert_eq!(rendered_preview.pages.len(), 2);
        assert!(!rendered_preview.pages[0]
            .html
            .contains("class=\"kmark-scope\""));
        assert!(!rendered_preview.pages[1]
            .html
            .contains("class=\"kmark-scope\""));
        assert!(!rendered_preview.pages[1].html.contains("display:contents"));
        assert!(rendered_preview.pages[1].html.contains(
            "<p data-source-line-start=\"4\" data-source-line-end=\"4\"><img src=\"image.png\""
        ));
        assert!(rendered_preview.pages[1].html.contains(
            "<table style=\"--kmark-table-cell-padding-x:1px;--kmark-table-cell-padding-y:1px;\">"
        ));
    }

    #[test]
    fn preserves_scoped_table_params_when_table_has_single_params() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { table_cell_padding_x:1mm table_cell_padding_y:0.3mm table_fit:off -->\n<!-- kmark font_size:8.5pt line_height:1.05 -->\n| A |\n| - |\n| B |\n<!-- kmark } -->",
        );

        assert!(rendered_preview.html.contains(
            "<table style=\"font-size:8.5pt;line-height:1.05;--kmark-table-cell-padding-x:1mm;--kmark-table-cell-padding-y:0.3mm;\" data-kmark-table-fit=\"off\">"
        ));
    }

    #[test]
    fn lets_table_single_params_override_only_their_scoped_axes() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { table_cell_padding_x:1mm table_cell_padding_y:0.3mm -->\n<!-- kmark table_cell_padding_x:2mm -->\n| A |\n| - |\n| B |\n<!-- kmark } -->",
        );

        assert!(rendered_preview.html.contains(
            "<table style=\"--kmark-table-cell-padding-x:2mm;--kmark-table-cell-padding-y:0.3mm;\">"
        ));
    }

    #[test]
    fn ignores_invalid_table_param_values() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark table_cell_padding:1mm 2mm 3mm table_fit:bad table_layout:grid -->\n| A |\n| - |\n| B |",
        );

        assert_eq!(
            rendered_preview.html,
            "<table><thead><tr data-source-line-start=\"1\" data-source-line-end=\"1\"><th>A</th></tr></thead><tbody><tr data-source-line-start=\"3\" data-source-line-end=\"3\"><td>B</td></tr></tbody></table>"
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
    fn accepts_image_size_aliases_used_by_completion_schema() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark width:200 height:100 -->\n![](image.png)");

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
    fn applies_text_params_to_following_paragraph_block() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark color:#c00 font_size:14pt font_weight:700 -->\n重要",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"display:table;width:fit-content;max-width:100%;box-sizing:border-box;color:#c00;font-size:14pt;font-weight:700;\">重要</p>"
        );
    }

    #[test]
    fn applies_visual_and_text_params_to_following_heading_block() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:40mm h:12mm border_size:2px border_color:red radius:4px bg:#fff0f0 opacity:0.8 rotate:-10 shadow:true padding:2mm 4mm margin:2mm align:right color:#c00 font_size:12pt font_weight:bold font_family:\"Yu Gothic\" letter_spacing:0.08em line_height:1.2 -->\n# 社外秘",
        );

        assert!(rendered_preview
            .html
            .contains("<h1 data-source-line-start=\"1\" data-source-line-end=\"1\" style=\""));
        assert!(rendered_preview.html.contains("width:40mm"));
        assert!(rendered_preview.html.contains("height:12mm"));
        assert!(rendered_preview.html.contains("border-width:2px"));
        assert!(rendered_preview.html.contains("border-color:red"));
        assert!(rendered_preview.html.contains("border-radius:4px"));
        assert!(rendered_preview.html.contains("background:#fff0f0"));
        assert!(rendered_preview.html.contains("opacity:0.8"));
        assert!(rendered_preview.html.contains("transform:rotate(-10deg)"));
        assert!(rendered_preview.html.contains("box-shadow:0 2px 8px #0003"));
        assert!(rendered_preview.html.contains("padding:2mm 4mm"));
        assert!(rendered_preview.html.contains("margin:2mm"));
        assert!(rendered_preview.html.contains("text-align:right"));
        assert!(rendered_preview.html.contains("color:#c00"));
        assert!(rendered_preview.html.contains("font-size:12pt"));
        assert!(rendered_preview.html.contains("font-weight:bold"));
        assert!(rendered_preview.html.contains("font-family:Yu Gothic"));
        assert!(rendered_preview.html.contains("letter-spacing:0.08em"));
        assert!(rendered_preview.html.contains("line-height:1.2"));
        assert!(rendered_preview.html.contains(">社外秘</h1>"));
        assert!(!rendered_preview.html.contains("width:fit-content"));
    }

    #[test]
    fn keeps_block_text_decoration_from_leaking_to_following_block() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark color:red align:right -->\n# 見出し\n\n本文");

        assert!(rendered_preview.html.contains(
            "<h1 data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"display:table;width:fit-content;max-width:100%;box-sizing:border-box;margin-left:auto;color:red;text-align:right\">見出し</h1>"
        ));
        assert!(rendered_preview
            .html
            .contains("<p data-source-line-start=\"3\" data-source-line-end=\"3\">本文</p>"));
    }

    #[test]
    fn applies_block_decoration_to_list_table_blockquote_and_code_roots() {
        let list = render_markdown_preview("<!-- kmark color:red -->\n- A\n- B");
        assert!(list
            .html
            .contains("<ul style=\"display:table;width:fit-content;max-width:100%;box-sizing:border-box;color:red;\">"));

        let table = render_markdown_preview("<!-- kmark color:red -->\n| A |\n| - |\n| B |");
        assert!(table.html.contains("<table style=\"color:red;\">"));

        let blockquote = render_markdown_preview("<!-- kmark color:red -->\n> 引用");
        assert!(blockquote.html.contains(
            "<blockquote data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"display:table;width:fit-content;max-width:100%;box-sizing:border-box;color:red;\">"
        ));

        let code =
            render_markdown_preview("<!-- kmark color:red bg:#eee -->\n```rust\nfn main() {}\n```");
        assert!(code.html.contains(
            "<pre data-source-line-start=\"1\" data-source-line-end=\"3\" style=\"background:#eee;display:table;width:fit-content;max-width:100%;box-sizing:border-box;color:red;\"><code class=\"language-rust\">"
        ));
    }

    #[test]
    fn keeps_table_layout_when_text_decoration_is_applied() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark color:#333 font_size:12pt align:center -->\n\
             | ピン番号 | 名称 | 1 | MOSFETリレー 1 COM |\n\
             | --- | --- | ---: | --- |\n\
             |  |  | 2 | MOSFETリレー 1 OUT |",
        );

        assert!(rendered_preview
            .html
            .contains("<table style=\"color:#333;font-size:12pt;\">"));
        assert!(!rendered_preview.html.contains("width:fit-content"));
        assert!(!rendered_preview.html.contains("text-align:center\"><thead"));
    }

    #[test]
    fn applies_scope_text_and_visual_params_to_each_block_root() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { color:red border_size:1px border_color:red radius:2px -->\n本文\n\n# 見出し\n<!-- kmark } -->",
        );

        assert!(rendered_preview
            .html
            .contains("<div class=\"kmark-scope\" style=\"display:flex;flex-direction:column;\">"));
        assert!(rendered_preview.html.contains(
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"border-width:1px;border-style:solid;border-color:red;border-radius:2px;display:table;width:fit-content;max-width:100%;box-sizing:border-box;color:red;\">本文</p>"
        ));
        assert!(rendered_preview.html.contains(
            "<h1 data-source-line-start=\"3\" data-source-line-end=\"3\" style=\"border-width:1px;border-style:solid;border-color:red;border-radius:2px;display:table;width:fit-content;max-width:100%;box-sizing:border-box;color:red;\">見出し</h1>"
        ));
    }

    #[test]
    fn preserves_scoped_text_and_visual_params_when_block_has_single_params() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { color:red border_size:1px border_color:red radius:2px -->\n<!-- kmark font_weight:700 -->\n# 見出し\n<!-- kmark } -->",
        );

        assert!(rendered_preview.html.contains(
            "<h1 data-source-line-start=\"2\" data-source-line-end=\"2\" style=\"border-width:1px;border-style:solid;border-color:red;border-radius:2px;display:table;width:fit-content;max-width:100%;box-sizing:border-box;color:red;font-weight:700;\">見出し</h1>"
        ));
    }

    #[test]
    fn does_not_shrink_text_block_when_width_is_explicit() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark w:40mm color:red align:center -->\n明示幅");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"width:40mm;margin-left:auto;margin-right:auto;color:red;text-align:center\">明示幅</p>"
        );
    }

    #[test]
    fn ignores_block_decoration_when_blank_line_separates_comment_and_block() {
        let rendered_preview = render_markdown_preview("<!-- kmark color:red -->\n\n本文");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"2\" data-source-line-end=\"2\">本文</p>"
        );
    }

    #[test]
    fn treats_legacy_text_and_stamp_keys_as_non_rendering_unknown_params() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark text:社外秘 -->\n本文\n\n<!-- kmark stamp:社外秘 -->\n続き",
        );

        assert!(!rendered_preview.html.contains("社外秘"));
        assert!(!rendered_preview.html.contains("kmark-text"));
        assert!(!rendered_preview.html.contains("kmark-stamp"));
        assert!(rendered_preview
            .html
            .contains("<p data-source-line-start=\"1\" data-source-line-end=\"1\">本文</p>"));
        assert!(rendered_preview
            .html
            .contains("<p data-source-line-start=\"4\" data-source-line-end=\"4\">続き</p>"));
    }

    #[test]
    fn applies_shared_visual_params_to_images() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:40mm h:12mm radius:4px bg:#fff0f0 opacity:0.8 rotate:-10 shadow:0 2px 8px #0003 padding:2mm 4mm margin:2mm -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"width:40mm;height:12mm;border-radius:4px;background:#fff0f0;opacity:0.8;transform:rotate(-10deg);box-shadow:0 2px 8px #0003;margin:2mm;padding:2mm 4mm;\" /></p>"
        );
    }

    #[test]
    fn applies_fit_size_values_to_images_and_blocks() {
        let image = render_markdown_preview("<!-- kmark w:fit h:fit -->\n![](image.png)");
        assert_eq!(
            image.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"width:fit-content;max-width:100%;height:fit-content;box-sizing:border-box;\" /></p>"
        );

        let block = render_markdown_preview("<!-- kmark w:fit -->\n# 見出し");
        assert_eq!(
            block.html,
            "<h1 data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"width:fit-content;max-width:100%;box-sizing:border-box;\">見出し</h1>"
        );
    }

    #[test]
    fn applies_page_fit_size_values_to_images_and_image_paragraphs() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:page_fit h:page_fit margin:2mm -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"margin:0;\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"width:var(--kmark-page-fit-width,100%);height:var(--kmark-page-fit-height,auto);display:block;box-sizing:border-box;margin:0;\" /></p>"
        );
    }

    #[test]
    fn applies_page_fit_size_values_to_non_image_blocks() {
        let rendered_preview =
            render_markdown_preview("<!-- kmark w:page_fit h:page_fit -->\n本文");

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"width:var(--kmark-page-fit-width,100%);height:var(--kmark-page-fit-height,auto);box-sizing:border-box;margin:0;\">本文</p>"
        );
    }

    #[test]
    fn applies_page_fit_contain_size_values_to_images() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:page_fit_contain h:page_fit_contain -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"margin:0;\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"max-width:var(--kmark-page-fit-width,100%);width:var(--kmark-page-fit-contain-width,auto);max-height:var(--kmark-page-fit-height,none);height:var(--kmark-page-fit-contain-height,auto);display:block;object-fit:contain;box-sizing:border-box;margin:0;\" /></p>"
        );
    }

    #[test]
    fn applies_align_to_page_fit_contain_image() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark h:page_fit_contain align:center -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"margin:0;text-align:center\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"max-height:var(--kmark-page-fit-height,none);height:var(--kmark-page-fit-contain-height,auto);display:block;object-fit:contain;box-sizing:border-box;margin:0;margin-left:auto;margin-right:auto;\" /></p>"
        );
    }

    #[test]
    fn applies_one_axis_page_fit_without_forcing_the_other_axis() {
        let width_fit = render_markdown_preview("<!-- kmark w:page_fit -->\n![](image.png)");
        assert_eq!(
            width_fit.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"margin:0;\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"width:var(--kmark-page-fit-width,100%);display:block;box-sizing:border-box;margin:0;\" /></p>"
        );

        let height_fit = render_markdown_preview("<!-- kmark h:page_fit -->\n![](image.png)");
        assert_eq!(
            height_fit.html,
            "<p data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"margin:0;\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"1\" data-source-line-end=\"1\" style=\"height:var(--kmark-page-fit-height,auto);display:block;box-sizing:border-box;margin:0;\" /></p>"
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
            "<!-- kmark define:thumb w:200 h:100 -->\n\n<!-- kmark use:thumb -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"3\" data-source-line-end=\"3\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"3\" data-source-line-end=\"3\" style=\"width:200px;height:100px;\" /></p>"
        );
    }

    #[test]
    fn supports_separated_kmark_preset_definition_and_scope_usage() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark w:200 -->\n<!-- kmark h:100 -->\n<!-- kmark define:thumb -->\n\n<!-- kmark { use:thumb w:300 -->\n![](a.png)\n<!-- kmark h:240 -->\n![](b.png)\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-scope\" style=\"display:flex;flex-direction:column;\"><p data-source-line-start=\"5\" data-source-line-end=\"5\" style=\"display:contents\"><img src=\"a.png\" alt=\"\" data-source-line-start=\"5\" data-source-line-end=\"5\" style=\"width:300px;height:100px;\" /></p><p data-source-line-start=\"7\" data-source-line-end=\"7\" style=\"display:contents\"><img src=\"b.png\" alt=\"\" data-source-line-start=\"7\" data-source-line-end=\"7\" style=\"width:300px;height:240px;\" /></p></div>"
        );
    }

    #[test]
    fn renders_kmark_scope_layout_styles() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark { layout:row gap:16 align:center valign:top wrap:true w:200 -->\n\n![](a.png)\n![](b.png)\n\n<!-- kmark } -->",
        );

        assert_eq!(
            rendered_preview.html,
            "<div class=\"kmark-scope\" style=\"display:flex;flex-direction:row;justify-content:center;align-items:flex-start;flex-wrap:wrap;gap:16px;\"><p data-source-line-start=\"2\" data-source-line-end=\"3\" style=\"display:contents\"><img src=\"a.png\" alt=\"\" data-source-line-start=\"2\" data-source-line-end=\"2\" style=\"width:200px;\" /><img src=\"b.png\" alt=\"\" data-source-line-start=\"3\" data-source-line-end=\"3\" style=\"width:200px;\" /></p></div>"
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
            "<p data-source-line-start=\"1\" data-source-line-end=\"4\" style=\"display:table;width:fit-content;max-width:100%;box-sizing:border-box;margin-left:auto;text-align:right\">text1<br />\ntext2<br />\ntext3<br />\ntext4</p><p data-source-line-start=\"6\" data-source-line-end=\"6\">text5</p>"
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
    fn renders_heading_numbers_only_in_open_scope_without_mutating_heading_text() {
        let markdown = "<!-- kmark heading_number:true heading_number_from:2 heading_number_depth:3 heading_number_pattern:dot -->\n<!-- kmark { -->\n\n# ドキュメントタイトル\n\n## 概要\n### 背景\n\n## 仕様\n### 詳細";
        let rendered_preview = render_markdown_preview(markdown);

        assert!(rendered_preview.html.contains(
            "<h1 data-source-line-start=\"3\" data-source-line-end=\"3\">ドキュメントタイトル</h1>"
        ));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">1.</span>概要"));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">1.1</span>背景"));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">2.</span>仕様"));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">2.1</span>詳細"));
        assert!(markdown.contains("## 概要"));
        assert!(!markdown.contains("## 1. 概要"));
    }

    #[test]
    fn keeps_heading_numbers_inside_scope_and_skips_nested_disabled_scope_counts() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark heading_number:true heading_number_from:2 heading_number_depth:3 -->\n\
             <!-- kmark { -->\n\n\
             ## A\n\n\
             <!-- kmark heading_number:false -->\n\
             <!-- kmark { -->\n\n\
             ## B\n\
             ### B child\n\n\
             <!-- kmark } -->\n\n\
             ## C\n\
             ### C child\n\n\
             <!-- kmark } -->\n\n\
             ## Outside",
        );

        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">1.</span>A"));
        assert!(rendered_preview
            .html
            .contains("<h2 data-source-line-start=\"8\" data-source-line-end=\"8\">B</h2>"));
        assert!(rendered_preview
            .html
            .contains("<h3 data-source-line-start=\"9\" data-source-line-end=\"9\">B child</h3>"));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">2.</span>C"));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">2.1</span>C child"));
        assert!(rendered_preview.html.contains(
            "<h2 data-source-line-start=\"18\" data-source-line-end=\"18\">Outside</h2>"
        ));
        assert!(!rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">3.</span>Outside"));
    }

    #[test]
    fn applies_heading_number_depth_limit() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark heading_number:true heading_number_from:2 heading_number_depth:2 -->\n\
             <!-- kmark { -->\n\n\
             ## 概要\n\
             ### 背景\n\
             #### 詳細\n\
             <!-- kmark } -->",
        );

        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">1.</span>概要"));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">1.1</span>背景"));
        assert!(rendered_preview
            .html
            .contains("<h4 data-source-line-start=\"5\" data-source-line-end=\"5\">詳細</h4>"));
    }

    #[test]
    fn renders_heading_number_patterns() {
        let dot_trailing = render_markdown_preview(
            "<!-- kmark heading_number:true heading_number_from:2 heading_number_depth:3 heading_number_pattern:dot_trailing -->\n\
             <!-- kmark { -->\n\n\
             ## 概要\n\
             ### 背景\n\
             #### 詳細\n\
             <!-- kmark } -->",
        );
        let hyphen = render_markdown_preview(
            "<!-- kmark heading_number:true heading_number_from:2 heading_number_depth:3 heading_number_pattern:hyphen -->\n\
             <!-- kmark { -->\n\n\
             ## 概要\n\
             ### 背景\n\
             #### 詳細\n\
             <!-- kmark } -->",
        );
        let chapter = render_markdown_preview(
            "<!-- kmark heading_number:true heading_number_from:2 heading_number_depth:3 heading_number_pattern:chapter -->\n\
             <!-- kmark { -->\n\n\
             ## 概要\n\
             ### 背景\n\
             #### 詳細\n\
             <!-- kmark } -->",
        );

        assert!(dot_trailing
            .html
            .contains("<span class=\"kmark-heading-number\">1.</span>概要"));
        assert!(dot_trailing
            .html
            .contains("<span class=\"kmark-heading-number\">1.1.</span>背景"));
        assert!(dot_trailing
            .html
            .contains("<span class=\"kmark-heading-number\">1.1.1.</span>詳細"));
        assert!(hyphen
            .html
            .contains("<span class=\"kmark-heading-number\">1</span>概要"));
        assert!(hyphen
            .html
            .contains("<span class=\"kmark-heading-number\">1-1</span>背景"));
        assert!(hyphen
            .html
            .contains("<span class=\"kmark-heading-number\">1-1-1</span>詳細"));
        assert!(chapter
            .html
            .contains("<span class=\"kmark-heading-number\">第1章</span>概要"));
        assert!(chapter
            .html
            .contains("<span class=\"kmark-heading-number\">1.1</span>背景"));
        assert!(chapter
            .html
            .contains("<span class=\"kmark-heading-number\">1.1.1</span>詳細"));
    }

    #[test]
    fn keeps_heading_number_counters_across_page_segments() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark heading_number:true heading_number_from:2 heading_number_depth:1 -->\n\
             <!-- kmark { -->\n\n\
             ## A\n\
             <!-- --- -->\n\
             ## B",
        );

        assert_eq!(rendered_preview.page_htmls.len(), 2);
        assert!(rendered_preview.page_htmls[0]
            .contains("<span class=\"kmark-heading-number\">1.</span>A"));
        assert!(rendered_preview.page_htmls[1]
            .contains("<span class=\"kmark-heading-number\">2.</span>B"));
    }

    #[test]
    fn applies_separated_heading_number_params_to_following_scope() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark heading_number:true -->\n\
             <!-- kmark heading_number_from:2 -->\n\
             <!-- kmark heading_number_depth:3 -->\n\
             <!-- kmark heading_number_pattern:dot -->\n\
             <!-- kmark { -->\n\n\
             # Title\n\
             ## A\n\
             ### B\n\
             <!-- kmark } -->",
        );

        assert!(rendered_preview
            .html
            .contains("<h1 data-source-line-start=\"6\" data-source-line-end=\"6\">Title</h1>"));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">1.</span>A"));
        assert!(rendered_preview
            .html
            .contains("<span class=\"kmark-heading-number\">1.1</span>B"));
    }

    #[test]
    fn ignores_unknown_kmark_keys_invalid_values_and_unmatched_scope_end() {
        let rendered_preview = render_markdown_preview(
            "<!-- kmark } -->\n<!-- kmark unknown:abc style:width:999px onclick:alert(1) w:200 w:abc fit:cover fit:bad border_size:2 border_color:url(javascript:alert(1)) -->\n![](image.png)",
        );

        assert_eq!(
            rendered_preview.html,
            "<p data-source-line-start=\"2\" data-source-line-end=\"2\"><img src=\"image.png\" alt=\"\" data-source-line-start=\"2\" data-source-line-end=\"2\" style=\"width:200px;border-width:2px;border-style:solid;\" /></p>"
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
