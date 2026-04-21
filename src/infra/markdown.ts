import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";

const SANITIZE_OPTIONS = {
  ADD_ATTR: ["target", "rel"],
};

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: true,
});

const defaultLinkOpenRenderer = markdown.renderer.rules.link_open;

markdown.renderer.rules.link_open = (tokens, index, options, environment, self) => {
  const token = tokens[index];
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noreferrer noopener");

  if (defaultLinkOpenRenderer !== undefined) {
    return defaultLinkOpenRenderer(tokens, index, options, environment, self);
  }

  return self.renderToken(tokens, index, options);
};

export function renderMarkdown(content: string): string {
  return DOMPurify.sanitize(markdown.render(content), SANITIZE_OPTIONS);
}