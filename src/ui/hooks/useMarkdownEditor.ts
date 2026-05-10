import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createBrowserDraftStore } from "../../adapters/browser/browserDraftStore";
import { createBrowserEditorStateRules } from "../../adapters/browser/browserEditorStateRules";
import { createBrowserMarkdownDocumentGateway } from "../../adapters/browser/browserMarkdownDocumentGateway";
import { createBrowserMarkdownDocumentPrinter } from "../../adapters/browser/browserMarkdownDocumentPrinter";
import { createBrowserMarkdownRenderer } from "../../adapters/browser/browserMarkdownRenderer";
import {
  EditorSessionController,
  type RenderedPreview,
  toEditorSessionErrorMessage,
  type EditorSessionStore,
} from "../../application/editorSession/editorSessionController";
import { createEditorSessionReducer } from "../../application/editorSession/editorSessionReducer";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type StartupEditMode } from "../../domain/editorPreferences";
import { DEFAULT_PAGE_STYLE, DEFAULT_PREVIEW_TEXT_STYLE, type PreviewDisplayMode } from "../../domain/preview";

export function useMarkdownEditor(startupEditMode: StartupEditMode) {
  const renderRequestIdRef = useRef(0);
  const shouldSkipInitialEditPersistRef = useRef(false);
  const rulesRef = useRef<ReturnType<typeof createBrowserEditorStateRules> | null>(null);
  const controllerRef = useRef<EditorSessionController | null>(null);

  if (rulesRef.current === null) {
    rulesRef.current = createBrowserEditorStateRules();
  }

  if (controllerRef.current === null) {
    controllerRef.current = new EditorSessionController({
      clock: {
        now: () => Date.now(),
      },
      draftStore: createBrowserDraftStore(),
      documentGateway: createBrowserMarkdownDocumentGateway(),
      printer: createBrowserMarkdownDocumentPrinter(),
      renderer: createBrowserMarkdownRenderer(),
      rules: rulesRef.current,
    });
  }

  const controller = controllerRef.current;
  const reducer = useMemo(() => createEditorSessionReducer(rulesRef.current!), []);
  const [isReady, setIsReady] = useState(false);
  const [state, dispatch] = useReducer(
    reducer,
    startupEditMode,
    (initialStartupEditMode) => controller.createInitialState(initialStartupEditMode).initialState,
  );
  const stateRef = useRef(state);
  const store = useMemo<EditorSessionStore>(() => ({
    dispatch,
    getState: () => stateRef.current,
  }), [dispatch]);
  const deferredContent = useDeferredValue(state.content);
  const currentDocumentFilePath = controller.getCurrentDocumentFilePath();
  const [renderedPreview, setRenderedPreview] = useState<RenderedPreview>({
    html: "",
    pageHtmls: [],
    pages: [],
    defaultPageStyle: DEFAULT_PAGE_STYLE,
    defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE,
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let isDisposed = false;

    void controller.bootstrap(startupEditMode).then((bootstrap) => {
      if (isDisposed) {
        return;
      }

      shouldSkipInitialEditPersistRef.current = bootstrap.shouldSkipInitialPersist;
      dispatch({
        type: "editor/bootstrapLoaded",
        state: bootstrap.initialState,
      });
      setIsReady(true);
    }).catch((error) => {
      if (isDisposed) {
        return;
      }

      controller.raiseError(store, toEditorSessionErrorMessage(error));
      setIsReady(true);
    });

    return () => {
      isDisposed = true;
    };
  }, [controller, startupEditMode, store]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (shouldSkipInitialEditPersistRef.current) {
      shouldSkipInitialEditPersistRef.current = false;
      return;
    }

    void controller.persistDraft(state).catch((error) => {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
    });
  }, [controller, isReady, state, store]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const requestId = renderRequestIdRef.current + 1;
    renderRequestIdRef.current = requestId;
    let disposed = false;

    void controller.renderPreview(deferredContent)
      .then((nextRenderedPreview) => {
        if (disposed || renderRequestIdRef.current !== requestId) {
          return;
        }

        startTransition(() => {
          setRenderedPreview(nextRenderedPreview);
        });
      })
      .catch((error) => {
        if (disposed || renderRequestIdRef.current !== requestId) {
          return;
        }

        controller.raiseError(store, toEditorSessionErrorMessage(error));
      });

    return () => {
      disposed = true;
    };
  }, [controller, currentDocumentFilePath, deferredContent, isReady, store]);

  const executeWithErrorHandling = useCallback(
    async (operation: () => Promise<void>) => {
      try {
        await operation();
      } catch (error) {
        controller.raiseError(store, toEditorSessionErrorMessage(error));
      }
    },
    [controller, store],
  );

  const handleContentChange = useCallback((content: string) => {
    controller.changeContent(store, content);
  }, [controller, store]);

  const handleOpenDocumentFromPicker = useCallback(async () => {
    await executeWithErrorHandling(async () => {
      await controller.openDocumentFromPicker(store);
    });
  }, [controller, executeWithErrorHandling, store]);

  const handlePickedFile = useCallback(async (file: File | null) => {
    if (file === null) {
      return;
    }

    await executeWithErrorHandling(async () => {
      await controller.openDocumentFromFile(store, file);
    });
  }, [controller, executeWithErrorHandling, store]);

  const handleOverwriteSaveDocument = useCallback(async () => {
    await executeWithErrorHandling(async () => {
      await controller.overwriteSaveDocument(store);
    });
  }, [controller, executeWithErrorHandling, store]);

  const handleSaveDocumentAs = useCallback(async () => {
    await executeWithErrorHandling(async () => {
      await controller.saveDocumentAs(store);
    });
  }, [controller, executeWithErrorHandling, store]);

  const handleLoadExternalDocument = useCallback((document: ExternalMarkdownDocument) => {
    controller.loadExternalDocument(store, document);
  }, [controller, store]);

  const handleTakePendingExternalDocuments = useCallback(async () => {
    try {
      return await controller.takePendingExternalDocuments();
    } catch (error) {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
      return [];
    }
  }, [controller, store]);

  const handleClearPendingExternalDocuments = useCallback(async () => {
    await executeWithErrorHandling(async () => {
      await controller.clearPendingExternalDocuments();
    });
  }, [controller, executeWithErrorHandling]);

  const subscribeToExternalDocumentRequests = useCallback((callback: () => void) => {
    return controller.subscribeToExternalDocumentRequests(callback);
  }, [controller]);

  const handlePrintDocument = useCallback(async (
    previewDisplayMode: PreviewDisplayMode,
  ) => {
    await executeWithErrorHandling(async () => {
      await controller.printDocument(store, previewDisplayMode);
    });
  }, [controller, executeWithErrorHandling, store]);

  const handleResetDocument = useCallback(() => {
    controller.resetDocument(store);
  }, [controller, store]);

  const handleErrorRaise = useCallback((message: string) => {
    controller.raiseError(store, message);
  }, [controller, store]);

  const handleErrorClear = useCallback(() => {
    controller.clearError(store);
  }, [controller, store]);

  const confirmDiscard = useCallback(() => {
    if (!state.isDirty) {
      return true;
    }

    return window.confirm("未保存の変更を破棄しますか？");
  }, [state.isDirty]);

  return {
    canOpenDocumentWithNativePicker: controller.supportsNativeOpenPicker(),
    content: state.content,
    currentDocumentFilePath,
    errorMessage: state.errorMessage,
    fileName: state.fileName,
    isDirty: state.isDirty,
    isReady,
    previewHtml: renderedPreview.html,
    previewPageHtmls: renderedPreview.pageHtmls,
    previewPages: renderedPreview.pages,
    defaultPreviewPageStyle: renderedPreview.defaultPageStyle,
    defaultPreviewTextStyle: renderedPreview.defaultTextStyle,
    confirmDiscard,
    handleClearPendingExternalDocuments,
    handleContentChange,
    handleErrorClear,
    handleErrorRaise,
    handleLoadExternalDocument,
    handleOpenDocumentFromPicker,
    handlePickedFile,
    handleResetDocument,
    handleOverwriteSaveDocument,
    handlePrintDocument,
    handleSaveDocumentAs,
    handleTakePendingExternalDocuments,
    subscribeToExternalDocumentRequests,
  };
}
