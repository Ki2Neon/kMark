import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";

const MARKDOWN_PAGE_BREAK_TOKEN_GLOBAL_REGEX = /<!--\s*---\s*-->/giu;

const SANITIZE_OPTIONS = {
  ADD_ATTR: ["target", "rel"],
};

type MarkdownRenderEnvironment = {
  readonly lineOffset?: number;
};

type MarkdownPageSegment = {
  readonly content: string;
  readonly lineOffset: number;
};

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: true,
});

const defaultLinkOpenRenderer = markdown.renderer.rules.link_open;

markdown.core.ruler.after("block", "kmark-source-lines", (state) => {
  const environment = state.env as MarkdownRenderEnvironment;
  const lineOffset = typeof environment.lineOffset === "number" ? environment.lineOffset : 0;

  for (const token of state.tokens) {
    if (!token.block || token.nesting !== 1 || token.map === null) {
      continue;
    }

    const [startLine, endLineExclusive] = token.map;
    token.attrSet("data-source-line-start", String(startLine + lineOffset));
    token.attrSet("data-source-line-end", String(Math.max(startLine, endLineExclusive - 1) + lineOffset));
  }
});

markdown.renderer.rules.link_open = (tokens, index, options, environment, self) => {
  const token = tokens[index];
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noreferrer noopener");

  if (defaultLinkOpenRenderer !== undefined) {
    return defaultLinkOpenRenderer(tokens, index, options, environment, self);
  }

  return self.renderToken(tokens, index, options);
};

function sanitizeRenderedMarkdown(content: string): string {
  return DOMPurify.sanitize(content, SANITIZE_OPTIONS);
}

function countLineBreaks(content: string): number {
  return (content.match(/\r?\n/gu) ?? []).length;
}

function renderMarkdownWithLineOffset(content: string, lineOffset: number): string {
  return sanitizeRenderedMarkdown(markdown.render(content, { lineOffset } satisfies MarkdownRenderEnvironment));
}

function splitMarkdownPages(content: string): readonly MarkdownPageSegment[] {
  const pageSegments: MarkdownPageSegment[] = [];
  let lastIndex = 0;
  let lineOffset = 0;

  for (const match of content.matchAll(MARKDOWN_PAGE_BREAK_TOKEN_GLOBAL_REGEX)) {
    const matchIndex = match.index ?? 0;
    const pageContent = content.slice(lastIndex, matchIndex);

    pageSegments.push({
      content: pageContent,
      lineOffset,
    });

    lineOffset += countLineBreaks(pageContent) + countLineBreaks(match[0]);
    lastIndex = matchIndex + match[0].length;
  }

  pageSegments.push({
    content: content.slice(lastIndex),
    lineOffset,
  });

  return pageSegments;
}

export function renderMarkdown(content: string): string {
  return renderMarkdownWithLineOffset(content, 0);
}

export function renderMarkdownPages(content: string): string[] {
  const pageContents = splitMarkdownPages(content);

  if (pageContents.length === 0) {
    return [renderMarkdown("")];
  }

  return pageContents.map((pageContent) => renderMarkdownWithLineOffset(pageContent.content, pageContent.lineOffset));
}