import { type EditorState } from "../../domain/editor";
import { type EditorSessionAction } from "./editorSessionAction";
import { type EditorStateRules } from "./editorSessionPorts";

export function createEditorSessionReducer(
  rules: EditorStateRules,
): (state: EditorState, action: EditorSessionAction) => EditorState {
  return (state, action) => rules.reduce(state, action);
}
