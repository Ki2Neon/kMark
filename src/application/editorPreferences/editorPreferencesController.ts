import {
  clampEditFontSizePx,
  type AppFontId,
  type EditFontId,
  type EditFontSizePx,
  type EditorPreferences,
  type MultiCursorModifier,
  type StartupEditMode,
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

  createState(): EditorPreferences {
    return this.#preferencesGateway.load();
  }

  canControlWindowsStartupTrayResident(syncWindowsStartupTrayResident: boolean): boolean {
    return syncWindowsStartupTrayResident && this.#windowsStartupTrayResidentGateway.supportsToggle();
  }

  persist(editorPreferences: EditorPreferences): void {
    this.#preferencesGateway.persist(editorPreferences);
  }

  async syncWindowsStartupTrayResidentPreference(
    enabled: boolean,
    canControlWindowsStartupTrayResident: boolean,
  ): Promise<void> {
    if (!canControlWindowsStartupTrayResident) {
      return;
    }

    await this.#windowsStartupTrayResidentGateway.syncPreference(enabled);
  }

  changeMultiCursorModifier(
    currentPreferences: EditorPreferences,
    multiCursorModifier: MultiCursorModifier,
  ): EditorPreferences {
    if (currentPreferences.multiCursorModifier === multiCursorModifier) {
      return currentPreferences;
    }

    return {
      ...currentPreferences,
      multiCursorModifier,
    };
  }

  changeAppFont(currentPreferences: EditorPreferences, appFontId: AppFontId): EditorPreferences {
    if (currentPreferences.appFontId === appFontId) {
      return currentPreferences;
    }

    return {
      ...currentPreferences,
      appFontId,
    };
  }

  changeEditFont(currentPreferences: EditorPreferences, editFontId: EditFontId): EditorPreferences {
    if (currentPreferences.editFontId === editFontId) {
      return currentPreferences;
    }

    return {
      ...currentPreferences,
      editFontId,
    };
  }

  changeEditFontSize(currentPreferences: EditorPreferences, editFontSizePx: EditFontSizePx): EditorPreferences {
    const nextEditFontSizePx = clampEditFontSizePx(editFontSizePx);

    if (currentPreferences.editFontSizePx === nextEditFontSizePx) {
      return currentPreferences;
    }

    return {
      ...currentPreferences,
      editFontSizePx: nextEditFontSizePx,
    };
  }

  changeShowLineNumbers(currentPreferences: EditorPreferences, showLineNumbers: boolean): EditorPreferences {
    if (currentPreferences.showLineNumbers === showLineNumbers) {
      return currentPreferences;
    }

    return {
      ...currentPreferences,
      showLineNumbers,
    };
  }

  changeStartupEditMode(currentPreferences: EditorPreferences, startupEditMode: StartupEditMode): EditorPreferences {
    if (currentPreferences.startupEditMode === startupEditMode) {
      return currentPreferences;
    }

    return {
      ...currentPreferences,
      startupEditMode,
    };
  }

  changeWindowsStartupTrayResident(
    currentPreferences: EditorPreferences,
    windowsStartupTrayResidentEnabled: boolean,
  ): EditorPreferences {
    if (currentPreferences.windowsStartupTrayResidentEnabled === windowsStartupTrayResidentEnabled) {
      return currentPreferences;
    }

    return {
      ...currentPreferences,
      windowsStartupTrayResidentEnabled,
    };
  }
}
