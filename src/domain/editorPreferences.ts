export type MultiCursorModifier = "alt" | "ctrlCmd";

export type MultiCursorModifierOption = {
  readonly id: MultiCursorModifier;
  readonly label: string;
};

export type EditorPreferences = {
  readonly multiCursorModifier: MultiCursorModifier;
};

export const MULTI_CURSOR_MODIFIER_OPTIONS: readonly MultiCursorModifierOption[] = [
  { id: "alt", label: "Alt + Click" },
  { id: "ctrlCmd", label: "Ctrl + Click" },
] as const;

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  multiCursorModifier: "alt",
};

const MULTI_CURSOR_MODIFIER_SET = new Set<MultiCursorModifier>(
  MULTI_CURSOR_MODIFIER_OPTIONS.map((modifierOption) => modifierOption.id),
);

export function isMultiCursorModifier(value: string): value is MultiCursorModifier {
  return MULTI_CURSOR_MODIFIER_SET.has(value as MultiCursorModifier);
}