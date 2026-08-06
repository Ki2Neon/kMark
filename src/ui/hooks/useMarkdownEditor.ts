import { startTransition, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createBrowserDraftStore } from "../../adapters/browser/browserDraftStore";
import { createBrowserEditorStateRules } from "../../adapters/browser/browserEditorStateRules";
import { createBrowserMarkdownAssetImporter } from "../../adapters/browser/browserMarkdownAssetImporter";
import { createBrowserMarkdownDocumentGateway } from "../../adapters/browser/browserMarkdownDocumentGateway";
import { createBrowserMarkdownDocumentPrinter } from "../../adapters/browser/browserMarkdownDocumentPrinter";
import { createBrowserMarkdownRenderer } from "../../adapters/browser/browserMarkdownRenderer";
import { createBrowserRecentFileStore } from "../../adapters/browser/browserRecentFileStore";
import {
  EditorSessionController,
  toEditorSessionErrorMessage,
  type EditorSessionStore,
} from "../../application/editorSession/editorSessionController";
import { type MarkdownAssetDataFile } from "../../application/editorSession/editorSessionPorts";
import { createEditorSessionReducer } from "../../application/editorSession/editorSessionReducer";
import { type ExternalMarkdownDocument } from "../../domain/externalMarkdownDocument";
import { type StartupEditMode } from "../../domain/editorPreferences";
import {
  DEFAULT_PAGE_STYLE,
  DEFAULT_PREVIEW_TEXT_STYLE,
  type PreviewDisplayMode,
  type RenderedPreview,
} from "../../domain/preview";
import { type RecentFile } from "../../domain/recentFiles";

export type InitialEditorDocumentMode = "stored" | "new-untitled";

const EMPTY_PLANTUML_HTTPS_HOSTS: readonly string[] = [];

type UseMarkdownEditorOptions = {
  readonly initialDocumentMode?: InitialEditorDocumentMode;
  readonly previewColorKey?: string;
  readonly previewDisplayMode?: PreviewDisplayMode;
  readonly plantumlHttpsHosts?: readonly string[];
  readonly activeSourceLine?: number | null;
};

export function useMarkdownEditor(
  startupEditMode: StartupEditMode,
  options: UseMarkdownEditorOptions = {},
) {
  const {
    initialDocumentMode = "stored",
    previewColorKey = "",
    previewDisplayMode = "standard",
    plantumlHttpsHosts = EMPTY_PLANTUML_HTTPS_HOSTS,
    activeSourceLine = null,
  } = options;
  const renderRequestIdRef = useRef(0);
  const plantUmlDocumentKeyRef = useRef<string | null>(null);
  const recentFilesRequestIdRef = useRef(0);
  const shouldSkipInitialEditPersistRef = useRef(false);
  const rulesRef = useRef<ReturnType<typeof createBrowserEditorStateRules> | null>(null);
  const controllerRef = useRef<EditorSessionController | null>(null);

  if (plantUmlDocumentKeyRef.current === null) {
    plantUmlDocumentKeyRef.current = crypto.randomUUID();
  }
  const plantUmlDocumentKey = plantUmlDocumentKeyRef.current;

  if (rulesRef.current === null) {
    rulesRef.current = createBrowserEditorStateRules();
  }

  if (controllerRef.current === null) {
    controllerRef.current = new EditorSessionController({
      assetImporter: createBrowserMarkdownAssetImporter(),
      clock: {
        now: () => Date.now(),
      },
      draftStore: createBrowserDraftStore(),
      documentGateway: createBrowserMarkdownDocumentGateway(),
      printer: createBrowserMarkdownDocumentPrinter(),
      recentFileStore: createBrowserRecentFileStore(),
      renderer: createBrowserMarkdownRenderer(),
      rules: rulesRef.current,
    });
  }

  const controller = controllerRef.current;
  const reducer = useMemo(() => createEditorSessionReducer(rulesRef.current!), []);
  const [isReady, setIsReady] = useState(false);
  const [recentFiles, setRecentFiles] = useState<readonly RecentFile[]>([]);
  const [plantumlRenderEpoch, reloadPlantUml] = useReducer((epoch: number) => epoch + 1, 0);
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
  const currentDocumentFilePath = state.filePath;
  const [renderedPreview, setRenderedPreview] = useState<RenderedPreview>({
    mode: "standard",
    html: "",
    defaultPageStyle: DEFAULT_PAGE_STYLE,
    defaultTextStyle: DEFAULT_PREVIEW_TEXT_STYLE,
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const applyRecentFilesRequest = useCallback(async (
    operation: () => Promise<readonly RecentFile[] | null>,
  ) => {
    const requestId = recentFilesRequestIdRef.current + 1;
    recentFilesRequestIdRef.current = requestId;
    const nextRecentFiles = await operation();

    if (nextRecentFiles === null || requestId !== recentFilesRequestIdRef.current) {
      return;
    }

    setRecentFiles(nextRecentFiles);
  }, []);

  useEffect(() => {
    let isDisposed = false;
    const bootstrapPromise = initialDocumentMode === "new-untitled"
      ? controller.bootstrapNewUntitled(startupEditMode)
      : controller.bootstrap(startupEditMode);

    void bootstrapPromise.then((bootstrap) => {
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
  }, [controller, initialDocumentMode, startupEditMode, store]);

  useEffect(() => {
    let isDisposed = false;

    void applyRecentFilesRequest(() => controller.loadRecentFiles())
      .catch((error) => {
        if (isDisposed) {
          return;
        }

        controller.raiseError(store, toEditorSessionErrorMessage(error));
      });

    return () => {
      isDisposed = true;
    };
  }, [applyRecentFilesRequest, controller, store]);

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
    const abortController = new AbortController();
    const applyRenderedPreview = (nextRenderedPreview: RenderedPreview) => {
      if (disposed || renderRequestIdRef.current !== requestId) {
        return;
      }
      startTransition(() => {
        setRenderedPreview(nextRenderedPreview);
      });
    };

    void controller.renderPreview(state.content, state.filePath, previewDisplayMode, {
      revision: requestId,
      documentKey: plantUmlDocumentKey,
      plantumlRenderEpoch,
      plantumlHttpsHosts,
      activeSourceLine,
      signal: abortController.signal,
      onUpdate: applyRenderedPreview,
    })
      .then((nextRenderedPreview) => {
        applyRenderedPreview(nextRenderedPreview);
      })
      .catch((error) => {
        if (disposed || renderRequestIdRef.current !== requestId) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        controller.raiseError(store, toEditorSessionErrorMessage(error));
      });

    return () => {
      disposed = true;
      abortController.abort();
    };
  }, [controller, currentDocumentFilePath, isReady, plantUmlDocumentKey, plantumlHttpsHosts, plantumlRenderEpoch, previewColorKey, previewDisplayMode, state.content, state.fileName, state.filePath, store]);

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
      const loadedDocument = await controller.openDocumentFromPicker(store);

      if (loadedDocument !== null) {
        reloadPlantUml();
        if (loadedDocument.filePath !== null) {
          await applyRecentFilesRequest(() => (
            controller.recordRecentFile(loadedDocument.fileName, loadedDocument.filePath)
          ));
        }
      }
    });
  }, [applyRecentFilesRequest, controller, executeWithErrorHandling, store]);

  const handleOpenCurrentDocumentFolder = useCallback(async () => {
    await executeWithErrorHandling(async () => {
      await controller.openCurrentDocumentFolder(store);
    });
  }, [controller, executeWithErrorHandling]);

  const handlePickedFile = useCallback(async (file: File | null) => {
    if (file === null) {
      return;
    }

    await executeWithErrorHandling(async () => {
      const loadedDocument = await controller.openDocumentFromFile(store, file);
      reloadPlantUml();

      if (loadedDocument.filePath !== null) {
        await applyRecentFilesRequest(() => (
          controller.recordRecentFile(loadedDocument.fileName, loadedDocument.filePath)
        ));
      }
    });
  }, [applyRecentFilesRequest, controller, executeWithErrorHandling, store]);

  const handleOpenRecentFile = useCallback(async (recentFile: RecentFile) => {
    await executeWithErrorHandling(async () => {
      const loadedDocument = await controller.openDocumentFromRecentFile(store, recentFile);
      reloadPlantUml();

      if (loadedDocument.filePath !== null) {
        await applyRecentFilesRequest(() => (
          controller.recordRecentFile(loadedDocument.fileName, loadedDocument.filePath)
        ));
      }
    });
  }, [applyRecentFilesRequest, controller, executeWithErrorHandling, store]);

  const handleOverwriteSaveDocument = useCallback(async () => {
    let didSave = false;

    await executeWithErrorHandling(async () => {
      didSave = await controller.overwriteSaveDocument(store);
    });

    return didSave;
  }, [controller, executeWithErrorHandling, store]);

  const handleSaveDocumentAs = useCallback(async () => {
    let didSave = false;

    await executeWithErrorHandling(async () => {
      didSave = await controller.saveDocumentAs(store);
    });

    return didSave;
  }, [controller, executeWithErrorHandling, store]);

  const handleLoadExternalDocument = useCallback((document: ExternalMarkdownDocument) => {
    const loadedDocument = controller.loadExternalDocument(store, document);
    reloadPlantUml();

    void applyRecentFilesRequest(() => (
      controller.recordRecentFile(loadedDocument.fileName, loadedDocument.filePath)
    )).catch((error) => {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
    });
  }, [applyRecentFilesRequest, controller, store]);

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
      await controller.printDocument(
        store,
        previewDisplayMode,
        plantumlHttpsHosts,
        plantUmlDocumentKey,
        plantumlRenderEpoch,
      );
    });
  }, [controller, executeWithErrorHandling, plantUmlDocumentKey, plantumlHttpsHosts, plantumlRenderEpoch, store]);

  const handleImportDroppedAssets = useCallback(async (droppedFilePaths: readonly string[]) => {
    try {
      return await controller.importDroppedAssets(store, droppedFilePaths);
    } catch (error) {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
      return null;
    }
  }, [controller, store]);

  const handleImportPastedAssets = useCallback(async (files: readonly MarkdownAssetDataFile[]) => {
    try {
      return await controller.importPastedAssets(store, files);
    } catch (error) {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
      return null;
    }
  }, [controller, store]);

  const handleResetDocument = useCallback(() => {
    controller.resetDocument(store);
    reloadPlantUml();
  }, [controller, store]);

  const handleReloadPlantUml = useCallback(() => {
    reloadPlantUml();
  }, []);

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
    recentFiles,
    previewHtml: renderedPreview.mode === "standard" ? renderedPreview.html : "",
    previewPages: renderedPreview.mode === "a4" ? renderedPreview.pages : [],
    renderedPreviewMode: renderedPreview.mode,
    defaultPreviewPageStyle: renderedPreview.defaultPageStyle,
    defaultPreviewTextStyle: renderedPreview.defaultTextStyle,
    confirmDiscard,
    handleClearPendingExternalDocuments,
    handleContentChange,
    handleErrorClear,
    handleErrorRaise,
    handleImportDroppedAssets,
    handleImportPastedAssets,
    handleLoadExternalDocument,
    handleOpenCurrentDocumentFolder,
    handleOpenDocumentFromPicker,
    handleOpenRecentFile,
    handlePickedFile,
    handleReloadPlantUml,
    handleResetDocument,
    handleOverwriteSaveDocument,
    handlePrintDocument,
    handleSaveDocumentAs,
    handleTakePendingExternalDocuments,
    subscribeToExternalDocumentRequests,
  };
}
