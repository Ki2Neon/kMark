import {
  createInitialEditorState,
  ensureMarkdownExtension,
  type EditorState,
} from "../../domain/editor";
import { type EditorSessionAction } from "./editorSessionAction";

export function editorSessionReducer(state: EditorState, action: EditorSessionAction): EditorState {
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
        fileName: ensureMarkdownExtension(action.fileName),
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
