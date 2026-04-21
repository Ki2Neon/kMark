import Editor, { loader, type OnMount } from "@monaco-editor/react";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { type MultiCursorModifier } from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";

const monacoEnvironmentTarget = self as typeof self & {
  MonacoEnvironment?: {
    getWorker: (moduleId: string, label: string) => Worker;
  };
};

loader.config({ monaco });
monacoEnvironmentTarget.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

function resolveEditorTheme(appThemeId: AppThemeId): "vs" | "vs-dark" {
  return appThemeId === "vscode-light" || appThemeId === "github-light" || appThemeId === "paper"
    ? "vs"
    : "vs-dark";
}

type DesktopMarkdownInputProps = {
  readonly appThemeId: AppThemeId;
  readonly content: string;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly onContentChange: (content: string) => void;
  readonly onCursorLineChange?: (lineNumber: number) => void;
  readonly onFocusChange?: (isFocused: boolean) => void;
  readonly requestedLineSelection?: {
    readonly lineNumber: number;
    readonly requestId: number;
  } | null;
};

function DesktopMarkdownInputComponent({
  appThemeId,
  content,
  multiCursorModifier,
  onContentChange,
  onCursorLineChange,
  onFocusChange,
  requestedLineSelection,
}: DesktopMarkdownInputProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleEditorChange = useCallback((value: string | undefined) => {
    onContentChange(value ?? "");
  }, [onContentChange]);

  useEffect(() => {
    if (requestedLineSelection === null || requestedLineSelection === undefined) {
      return;
    }

    const editor = editorRef.current;

    if (editor === null) {
      return;
    }

    const editorModel = editor.getModel();
    const maximumLineNumber = editorModel?.getLineCount() ?? 1;
    const nextLineNumber = Math.min(maximumLineNumber, Math.max(1, requestedLineSelection.lineNumber));

    editor.focus();
    editor.setPosition({ lineNumber: nextLineNumber, column: 1 });
    editor.revealLineInCenter(nextLineNumber);
    onCursorLineChange?.(nextLineNumber);
  }, [onCursorLineChange, requestedLineSelection]);

  const handleEditorMount = useCallback<OnMount>((editor) => {
    editorRef.current = editor;

    if (requestedLineSelection !== null && requestedLineSelection !== undefined) {
      const editorModel = editor.getModel();
      const maximumLineNumber = editorModel?.getLineCount() ?? 1;
      const nextLineNumber = Math.min(maximumLineNumber, Math.max(1, requestedLineSelection.lineNumber));

      editor.setPosition({ lineNumber: nextLineNumber, column: 1 });
      editor.revealLineInCenter(nextLineNumber);
    }

    const emitCursorLine = () => {
      onCursorLineChange?.(editor.getPosition()?.lineNumber ?? 1);
    };

    emitCursorLine();

    editor.onDidChangeCursorPosition((event) => {
      onCursorLineChange?.(event.position.lineNumber);
    });

    editor.onDidChangeModelContent(() => {
      emitCursorLine();
    });

    editor.onDidFocusEditorText(() => {
      onFocusChange?.(true);
      emitCursorLine();
    });

    editor.onDidBlurEditorText(() => {
      onFocusChange?.(false);
    });
  }, [onCursorLineChange, onFocusChange, requestedLineSelection]);

  const editorOptions = useMemo(() => ({
    automaticLayout: true,
    folding: false,
    fontFamily: '"Iosevka Term", "Cascadia Code", Consolas, monospace',
    fontSize: 15,
    glyphMargin: false,
    hideCursorInOverviewRuler: true,
    insertSpaces: true,
    lineDecorationsWidth: 8,
    lineNumbers: "off",
    matchBrackets: "never",
    minimap: { enabled: false },
    multiCursorModifier,
    overviewRulerBorder: false,
    overviewRulerLanes: 0,
    padding: { top: 16, bottom: 16 },
    renderLineHighlight: "none",
    roundedSelection: false,
    scrollBeyondLastLine: false,
    tabSize: 2,
    wordWrap: "on",
    wrappingIndent: "same",
  } as const), [multiCursorModifier]);

  return (
    <Editor
      height="100%"
      language="markdown"
      options={editorOptions}
      onChange={handleEditorChange}
      onMount={handleEditorMount}
      theme={resolveEditorTheme(appThemeId)}
      value={content}
    />
  );
}

export const DesktopMarkdownInput = memo(DesktopMarkdownInputComponent);