import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: false,
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
  return markdown.render(content);
}