import { KMARK_PARAM_SPECS } from "../schema/kmarkParamSpecs";
import { parseKmarkDirectiveFragment } from "./parseKmarkDirectiveFragment";
import { type KmarkParamSpec, type KmarkValidationWarning } from "./types";

export function validateKmarkDirective(input: {
  readonly directiveText: string;
  readonly rangeStart: number;
}): readonly KmarkValidationWarning[] {
  const parsed = parseKmarkDirectiveFragment(input.directiveText);
  const warnings: KmarkValidationWarning[] = [];
  const seenParamNames = new Set<string>();

  for (const token of parsed.tokens) {
    const spec = findParamSpec(token.name);
    const tokenOffset = input.directiveText.indexOf(`${token.name}:${token.value ?? ""}`);
    const range = {
      start: input.rangeStart + Math.max(0, tokenOffset),
      end: input.rangeStart + Math.max(0, tokenOffset) + token.name.length,
    };

    if (spec === null) {
      warnings.push({
        message: `Unknown parameter: ${token.name}`,
        range,
      });
      continue;
    }

    if (token.value === "") {
      warnings.push({
        message: `Missing value for ${token.name}`,
        range,
      });
    }

    if (spec.values !== undefined && token.value !== null && token.value !== "" && !spec.values.includes(token.value)) {
      warnings.push({
        message: `Invalid value for ${token.name}: ${token.value}`,
        range,
      });
    }

    if (seenParamNames.has(spec.name) && spec.allowMultiple !== true) {
      warnings.push({
        message: `Duplicate parameter: ${spec.name}`,
        range,
      });
    }

    seenParamNames.add(spec.name);
  }

  return warnings;
}

function findParamSpec(name: string): KmarkParamSpec | null {
  return KMARK_PARAM_SPECS.find((spec) => (
    spec.name === name || spec.aliases?.includes(name) === true
  )) ?? null;
}
