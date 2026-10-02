import { type EditorState } from "../../domain/editor";
import { type EditorSessionAction } from "./editorSessionAction";
import { type EditorStateRules } from "./editorSessionPorts";

export function createEditorSessionReducer(
  rules: EditorStateRules,
): (state: EditorState, action: EditorSessionAction) => EditorState {
  return (state, action) => {
    if (action.type === "editor/documentMutated") {
      return state.isDirty && state.errorMessage === null
        ? state
        : { ...state, isDirty: true, errorMessage: null };
    }
    if (action.type === "editor/documentDirtyResolved") {
      return state.isDirty === action.isDirty
        ? state
        : { ...state, isDirty: action.isDirty };
    }
    return rules.reduce(state, action);
  };
}
