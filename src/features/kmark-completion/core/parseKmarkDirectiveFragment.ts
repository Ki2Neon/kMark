export type ParsedKmarkToken = {
  readonly name: string;
  readonly value: string | null;
};

export type ParsedKmarkDirectiveFragment = {
  readonly tokens: readonly ParsedKmarkToken[];
  readonly usedParamNames: ReadonlySet<string>;
  readonly hasScopeOpen: boolean;
  readonly hasPageParam: boolean;
  readonly hasTocParam: boolean;
};

const PAGE_PARAM_NAMES = new Set([
  "page_size",
  "orientation",
  "page_orientation",
  "page_width",
  "page_height",
  "page_margin",
  "page_number",
  "page_number_format",
  "page_number_start",
  "page_number_reset",
  "page_number_count",
  "page_number_visible",
  "page_number_style",
  "page_font_size",
  "page_number_font_size",
  "page_number_color",
  "page_number_margin_top",
  "page_number_margin_bottom",
  "page_number_margin_left",
  "page_number_margin_right",
]);

const TOC_PARAM_NAMES = new Set([
  "toc",
  "toc_depth",
  "toc_min_depth",
  "toc_title",
  "toc_ordered",
  "toc_links",
]);

export function parseKmarkDirectiveFragment(directiveText: string): ParsedKmarkDirectiveFragment {
  const tokens = directiveText
    .replace(/[{}]/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .map((token): ParsedKmarkToken | null => {
      const separatorIndex = token.indexOf(":");

      if (separatorIndex <= 0) {
        return null;
      }

      return {
        name: token.slice(0, separatorIndex),
        value: token.slice(separatorIndex + 1),
      };
    })
    .filter((token): token is ParsedKmarkToken => token !== null);
  const usedParamNames = new Set(tokens.map((token) => token.name));

  return {
    tokens,
    usedParamNames,
    hasScopeOpen: directiveText.includes("{"),
    hasPageParam: tokens.some((token) => PAGE_PARAM_NAMES.has(token.name)),
    hasTocParam: tokens.some((token) => TOC_PARAM_NAMES.has(token.name)),
  };
}
