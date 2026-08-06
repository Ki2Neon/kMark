export type KmarkMermaidSvgPresentation = {
  readonly style?: string;
  readonly position?: string;
  readonly preferMermaidBackground: boolean;
};

const UNSAFE_CSS_VALUE_PATTERN = /(?:javascript:|vbscript:|data:|@import|expression\s*\(|[;{}<>])/iu;
const ALLOWED_SVG_STYLE_PROPERTIES = [
  "width",
  "max-width",
  "height",
  "max-height",
  "display",
  "object-fit",
  "border-width",
  "border-style",
  "border-color",
  "border-radius",
  "background",
  "opacity",
  "transform",
  "box-shadow",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "box-sizing",
] as const;
const ALLOWED_SVG_STYLE_PROPERTY_SET = new Set<string>(ALLOWED_SVG_STYLE_PROPERTIES);

export type KmarkMermaidSvgStyleEntry = {
  readonly property: string;
  readonly value: string;
};

const PRESERVE_ASPECT_RATIO_BY_POSITION: Readonly<Record<string, string>> = {
  center: "xMidYMid meet",
  "center center": "xMidYMid meet",
  top: "xMidYMin meet",
  "top center": "xMidYMin meet",
  "center top": "xMidYMin meet",
  bottom: "xMidYMax meet",
  "bottom center": "xMidYMax meet",
  "center bottom": "xMidYMax meet",
  left: "xMinYMid meet",
  "left center": "xMinYMid meet",
  "center left": "xMinYMid meet",
  right: "xMaxYMid meet",
  "right center": "xMaxYMid meet",
  "center right": "xMaxYMid meet",
  "top left": "xMinYMin meet",
  "left top": "xMinYMin meet",
  "top right": "xMaxYMin meet",
  "right top": "xMaxYMin meet",
  "bottom left": "xMinYMax meet",
  "left bottom": "xMinYMax meet",
  "bottom right": "xMaxYMax meet",
  "right bottom": "xMaxYMax meet",
};

export function resolveMermaidPreserveAspectRatio(position: string | undefined): string | undefined {
  if (position === undefined) {
    return undefined;
  }

  return PRESERVE_ASPECT_RATIO_BY_POSITION[position.trim().toLowerCase().replace(/_/gu, " ").replace(/\s+/gu, " ")];
}

export function applyKmarkMermaidSvgPresentation(
  svgElement: SVGElement,
  presentation: KmarkMermaidSvgPresentation,
): void {
  applySafeSvgStyle(svgElement, presentation.style, presentation.preferMermaidBackground);

  const preserveAspectRatio = resolveMermaidPreserveAspectRatio(presentation.position);
  if (preserveAspectRatio !== undefined) {
    svgElement.setAttribute("preserveAspectRatio", preserveAspectRatio);
  }
}

export function resolveKmarkMermaidSvgStyle(
  serializedStyle: string | undefined,
  preferMermaidBackground: boolean,
): readonly KmarkMermaidSvgStyleEntry[] {
  if (serializedStyle === undefined || serializedStyle.trim().length === 0) {
    return [];
  }

  const entries: KmarkMermaidSvgStyleEntry[] = [];
  for (const declaration of serializedStyle.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (!ALLOWED_SVG_STYLE_PROPERTY_SET.has(property)
      || (preferMermaidBackground && property === "background")
      || value.length === 0
      || UNSAFE_CSS_VALUE_PATTERN.test(value)) {
      continue;
    }

    entries.push({ property, value });
  }

  return entries;
}

function applySafeSvgStyle(
  svgElement: SVGElement,
  serializedStyle: string | undefined,
  preferMermaidBackground: boolean,
): void {
  for (const { property, value } of resolveKmarkMermaidSvgStyle(serializedStyle, preferMermaidBackground)) {
    svgElement.style.setProperty(property, value);
  }

  if (svgElement.style.transform.length > 0) {
    svgElement.style.setProperty("transform-box", "border-box");
    svgElement.style.setProperty("transform-origin", "center");
  }
  if (svgElement.style.borderRadius.length > 0) {
    svgElement.style.setProperty("overflow", "hidden");
  }
}
