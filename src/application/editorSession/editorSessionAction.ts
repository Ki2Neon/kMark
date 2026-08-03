import { type EditorState } from "../../domain/editor";

export type EditorSessionAction =
  | { readonly type: "editor/bootstrapLoaded"; readonly state: EditorState }
  | { readonly type: "editor/contentChanged"; readonly content: string }
  | {
      readonly type: "editor/documentLoaded";
      readonly fileName: string;
      readonly filePath: string | null;
      readonly content: string;
      readonly loadedAt: number | null;
    }
  | { readonly type: "editor/documentReset" }
  | {
      readonly type: "editor/saveSucceeded";
      readonly fileName: string;
      readonly filePath: string | null;
      readonly savedAt: number;
    }
  | { readonly type: "editor/errorRaised"; readonly message: string }
  | { readonly type: "editor/errorCleared" };
