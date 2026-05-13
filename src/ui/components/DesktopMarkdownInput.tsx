import { autocompletion, completeFromList, completionKeymap, completionStatus, hasNextSnippetField, hasPrevSnippetField, snippetCompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, Prec, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, highlightActiveLineGutter, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import CodeMirror, { type ViewUpdate } from "@uiw/react-codemirror";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { resolveEditFontFamily } from "../../adapters/browser/browserRustCore";
import { MARKDOWN_SNIPPET_DEFINITIONS, getMarkdownEnterAction, getMarkdownTabAction } from "../../domain/markdownEditing";
import { type EditFontId, type MultiCursorModifier } from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";
import { createCodeMirrorKmarkCompletionSource } from "../../features/kmark-completion/adapter/codeMirrorKmarkCompletionSource";
import { createCodeMirrorKmarkValidationExtension } from "../../features/kmark-completion/adapter/codeMirrorKmarkValidationExtension";
import { createCodeMirrorMarkdownTableAutoFormatExtension } from "../../features/table-assist/adapter/codeMirrorMarkdownTableAutoFormatExtension";
import { createCodeMirrorMarkdownTableEditExtension } from "../../features/table-assist/adapter/codeMirrorMarkdownTableEditExtension";

const DESKTOP_EDITOR_BASIC_SETUP = {
  autocompletion: false,
  bracketMatching: false,
  completionKeymap: false,
  crosshairCursor: false,
  dropCursor: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  highlightSelectionMatches: false,
  indentOnInput: false,
  lineNumbers: false,
  rectangularSelection: false,
  searchKeymap: false,
  tabSize: 2,
} as const;

const EDITOR_CONTENT_ATTRIBUTES = EditorView.contentAttributes.of({
  "aria-label": "Markdown エディター",
  spellcheck: "false",
});

const setPreviewRequestedLineHighlightEffect = StateEffect.define<number>();

const previewRequestedLineHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(highlights, transaction) {
    const hasHighlightEffect = transaction.effects.some((effect) => (
      effect.is(setPreviewRequestedLineHighlightEffect)
    ));
    let nextHighlights = hasHighlightEffect || !(transaction.docChanged || transaction.selection !== undefined)
      ? highlights.map(transaction.changes)
      : Decoration.none;

    for (const effect of transaction.effects) {
      if (!effect.is(setPreviewRequestedLineHighlightEffect)) {
        continue;
      }

      const nextLineNumber = Math.min(
        transaction.state.doc.lines,
        Math.max(1, effect.value),
      );
      const nextLine = transaction.state.doc.line(nextLineNumber);
      nextHighlights = Decoration.set([
        Decoration.line({ class: "cm-previewRequestedLine" }).range(nextLine.from),
      ]);
    }

    return nextHighlights;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const MARKDOWN_SNIPPET_COMPLETIONS: readonly Completion[] = MARKDOWN_SNIPPET_DEFINITIONS.map((snippetDefinition, index) => (
  snippetCompletion(snippetDefinition.insertText, {
    detail: snippetDefinition.detail,
    info: snippetDefinition.documentation,
    label: snippetDefinition.label,
    sortText: `${String(index).padStart(2, "0")}-${snippetDefinition.label}`,
    type: "keyword",
  })
));

const MARKDOWN_SNIPPET_COMPLETION_SOURCE = completeFromList(MARKDOWN_SNIPPET_COMPLETIONS);
const KMARK_COMPLETION_SOURCE = createCodeMirrorKmarkCompletionSource();
const KMARK_VALIDATION_EXTENSION = createCodeMirrorKmarkValidationExtension();
const MARKDOWN_TABLE_AUTO_FORMAT_EXTENSION = createCodeMirrorMarkdownTableAutoFormatExtension();
const MARKDOWN_TABLE_EDIT_EXTENSION = createCodeMirrorMarkdownTableEditExtension();
const EDITOR_COMPLETION_SOURCE: CompletionSource = (context) => (
  KMARK_COMPLETION_SOURCE(context) ?? (context.explicit ? MARKDOWN_SNIPPET_COMPLETION_SOURCE(context) : null)
);

function isDarkEditorTheme(appThemeId: AppThemeId): boolean {
  return !(appThemeId === "vscode-light" || appThemeId === "github-light" || appThemeId === "paper");
}

function usesMetaKeyForCtrlCmd(): boolean {
  return /Mac|iPhone|iPad/u.test(window.navigator.platform);
}

function getCursorLineNumber(view: EditorView): number {
  return view.state.doc.lineAt(view.state.selection.main.head).number;
}

function isCompletionOrSnippetActive(view: EditorView): boolean {
  return completionStatus(view.state) === "active"
    || hasNextSnippetField(view.state)
    || hasPrevSnippetField(view.state);
}

function runMarkdownEnter(view: EditorView): boolean {
  if (view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty || isCompletionOrSnippetActive(view)) {
    return false;
  }

  const cursorOffset = view.state.selection.main.head;
  const enterAction = getMarkdownEnterAction(view.state.doc.toString(), cursorOffset);

  if (enterAction === null) {
    return false;
  }

  const nextSelection = EditorSelection.cursor(enterAction.rangeStart + enterAction.text.length);

  view.dispatch({
    changes: {
      from: enterAction.rangeStart,
      insert: enterAction.text,
      to: enterAction.rangeEnd,
    },
    effects: EditorView.scrollIntoView(nextSelection, { y: "center" }),
    selection: nextSelection,
  });

  return true;
}

function runMarkdownTab(view: EditorView, isOutdent: boolean): boolean {
  if (view.state.selection.ranges.length !== 1 || isCompletionOrSnippetActive(view)) {
    return false;
  }

  const selection = view.state.selection.main;
  const tabAction = getMarkdownTabAction(
    view.state.doc.toString(),
    selection.from,
    selection.to,
    isOutdent,
  );

  if (tabAction === null) {
    if (isOutdent) {
      return false;
    }

    const nextSelection = EditorSelection.cursor(selection.from + 2);

    view.dispatch({
      changes: {
        from: selection.from,
        insert: "  ",
        to: selection.to,
      },
      effects: EditorView.scrollIntoView(nextSelection, { y: "center" }),
      selection: nextSelection,
    });

    return true;
  }

  const nextSelection = EditorSelection.range(tabAction.nextSelectionStart, tabAction.nextSelectionEnd);

  view.dispatch({
    changes: {
      from: tabAction.rangeStart,
      insert: tabAction.text,
      to: tabAction.rangeEnd,
    },
    effects: EditorView.scrollIntoView(nextSelection, { y: "center" }),
    selection: nextSelection,
  });

  return true;
}

type DesktopMarkdownInputProps = {
  readonly appThemeId: AppThemeId;
  readonly blurOnEscapeWhenSelectionEmpty?: boolean;
  readonly content: string;
  readonly editFontId: EditFontId;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly showLineNumbers: boolean;
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
  blurOnEscapeWhenSelectionEmpty = false,
  content,
  editFontId,
  multiCursorModifier,
  showLineNumbers,
  onContentChange,
  onCursorLineChange,
  onFocusChange,
  requestedLineSelection,
}: DesktopMarkdownInputProps) {
  const editorRef = useRef<EditorView | null>(null);
  const lastHandledLineSelectionRequestIdRef = useRef<number | null>(null);
  const lastEmittedCursorLineRef = useRef<number | null>(null);

  const emitCursorLine = useCallback((view: EditorView) => {
    const nextCursorLine = getCursorLineNumber(view);

    if (lastEmittedCursorLineRef.current === nextCursorLine) {
      return;
    }

    lastEmittedCursorLineRef.current = nextCursorLine;
    onCursorLineChange?.(nextCursorLine);
  }, [onCursorLineChange]);

  const applyRequestedLineSelection = useCallback((view: EditorView, request: NonNullable<DesktopMarkdownInputProps["requestedLineSelection"]>) => {
    const maximumLineNumber = view.state.doc.lines;
    const nextLineNumber = Math.min(maximumLineNumber, Math.max(1, request.lineNumber));
    const nextCursorOffset = view.state.doc.line(nextLineNumber).from;

    lastHandledLineSelectionRequestIdRef.current = request.requestId;
    lastEmittedCursorLineRef.current = nextLineNumber;
    view.focus();
    view.dispatch({
      effects: [
        EditorView.scrollIntoView(nextCursorOffset, { y: "center" }),
        setPreviewRequestedLineHighlightEffect.of(nextLineNumber),
      ],
      selection: EditorSelection.cursor(nextCursorOffset),
    });
    onCursorLineChange?.(nextLineNumber);
  }, [onCursorLineChange]);

  useEffect(() => {
    if (requestedLineSelection === null || requestedLineSelection === undefined) {
      return;
    }

    if (lastHandledLineSelectionRequestIdRef.current === requestedLineSelection.requestId) {
      return;
    }

    const editor = editorRef.current;

    if (editor === null) {
      return;
    }

    applyRequestedLineSelection(editor, requestedLineSelection);
  }, [applyRequestedLineSelection, requestedLineSelection]);

  useEffect(() => (
    () => {
      editorRef.current = null;
    }
  ), []);

  const handleEditorChange = useCallback((value: string) => {
    onContentChange(value);
  }, [onContentChange]);

  const handleEditorCreate = useCallback((view: EditorView) => {
    editorRef.current = view;

    if (requestedLineSelection !== null && requestedLineSelection !== undefined) {
      applyRequestedLineSelection(view, requestedLineSelection);
      return;
    }

    emitCursorLine(view);
  }, [applyRequestedLineSelection, emitCursorLine, requestedLineSelection]);

  const handleEditorUpdate = useCallback((viewUpdate: ViewUpdate) => {
    if (viewUpdate.focusChanged) {
      onFocusChange?.(viewUpdate.view.hasFocus);
    }

    if (viewUpdate.docChanged || viewUpdate.selectionSet || viewUpdate.focusChanged) {
      emitCursorLine(viewUpdate.view);
    }
  }, [emitCursorLine, onFocusChange]);

  const editorTheme = useMemo(() => EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: "var(--text)",
      fontFamily: resolveEditFontFamily(editFontId),
      fontSize: "var(--edit-font-size)",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "var(--text)",
      padding: "0 16px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--text)",
    },
    ".cm-editor": {
      height: "100%",
    },
    ".cm-focused": {
      outline: "none",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: "var(--text-soft)",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-previewRequestedLine": {
      backgroundColor: "color-mix(in srgb, var(--focus) 15%, transparent)",
    },
    ".cm-panels": {
      backgroundColor: "var(--surface-muted)",
      borderBottom: "1px solid var(--border)",
      color: "var(--text)",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      lineHeight: "1.7",
      overflow: "auto",
      padding: "16px 0",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "color-mix(in srgb, var(--focus) 35%, transparent)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--surface-muted)",
      border: "1px solid var(--border)",
      color: "var(--text)",
    },
    ".cm-tooltip-autocomplete": {
      fontFamily: "inherit",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "color-mix(in srgb, var(--focus) 18%, var(--surface-muted))",
      color: "var(--text)",
    },
  }, {
    dark: isDarkEditorTheme(appThemeId),
  }), [appThemeId, editFontId]);

  const extensions = useMemo<Extension[]>(() => {
    const ctrlCmdUsesMetaKey = usesMetaKeyForCtrlCmd();
    const editorKeyBindings = [
      {
        key: "Enter",
        run: runMarkdownEnter,
      },
      {
        key: "Shift-Tab",
        run: (view: EditorView) => runMarkdownTab(view, true),
      },
      {
        key: "Tab",
        run: (view: EditorView) => runMarkdownTab(view, false),
      },
    ];

    if (blurOnEscapeWhenSelectionEmpty) {
      editorKeyBindings.unshift({
        key: "Escape",
        run: (view: EditorView) => {
          if (!view.hasFocus || view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty || isCompletionOrSnippetActive(view)) {
            return false;
          }

          const activeElement = view.dom.ownerDocument.activeElement;

          if (activeElement instanceof HTMLElement && view.dom.contains(activeElement)) {
            activeElement.blur();
            return true;
          }

          view.contentDOM.blur();
          return true;
        },
      });
    }

    return [
      markdown(),
      previewRequestedLineHighlightField,
      KMARK_VALIDATION_EXTENSION,
      MARKDOWN_TABLE_EDIT_EXTENSION,
      MARKDOWN_TABLE_AUTO_FORMAT_EXTENSION,
      ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
      EditorView.lineWrapping,
      EDITOR_CONTENT_ATTRIBUTES,
      autocompletion({
        activateOnTyping: true,
        override: [EDITOR_COMPLETION_SOURCE],
      }),
      keymap.of(completionKeymap),
      Prec.highest(keymap.of(editorKeyBindings)),
      EditorView.clickAddsSelectionRange.of((event) => (
        multiCursorModifier === "alt"
          ? event.altKey
          : ctrlCmdUsesMetaKey
            ? event.metaKey
            : event.ctrlKey
      )),
      editorTheme,
    ];
  }, [blurOnEscapeWhenSelectionEmpty, editorTheme, multiCursorModifier, showLineNumbers]);

  return (
    <CodeMirror
      basicSetup={DESKTOP_EDITOR_BASIC_SETUP}
      height="100%"
      indentWithTab={false}
      onChange={handleEditorChange}
      onCreateEditor={handleEditorCreate}
      onUpdate={handleEditorUpdate}
      placeholder="ここに Markdown を書きます"
      theme={isDarkEditorTheme(appThemeId) ? "dark" : "light"}
      value={content}
      extensions={extensions}
    />
  );
}

export const DesktopMarkdownInput = memo(DesktopMarkdownInputComponent);
