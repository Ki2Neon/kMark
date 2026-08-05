import {
  type AppFontId,
  type EditFontId,
  type EditFontSizePx,
  type EditorPreferences,
  type MultiCursorModifier,
  type StartupEditMode,
  type SystemFontSizePx,
} from "../../domain/editorPreferences";
import {
  type EditorPreferencesGateway,
  type WindowsStartupTrayResidentGateway,
} from "./editorPreferencesPorts";

type EditorPreferencesControllerDependencies = {
  readonly preferencesGateway: EditorPreferencesGateway;
  readonly windowsStartupTrayResidentGateway: WindowsStartupTrayResidentGateway;
};

export class EditorPreferencesController {
  readonly #preferencesGateway: EditorPreferencesGateway;
  readonly #windowsStartupTrayResidentGateway: WindowsStartupTrayResidentGateway;

  constructor(dependencies: EditorPreferencesControllerDependencies) {
    this.#preferencesGateway = dependencies.preferencesGateway;
    this.#windowsStartupTrayResidentGateway = dependencies.windowsStartupTrayResidentGateway;
  }

  createInitialState(): EditorPreferences {
    return this.#preferencesGateway.createDefault();
  }

  async load(): Promise<EditorPreferences> {
    return this.#preferencesGateway.load();
  }

  canControlWindowsStartupTrayResident(syncWindowsStartupTrayResident: boolean): boolean {
    return syncWindowsStartupTrayResident && this.#windowsStartupTrayResidentGateway.supportsToggle();
  }

  async persist(editorPreferences: EditorPreferences): Promise<EditorPreferences> {
    return this.#preferencesGateway.persist(editorPreferences);
  }

  subscribeToPreferences(
    callback: (editorPreferences: EditorPreferences) => void,
  ): Promise<() => void> {
    return this.#preferencesGateway.listen(callback);
  }

  changeMultiCursorModifier(
    currentPreferences: EditorPreferences,
    multiCursorModifier: MultiCursorModifier,
  ): EditorPreferences {
    if (currentPreferences.multiCursorModifier === multiCursorModifier) {
      return currentPreferences;
    }

    return this.#preferencesGateway.normalize({
      ...currentPreferences,
      multiCursorModifier,
    });
  }

  changeAppFont(currentPreferences: EditorPreferences, appFontId: AppFontId): EditorPreferences {
    if (currentPreferences.appFontId === appFontId) {
      return currentPreferences;
    }

    return this.#preferencesGateway.normalize({
      ...currentPreferences,
      appFontId,
    });
  }

  changeEditFont(currentPreferences: EditorPreferences, editFontId: EditFontId): EditorPreferences {
    if (currentPreferences.editFontId === editFontId) {
      return currentPreferences;
    }

    return this.#preferencesGateway.normalize({
      ...currentPreferences,
      editFontId,
    });
  }

  changeEditFontSize(currentPreferences: EditorPreferences, editFontSizePx: EditFontSizePx): EditorPreferences {
    const nextEditFontSizePx = this.#preferencesGateway.normalize({
      ...currentPreferences,
      editFontSizePx,
    }).editFontSizePx;

    if (currentPreferences.editFontSizePx === nextEditFontSizePx) {
      return currentPreferences;
    }

    return this.#preferencesGateway.normalize({
      ...currentPreferences,
      editFontSizePx: nextEditFontSizePx,
    });
  }

  changeSystemFontSize(
    currentPreferences: EditorPreferences,
    systemFontSizePx: SystemFontSizePx,
  ): EditorPreferences {
    const nextSystemFontSizePx = this.#preferencesGateway.normalize({
      ...currentPreferences,
      systemFontSizePx,
    }).systemFontSizePx;

    if (currentPreferences.systemFontSizePx === nextSystemFontSizePx) {
      return currentPreferences;
    }

    return this.#preferencesGateway.normalize({
      ...currentPreferences,
      systemFontSizePx: nextSystemFontSizePx,
    });
  }

  changeShowLineNumbers(currentPreferences: EditorPreferences, showLineNumbers: boolean): EditorPreferences {
    if (currentPreferences.showLineNumbers === showLineNumbers) {
      return currentPreferences;
    }

    return this.#preferencesGateway.normalize({
      ...currentPreferences,
      showLineNumbers,
    });
  }

  changeLineWrappingEnabled(
    currentPreferences: EditorPreferences,
    lineWrappingEnabled: boolean,
  ): EditorPreferences {
    if (currentPreferences.lineWrappingEnabled === lineWrappingEnabled) {
      return currentPreferences;
    }

    return this.#preferencesGateway.normalize({
      ...currentPreferences,
      lineWrappingEnabled,
    });
  }

  changeStartupEditMode(currentPreferences: EditorPreferences, startupEditMode: StartupEditMode): EditorPreferences {
    if (currentPreferences.startupEditMode === startupEditMode) {
      return currentPreferences;
    }

    return this.#preferencesGateway.normalize({
      ...currentPreferences,
      startupEditMode,
    });
  }

  changeWindowsStartupTrayResident(
    currentPreferences: EditorPreferences,
    windowsStartupTrayResidentEnabled: boolean,
  ): EditorPreferences {
    if (currentPreferences.windowsStartupTrayResidentEnabled === windowsStartupTrayResidentEnabled) {
      return currentPreferences;
    }

    return this.#preferencesGateway.normalize({
      ...currentPreferences,
      windowsStartupTrayResidentEnabled,
    });
  }
}
