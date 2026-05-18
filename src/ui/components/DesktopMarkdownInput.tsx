import { autocompletion, completeFromList, completionKeymap, completionStatus, hasNextSnippetField, hasPrevSnippetField, snippetCompletion, startCompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, Prec, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, highlightActiveLineGutter, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import CodeMirror, { type ViewUpdate } from "@uiw/react-codemirror";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { resolveEditFontFamily } from "../../adapters/browser/browserRustCore";
import { MARKDOWN_SNIPPET_DEFINITIONS, getMarkdownEnterAction, getMarkdownSelectionWrapAction, getMarkdownTabAction } from "../../domain/markdownEditing";
import { type EditFontId, type MultiCursorModifier } from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";
import { createCodeMirrorKmarkCompletionSource } from "../../features/kmark-completion/adapter/codeMirrorKmarkCompletionSource";
import { createCodeMirrorKmarkValidationExtension } from "../../features/kmark-completion/adapter/codeMirrorKmarkValidationExtension";
import { createCodeMirrorKmarkScopeDisplayExtension } from "../../features/kmark-scope-display/adapter/codeMirrorKmarkScopeDisplayExtension";
import { createCodeMirrorMarkdownTableAutoFormatExtension } from "../../features/table-assist/adapter/codeMirrorMarkdownTableAutoFormatExtension";
import { createCodeMirrorMarkdownTableEditExtension } from "../../features/table-assist/adapter/codeMirrorMarkdownTableEditExtension";
import { listMarkdownPathSuggestions } from "../../infra/markdownPathSuggestions";
import { isTauri, listenRuntimeDragDropEvent, type RuntimeDragDropEvent } from "../../runtime/runtime";
import { MobileInputHelperBar, type MobileEditorInsertAdapter } from "./MobileInputHelperBar";

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
const setAssetDropLineHighlightEffect = StateEffect.define<number | null>();

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

const assetDropLineHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(highlights, transaction) {
    let nextHighlights = transaction.docChanged
      ? highlights.map(transaction.changes)
      : highlights;

    for (const effect of transaction.effects) {
      if (!effect.is(setAssetDropLineHighlightEffect)) {
        continue;
      }

      if (effect.value === null) {
        nextHighlights = Decoration.none;
        continue;
      }

      const nextLineNumber = Math.min(
        transaction.state.doc.lines,
        Math.max(1, effect.value),
      );
      const nextLine = transaction.state.doc.line(nextLineNumber);
      nextHighlights = Decoration.set([
        Decoration.line({ class: "cm-assetDropLine" }).range(nextLine.from),
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
const KMARK_VALIDATION_EXTENSION = createCodeMirrorKmarkValidationExtension();
const KMARK_SCOPE_DISPLAY_EXTENSION = createCodeMirrorKmarkScopeDisplayExtension();
const MARKDOWN_TABLE_AUTO_FORMAT_EXTENSION = createCodeMirrorMarkdownTableAutoFormatExtension();
const MARKDOWN_TABLE_EDIT_EXTENSION = createCodeMirrorMarkdownTableEditExtension();

function isDarkEditorTheme(appThemeId: AppThemeId): boolean {
  return !(appThemeId === "vscode-light" || appThemeId === "github-light" || appThemeId === "paper");
}

function usesMetaKeyForCtrlCmd(): boolean {
  return /Mac|iPhone|iPad/u.test(window.navigator.platform);
}

function getCursorLineNumber(view: EditorView): number {
  return view.state.doc.lineAt(view.state.selection.main.head).number;
}

function clampEditorPosition(position: number, maximumPosition: number): number {
  return Math.min(maximumPosition, Math.max(0, position));
}

function createBoundedEditorSelection(view: EditorView, selection: EditorSelection): EditorSelection {
  const maximumPosition = view.state.doc.length;
  const ranges = selection.ranges.map((range) => (
    EditorSelection.range(
      clampEditorPosition(range.anchor, maximumPosition),
      clampEditorPosition(range.head, maximumPosition),
    )
  ));

  if (ranges.length === 0) {
    return EditorSelection.create([EditorSelection.cursor(0)]);
  }

  return EditorSelection.create(
    ranges,
    Math.min(selection.mainIndex, Math.max(0, ranges.length - 1)),
  );
}

function isCompletionOrSnippetActive(view: EditorView): boolean {
  return completionStatus(view.state) === "active"
    || hasNextSnippetField(view.state)
    || hasPrevSnippetField(view.state);
}

function runMarkdownSelectionWrap(view: EditorView, inputText: string): boolean {
  if (view.state.selection.ranges.length === 0 || isCompletionOrSnippetActive(view)) {
    return false;
  }

  const wrapAction = getMarkdownSelectionWrapAction(
    view.state.doc.toString(),
    view.state.selection.ranges.map((range) => ({
      anchor: range.anchor,
      head: range.head,
    })),
    inputText,
  );

  if (wrapAction === null) {
    return false;
  }

  const nextSelectionRanges = wrapAction.nextSelections.map((selection) => (
    EditorSelection.range(selection.anchor, selection.head)
  ));

  view.dispatch({
    changes: wrapAction.changes.map((change) => ({
      from: change.rangeStart,
      insert: change.text,
      to: change.rangeEnd,
    })),
    selection: EditorSelection.create(
      nextSelectionRanges,
      Math.min(view.state.selection.mainIndex, nextSelectionRanges.length - 1),
    ),
  });

  return true;
}

const MARKDOWN_SELECTION_WRAP_EXTENSION = EditorView.domEventHandlers({
  beforeinput: (event, view) => {
    if (
      view.composing
      || event.isComposing
      || event.inputType !== "insertText"
      || event.data === null
    ) {
      return false;
    }

    if (!runMarkdownSelectionWrap(view, event.data)) {
      return false;
    }

    event.preventDefault();
    return true;
  },
});

type KmarkShortcutInsertion = {
  readonly cursorOffset: number;
  readonly shouldStartCompletion: boolean;
  readonly text: string;
};

const EMPTY_LINE_COMMENT_INSERTION = "<!--  -->";
const EMPTY_LINE_COMMENT_CURSOR_OFFSET = "<!-- ".length;
const LINE_COMMENT_PREFIX = "<!-- ";
const LINE_COMMENT_SUFFIX = " -->";
const FULL_LINE_HTML_COMMENT_PATTERN = /^<!--\s?([\s\S]*?)\s?-->$/u;

const KMARK_SHORTCUT_INSERTIONS: Record<"close" | "open" | "parameter", KmarkShortcutInsertion> = {
  close: {
    cursorOffset: "<!--k}-->".length,
    shouldStartCompletion: false,
    text: "<!--k}-->",
  },
  open: {
    cursorOffset: "<!--k{ ".length,
    shouldStartCompletion: true,
    text: "<!--k{ -->",
  },
  parameter: {
    cursorOffset: "<!--k ".length,
    shouldStartCompletion: true,
    text: "<!--k -->",
  },
};

function resolveKmarkShortcutInsertion(event: KeyboardEvent): KmarkShortcutInsertion | null {
  if (!event.shiftKey || event.altKey || !(event.ctrlKey || event.metaKey)) {
    return null;
  }

  if (event.key === "{" || event.code === "BracketLeft") {
    return KMARK_SHORTCUT_INSERTIONS.open;
  }

  if (event.key === "}" || event.code === "BracketRight") {
    return KMARK_SHORTCUT_INSERTIONS.close;
  }

  if (event.key === "/" || event.key === "?" || event.code === "Slash") {
    return KMARK_SHORTCUT_INSERTIONS.parameter;
  }

  return null;
}

function isCtrlSlashEvent(event: KeyboardEvent): boolean {
  return !event.altKey
    && !event.shiftKey
    && (event.ctrlKey || event.metaKey)
    && (event.key === "/" || event.code === "Slash");
}

function runLineCommentInsertion(view: EditorView): boolean {
  if (view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty) {
    return false;
  }

  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  const indentLength = line.text.match(/^\s*/u)?.[0].length ?? 0;
  const contentText = line.text.slice(indentLength).trimEnd();
  const existingCommentMatch = FULL_LINE_HTML_COMMENT_PATTERN.exec(contentText);

  if (existingCommentMatch !== null) {
    const uncommentedText = existingCommentMatch[1] ?? "";
    const nextSelection = EditorSelection.cursor(line.from + indentLength + uncommentedText.length);

    view.dispatch({
      changes: {
        from: line.from + indentLength,
        insert: uncommentedText,
        to: line.to,
      },
      scrollIntoView: true,
      selection: nextSelection,
    });

    return true;
  }

  if (line.text.trim().length > 0) {
    const content = contentText;
    const insertion = `${LINE_COMMENT_PREFIX}${content}${LINE_COMMENT_SUFFIX}`;
    const nextSelection = EditorSelection.cursor(line.from + indentLength + LINE_COMMENT_PREFIX.length + content.length);

    view.dispatch({
      changes: {
        from: line.from + indentLength,
        insert: insertion,
        to: line.to,
      },
      scrollIntoView: true,
      selection: nextSelection,
    });

    return true;
  }

  const emptyLineIndentLength = line.text.length;
  const nextSelection = EditorSelection.cursor(line.from + emptyLineIndentLength + EMPTY_LINE_COMMENT_CURSOR_OFFSET);

  view.dispatch({
    changes: {
      from: line.from + emptyLineIndentLength,
      insert: EMPTY_LINE_COMMENT_INSERTION,
      to: line.to,
    },
    scrollIntoView: true,
    selection: nextSelection,
  });

  return true;
}

function runKmarkShortcutInsertion(view: EditorView, insertion: KmarkShortcutInsertion): void {
  const transaction = view.state.changeByRange((range) => ({
    changes: {
      from: range.from,
      insert: insertion.text,
      to: range.to,
    },
    range: EditorSelection.cursor(range.from + insertion.cursorOffset),
  }));

  view.dispatch({
    ...transaction,
    scrollIntoView: true,
  });

  if (insertion.shouldStartCompletion) {
    startCompletion(view);
  }
}

const KMARK_SHORTCUT_INSERTION_EXTENSION = Prec.highest(EditorView.domEventHandlers({
  keydown: (event, view) => {
    if (view.composing || event.isComposing) {
      return false;
    }

    if (isCtrlSlashEvent(event) && runLineCommentInsertion(view)) {
      event.preventDefault();
      return true;
    }

    const insertion = resolveKmarkShortcutInsertion(event);

    if (insertion === null) {
      return false;
    }

    event.preventDefault();
    runKmarkShortcutInsertion(view, insertion);
    return true;
  },
}));

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

type TauriDragDropEvent = RuntimeDragDropEvent;

type ClientPoint = {
  readonly x: number;
  readonly y: number;
};

function toClientPoint(position: { readonly x: number; readonly y: number }): ClientPoint {
  const scale = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;

  return {
    x: position.x / scale,
    y: position.y / scale,
  };
}

function containsPoint(rect: DOMRect, point: ClientPoint): boolean {
  return point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top
    && point.y <= rect.bottom;
}

function resolveAssetDropLineNumber(
  view: EditorView,
  position: { readonly x: number; readonly y: number },
): number | null {
  const point = toClientPoint(position);

  if (!containsPoint(view.dom.getBoundingClientRect(), point)) {
    return null;
  }

  const offset = view.posAtCoords(point);

  if (offset === null) {
    return null;
  }

  return view.state.doc.lineAt(offset).number;
}

function setAssetDropLineHighlight(view: EditorView, lineNumber: number | null): void {
  view.dispatch({
    effects: setAssetDropLineHighlightEffect.of(lineNumber),
  });
}

function insertDroppedAssetMarkdown(view: EditorView, lineNumber: number, markdownText: string): void {
  const nextLineNumber = Math.min(view.state.doc.lines, Math.max(1, lineNumber));
  const nextLine = view.state.doc.line(nextLineNumber);
  const insertText = nextLine.length === 0
    ? `${markdownText}\n`
    : `${markdownText}\n\n`;
  const nextSelection = EditorSelection.cursor(nextLine.from + insertText.length);

  view.focus();
  view.dispatch({
    changes: {
      from: nextLine.from,
      insert: insertText,
    },
    effects: [
      setAssetDropLineHighlightEffect.of(null),
      EditorView.scrollIntoView(nextSelection, { y: "center" }),
    ],
    selection: nextSelection,
  });
}

type DesktopMarkdownInputProps = {
  readonly appThemeId: AppThemeId;
  readonly blurOnEscapeWhenSelectionEmpty?: boolean;
  readonly content: string;
  readonly currentDocumentFilePath?: string | null;
  readonly editFontId: EditFontId;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly showLineNumbers: boolean;
  readonly onAssetDrop?: (droppedFilePaths: readonly string[]) => Promise<string | null>;
  readonly onContentChange: (content: string) => void;
  readonly onCursorLineChange?: (lineNumber: number) => void;
  readonly onFocusChange?: (isFocused: boolean) => void;
  readonly requestedLineSelection?: {
    readonly lineNumber: number;
    readonly requestId: number;
  } | null;
  readonly showMobileInputHelperBar?: boolean;
};

function DesktopMarkdownInputComponent({
  appThemeId,
  blurOnEscapeWhenSelectionEmpty = false,
  content,
  currentDocumentFilePath = null,
  editFontId,
  multiCursorModifier,
  showLineNumbers,
  onAssetDrop,
  onContentChange,
  onCursorLineChange,
  onFocusChange,
  requestedLineSelection,
  showMobileInputHelperBar = false,
}: DesktopMarkdownInputProps) {
  const editorRef = useRef<EditorView | null>(null);
  const latestContentRef = useRef(content);
  const lastSelectionRef = useRef<EditorSelection | null>(null);
  const lastHandledLineSelectionRequestIdRef = useRef<number | null>(null);
  const lastEmittedCursorLineRef = useRef<number | null>(null);
  latestContentRef.current = content;

  const emitCursorLine = useCallback((view: EditorView) => {
    const nextCursorLine = getCursorLineNumber(view);

    if (lastEmittedCursorLineRef.current === nextCursorLine) {
      return;
    }

    lastEmittedCursorLineRef.current = nextCursorLine;
    onCursorLineChange?.(nextCursorLine);
  }, [onCursorLineChange]);

  const saveEditorSelection = useCallback(() => {
    const editor = editorRef.current;

    if (editor === null) {
      return;
    }

    lastSelectionRef.current = editor.state.selection;
  }, []);

  const restoreEditorSelection = useCallback(() => {
    const editor = editorRef.current;

    if (editor === null || lastSelectionRef.current === null) {
      return;
    }

    editor.dispatch({
      selection: createBoundedEditorSelection(editor, lastSelectionRef.current),
    });
    lastSelectionRef.current = editor.state.selection;
  }, []);

  const focusEditor = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const insertEditorText = useCallback((text: string) => {
    const editor = editorRef.current;

    if (editor === null) {
      return;
    }

    if (lastSelectionRef.current !== null) {
      editor.dispatch({
        selection: createBoundedEditorSelection(editor, lastSelectionRef.current),
      });
    }

    editor.dispatch({
      ...editor.state.replaceSelection(text),
      scrollIntoView: true,
    });
    editor.focus();
    lastSelectionRef.current = editor.state.selection;
    emitCursorLine(editor);
  }, [emitCursorLine]);

  const mobileInsertAdapter = useMemo<MobileEditorInsertAdapter>(() => ({
    focusEditor,
    insertText: insertEditorText,
    restoreSelection: restoreEditorSelection,
    saveSelection: saveEditorSelection,
  }), [focusEditor, insertEditorText, restoreEditorSelection, saveEditorSelection]);

  const kmarkCompletionSource = useMemo(
    () => createCodeMirrorKmarkCompletionSource({
      markdownFilePath: currentDocumentFilePath,
      pathCompletionProvider: listMarkdownPathSuggestions,
    }),
    [currentDocumentFilePath],
  );
  const editorCompletionSource = useMemo<CompletionSource>(
    () => async (context) => {
      const kmarkResult = await kmarkCompletionSource(context);

      return kmarkResult ?? (context.explicit ? MARKDOWN_SNIPPET_COMPLETION_SOURCE(context) : null);
    },
    [kmarkCompletionSource],
  );

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
    if (value === latestContentRef.current) {
      return;
    }

    onContentChange(value);
  }, [onContentChange]);

  const handleEditorCreate = useCallback((view: EditorView) => {
    editorRef.current = view;
    lastSelectionRef.current = view.state.selection;

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
      lastSelectionRef.current = viewUpdate.view.state.selection;
      emitCursorLine(viewUpdate.view);
    }
  }, [emitCursorLine, onFocusChange]);

  const handleTauriDragDropEvent = useCallback(async (event: TauriDragDropEvent) => {
    const editor = editorRef.current;

    if (editor === null) {
      return;
    }

    if (event.payload.type === "leave") {
      setAssetDropLineHighlight(editor, null);
      return;
    }

    const lineNumber = resolveAssetDropLineNumber(editor, event.payload.position);

    if (event.payload.type === "enter" || event.payload.type === "over") {
      setAssetDropLineHighlight(editor, lineNumber);
      return;
    }

    if (event.payload.type !== "drop") {
      setAssetDropLineHighlight(editor, null);
      return;
    }

    setAssetDropLineHighlight(editor, lineNumber);

    if (lineNumber === null || event.payload.paths.length === 0 || onAssetDrop === undefined) {
      setAssetDropLineHighlight(editor, null);
      return;
    }

    const markdownText = await onAssetDrop(event.payload.paths);

    const currentEditor = editorRef.current;

    if (currentEditor === null) {
      return;
    }

    if (markdownText === null || markdownText.length === 0) {
      setAssetDropLineHighlight(currentEditor, null);
      return;
    }

    insertDroppedAssetMarkdown(currentEditor, lineNumber, markdownText);
  }, [onAssetDrop]);

  useEffect(() => {
    if (!isTauri() || onAssetDrop === undefined) {
      return;
    }

    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void listenRuntimeDragDropEvent((event) => {
      void handleTauriDragDropEvent(event);
    })
      .then((nextUnlisten) => {
        if (isDisposed) {
          nextUnlisten();
          return;
        }

        unlisten = nextUnlisten;
      })
      .catch(() => {});

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [handleTauriDragDropEvent, onAssetDrop]);

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
    ".cm-assetDropLine": {
      backgroundColor: "color-mix(in srgb, var(--focus) 24%, transparent)",
      boxShadow: "inset 3px 0 0 var(--focus)",
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
      padding: showMobileInputHelperBar
        ? "16px 0 calc(16px + var(--mobile-input-helper-height) + env(safe-area-inset-bottom))"
        : "16px 0",
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
  }), [appThemeId, editFontId, showMobileInputHelperBar]);

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
      assetDropLineHighlightField,
      KMARK_VALIDATION_EXTENSION,
      MARKDOWN_TABLE_EDIT_EXTENSION,
      MARKDOWN_TABLE_AUTO_FORMAT_EXTENSION,
      ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
      KMARK_SCOPE_DISPLAY_EXTENSION,
      EditorView.lineWrapping,
      EDITOR_CONTENT_ATTRIBUTES,
      MARKDOWN_SELECTION_WRAP_EXTENSION,
      KMARK_SHORTCUT_INSERTION_EXTENSION,
      autocompletion({
        activateOnTyping: true,
        override: [editorCompletionSource],
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
  }, [blurOnEscapeWhenSelectionEmpty, editorCompletionSource, editorTheme, multiCursorModifier, showLineNumbers]);

  return (
    <>
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
      {showMobileInputHelperBar ? <MobileInputHelperBar insertAdapter={mobileInsertAdapter} /> : null}
    </>
  );
}

export const DesktopMarkdownInput = memo(DesktopMarkdownInputComponent);
