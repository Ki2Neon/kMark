import { type StoredEdit } from "../domain/editor";
import { type EditorPreferences } from "../domain/editorPreferences";
import { type PreviewPreferences } from "../domain/preview";
import { type RecentFile } from "../domain/recentFiles";
import { type ThemePreferences } from "../domain/theme";
import {
  normalizeDesktopLayoutPreferencesWithWasm,
  normalizeEditorDraftWithWasm,
  normalizeEditorPreferencesWithWasm,
  normalizePreviewPreferencesWithWasm,
  normalizeRecentFilesWithWasm,
  normalizeThemePreferencesWithWasm,
} from "../wasm/kmarkWeb";

export type DesktopLayoutPreferences = {
  readonly desktopSplitRatio: number;
};

export type NormalizedWebState<T> = {
  readonly text: string | null;
  readonly value: T;
};

function parseJsonPayload<T>(text: string): T {
  return JSON.parse(text) as T;
}

export async function normalizeDesktopLayoutPreferencesState(
  text: string | null,
): Promise<NormalizedWebState<DesktopLayoutPreferences>> {
  const normalizedText = await normalizeDesktopLayoutPreferencesWithWasm(text);

  return {
    text: normalizedText,
    value: parseJsonPayload<DesktopLayoutPreferences>(normalizedText),
  };
}

export async function normalizeThemePreferencesState(
  text: string | null,
): Promise<NormalizedWebState<ThemePreferences>> {
  const normalizedText = await normalizeThemePreferencesWithWasm(text);

  return {
    text: normalizedText,
    value: parseJsonPayload<ThemePreferences>(normalizedText),
  };
}

export async function normalizeEditorPreferencesState(
  text: string | null,
): Promise<NormalizedWebState<EditorPreferences>> {
  const normalizedText = await normalizeEditorPreferencesWithWasm(text);

  return {
    text: normalizedText,
    value: parseJsonPayload<EditorPreferences>(normalizedText),
  };
}

export async function normalizeEditorDraftState(
  text: string | null,
): Promise<NormalizedWebState<StoredEdit | null>> {
  const normalizedText = await normalizeEditorDraftWithWasm(text);

  return {
    text: normalizedText,
    value: normalizedText === null ? null : parseJsonPayload<StoredEdit>(normalizedText),
  };
}

export async function normalizeRecentFilesState(
  text: string | null,
): Promise<NormalizedWebState<readonly RecentFile[]>> {
  const normalizedText = await normalizeRecentFilesWithWasm(text);

  return {
    text: normalizedText,
    value: parseJsonPayload<RecentFile[]>(normalizedText),
  };
}

export async function normalizePreviewPreferencesState(
  text: string | null,
): Promise<NormalizedWebState<PreviewPreferences>> {
  const normalizedText = await normalizePreviewPreferencesWithWasm(text);

  return {
    text: normalizedText,
    value: parseJsonPayload<PreviewPreferences>(normalizedText),
  };
}
