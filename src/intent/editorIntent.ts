import {
  createInitialEditorState,
  ensureMarkdownExtension,
  type EditorState,
} from "../domain/editor";

export type EditorAction =
  | { readonly type: "editor/contentChanged"; readonly content: string }
  | { readonly type: "editor/fileNameChanged"; readonly fileName: string }
  | {
      readonly type: "editor/documentLoaded";
      readonly fileName: string;
      readonly content: string;
      readonly loadedAt: number | null;
    }
  | { readonly type: "editor/documentReset" }
  | { readonly type: "editor/saveSucceeded"; readonly savedAt: number }
  | { readonly type: "editor/errorRaised"; readonly message: string }
  | { readonly type: "editor/errorCleared" };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "editor/contentChanged": {
      if (state.content === action.content) {
        return state;
      }

      return {
        ...state,
        content: action.content,
        isDirty: true,
        errorMessage: null,
      };
    }

    case "editor/fileNameChanged": {
      if (state.fileName === action.fileName) {
        return state;
      }

      return {
        ...state,
        fileName: action.fileName,
        isDirty: true,
      };
    }

    case "editor/documentLoaded": {
      return {
        ...state,
        fileName: ensureMarkdownExtension(action.fileName),
        content: action.content,
        isDirty: false,
        lastSavedAt: action.loadedAt,
        errorMessage: null,
      };
    }

    case "editor/documentReset": {
      return createInitialEditorState();
    }

    case "editor/saveSucceeded": {
      return {
        ...state,
        fileName: ensureMarkdownExtension(state.fileName),
        isDirty: false,
        lastSavedAt: action.savedAt,
        errorMessage: null,
      };
    }

    case "editor/errorRaised": {
      return {
        ...state,
        errorMessage: action.message,
      };
    }

    case "editor/errorCleared": {
      if (state.errorMessage === null) {
        return state;
      }

      return {
        ...state,
        errorMessage: null,
      };
    }

    default: {
      return state;
    }
  }
}