import { type EditorStateRules } from "../../application/editorSession/editorSessionPorts";
import { createStartupEditorState, reduceEditorState } from "./browserRustCore";

export function createBrowserEditorStateRules(): EditorStateRules {
  return {
    createStartupState(startupEditMode, storedEdit) {
      return createStartupEditorState(startupEditMode, storedEdit);
    },
    reduce(state, action) {
      return reduceEditorState(state, action);
    },
  };
}
