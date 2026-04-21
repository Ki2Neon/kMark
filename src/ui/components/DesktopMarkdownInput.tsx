import Editor, { loader, type OnMount } from "@monaco-editor/react";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { MARKDOWN_SNIPPET_DEFINITIONS, getMarkdownEnterAction, getMarkdownTabAction } from "../../domain/markdownEditing";
import { type MultiCursorModifier } from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";

const monacoEnvironmentTarget = self as typeof self & {
  MonacoEnvironment?: {
    getWorker: (moduleId: string, label: string) => Worker;
  };
  __kmarkMarkdownCompletionProvider?: monaco.IDisposable;
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

function ensureMarkdownCompletionProvider() {
  if (monacoEnvironmentTarget.__kmarkMarkdownCompletionProvider !== undefined) {
    return;
  }

  monacoEnvironmentTarget.__kmarkMarkdownCompletionProvider = monaco.languages.registerCompletionItemProvider("markdown", {
    provideCompletionItems(model, position) {
      const wordUntilPosition = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        wordUntilPosition.startColumn,
        position.lineNumber,
        wordUntilPosition.endColumn,
      );

      return {
        suggestions: MARKDOWN_SNIPPET_DEFINITIONS.map((snippetDefinition, index) => ({
          label: snippetDefinition.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: snippetDefinition.detail,
          documentation: snippetDefinition.documentation,
          filterText: snippetDefinition.filterText,
          insertText: snippetDefinition.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: `${String(index).padStart(2, "0")}-${snippetDefinition.label}`,
        })),
      };
    },
  });
}

ensureMarkdownCompletionProvider();

function handleMarkdownEnter(editor: monaco.editor.IStandaloneCodeEditor): boolean {
  const editorModel = editor.getModel();
  const selection = editor.getSelection();

  if (editorModel === null || selection === null || !selection.isEmpty()) {
    return false;
  }

  const cursorOffset = editorModel.getOffsetAt(selection.getPosition());
  const enterAction = getMarkdownEnterAction(editorModel.getValue(), cursorOffset);

  if (enterAction === null) {
    return false;
  }

  const rangeStart = editorModel.getPositionAt(enterAction.rangeStart);
  const rangeEnd = editorModel.getPositionAt(enterAction.rangeEnd);

  editor.executeEdits("kmark-markdown-enter", [{
    range: new monaco.Range(rangeStart.lineNumber, rangeStart.column, rangeEnd.lineNumber, rangeEnd.column),
    text: enterAction.text,
    forceMoveMarkers: true,
  }]);

  const nextPosition = editorModel.getPositionAt(enterAction.rangeStart + enterAction.text.length);

  editor.setPosition(nextPosition);
  editor.revealPositionInCenterIfOutsideViewport(nextPosition);

  return true;
}

function handleMarkdownTab(editor: monaco.editor.IStandaloneCodeEditor, isOutdent: boolean): boolean {
  const editorModel = editor.getModel();
  const selection = editor.getSelection();

  if (editorModel === null || selection === null) {
    return false;
  }

  const tabAction = getMarkdownTabAction(
    editorModel.getValue(),
    editorModel.getOffsetAt(selection.getStartPosition()),
    editorModel.getOffsetAt(selection.getEndPosition()),
    isOutdent,
  );

  if (tabAction === null) {
    return false;
  }

  const rangeStart = editorModel.getPositionAt(tabAction.rangeStart);
  const rangeEnd = editorModel.getPositionAt(tabAction.rangeEnd);

  editor.executeEdits("kmark-markdown-tab", [{
    range: new monaco.Range(rangeStart.lineNumber, rangeStart.column, rangeEnd.lineNumber, rangeEnd.column),
    text: tabAction.text,
    forceMoveMarkers: true,
  }]);

  const nextSelectionStart = editorModel.getPositionAt(tabAction.nextSelectionStart);
  const nextSelectionEnd = editorModel.getPositionAt(tabAction.nextSelectionEnd);

  editor.setSelection(new monaco.Selection(
    nextSelectionStart.lineNumber,
    nextSelectionStart.column,
    nextSelectionEnd.lineNumber,
    nextSelectionEnd.column,
  ));

  if (tabAction.nextSelectionStart === tabAction.nextSelectionEnd) {
    editor.revealPositionInCenterIfOutsideViewport(nextSelectionEnd);
  }

  return true;
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

    editor.addCommand(monaco.KeyCode.Enter, () => {
      if (handleMarkdownEnter(editor)) {
        return;
      }

      editor.trigger("keyboard", "type", { text: "\n" });
    }, "editorTextFocus && !editorHasSelection && !suggestWidgetVisible && !inSnippetMode");

    editor.addCommand(monaco.KeyCode.Tab, () => {
      if (handleMarkdownTab(editor, false)) {
        return;
      }

      editor.trigger("keyboard", "type", { text: "  " });
    }, "editorTextFocus && !suggestWidgetVisible && !inSnippetMode");

    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Tab, () => {
      handleMarkdownTab(editor, true);
    }, "editorTextFocus && !suggestWidgetVisible && !inSnippetMode");

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
    acceptSuggestionOnEnter: "smart",
    automaticLayout: true,
    autoClosingBrackets: "languageDefined",
    autoClosingQuotes: "languageDefined",
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
    quickSuggestions: false,
    renderLineHighlight: "none",
    roundedSelection: false,
    scrollBeyondLastLine: false,
    snippetSuggestions: "top",
    suggest: {
      showKeywords: false,
      showWords: false,
      snippetsPreventQuickSuggestions: false,
    },
    suggestOnTriggerCharacters: false,
    tabSize: 2,
    wordBasedSuggestions: "off",
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