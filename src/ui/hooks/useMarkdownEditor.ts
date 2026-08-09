import { startTransition, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createBrowserDraftStore } from "../../adapters/browser/browserDraftStore";
import { createBrowserEditorStateRules } from "../../adapters/browser/browserEditorStateRules";
import { createBrowserMarkdownAssetImporter } from "../../adapters/browser/browserMarkdownAssetImporter";
import { createBrowserMarkdownDocumentGateway } from "../../adapters/browser/browserMarkdownDocumentGateway";
import { createBrowserMarkdownDocumentPrinter } from "../../adapters/browser/browserMarkdownDocumentPrinter";
import { createBrowserMarkdownRenderer } from "../../adapters/browser/browserMarkdownRenderer";
import { createBrowserRecentFileStore } from "../../adapters/browser/browserRecentFileStore";
import { createTauriExternalDocumentSessionGateway } from "../../adapters/tauri/tauriExternalDocumentSessionGateway";
import {
  EditorSessionController,
  toEditorSessionErrorMessage,
  type EditorSessionStore,
} from "../../application/editorSession/editorSessionController";
import {
  type ExternalDocumentSession,
  type MarkdownAssetDataFile,
} from "../../application/editorSession/editorSessionPorts";
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
  readonly initialExternalSessionId?: string | null;
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
    initialExternalSessionId = null,
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
  const externalSessionGatewayRef = useRef(createTauriExternalDocumentSessionGateway());
  const externalSessionRef = useRef<ExternalDocumentSession | null>(null);
  const externalSessionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastExternalSessionSignatureRef = useRef<string | null>(null);
  const externalSessionHydrationSignatureRef = useRef<string | null>(null);

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
  const [externalSession, setExternalSession] = useState<ExternalDocumentSession | null>(null);
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

  const applyExternalSession = useCallback((session: ExternalDocumentSession) => {
    const signature = sessionSignature(session);
    externalSessionRef.current = session;
    lastExternalSessionSignatureRef.current = signature;
    setExternalSession(session);
    const current = stateRef.current;
    if (
      current.content !== session.content
      || current.fileName !== session.fileName
      || current.filePath !== session.filePath
      || current.isDirty !== session.isDirty
    ) {
      externalSessionHydrationSignatureRef.current = signature;
      controller.loadApplicationSession(store, session);
      reloadPlantUml();
    } else {
      externalSessionHydrationSignatureRef.current = null;
    }
  }, [controller, store]);

  useEffect(() => {
    const gateway = externalSessionGatewayRef.current;
    if (!isReady || !gateway.isSupported()) {
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const enqueue = (operation: () => Promise<void>) => {
      externalSessionQueueRef.current = externalSessionQueueRef.current
        .then(operation)
        .catch((error) => {
          if (!disposed) {
            controller.raiseError(store, toEditorSessionErrorMessage(error));
          }
        });
    };

    enqueue(async () => {
      const session = initialExternalSessionId === null
        ? await gateway.register({
          fileName: stateRef.current.fileName,
          filePath: stateRef.current.filePath,
          content: stateRef.current.content,
          isDirty: stateRef.current.isDirty,
        })
        : await gateway.attach(initialExternalSessionId);
      if (!disposed) {
        applyExternalSession(session);
      }
    });

    void gateway.listen((event) => {
      const current = externalSessionRef.current;
      if (current === null || current.sessionId !== event.sessionId || current.revision >= event.revision) {
        return;
      }
      enqueue(async () => {
        const synchronizedSignature = lastExternalSessionSignatureRef.current;
        if (editorStateSignature(stateRef.current) !== synchronizedSignature) {
          return;
        }
        const session = await gateway.get(event.sessionId);
        if (
          !disposed
          && editorStateSignature(stateRef.current) === synchronizedSignature
        ) {
          applyExternalSession(session);
        }
      });
    }).then((dispose) => {
      if (disposed) {
        dispose();
      } else {
        unlisten = dispose;
      }
    }).catch((error) => {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [applyExternalSession, controller, initialExternalSessionId, isReady, store]);

  useEffect(() => {
    const gateway = externalSessionGatewayRef.current;
    if (!isReady || !gateway.isSupported()) {
      return;
    }
    const session = externalSessionRef.current;
    const signature = editorStateSignature(state);
    const hydrationSignature = externalSessionHydrationSignatureRef.current;
    if (hydrationSignature !== null) {
      if (signature === hydrationSignature) {
        externalSessionHydrationSignatureRef.current = null;
      }
      return;
    }
    if (session === null || signature === lastExternalSessionSignatureRef.current) {
      return;
    }
    externalSessionQueueRef.current = externalSessionQueueRef.current
      .then(async () => {
        const current = externalSessionRef.current;
        if (current === null) {
          return;
        }
        const snapshot = await gateway.sync({
          sessionId: current.sessionId,
          expectedRevision: current.revision,
          fileName: state.fileName,
          filePath: state.filePath,
          content: state.content,
          isDirty: state.isDirty,
        });
        externalSessionRef.current = snapshot;
        lastExternalSessionSignatureRef.current = sessionSignature(snapshot);
        setExternalSession(snapshot);
      })
      .catch(async (error) => {
        const current = externalSessionRef.current;
        if (current !== null && commandErrorCode(error) === "revision_conflict") {
          try {
            applyExternalSession(await gateway.get(current.sessionId));
            return;
          } catch (refreshError) {
            controller.raiseError(store, toEditorSessionErrorMessage(refreshError));
            return;
          }
        }
        controller.raiseError(store, toEditorSessionErrorMessage(error));
      });
  }, [applyExternalSession, controller, isReady, state, store]);

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

  const handleCommitStagedFileOperation = useCallback(async () => {
    const session = externalSessionRef.current;
    if (session === null) {
      return;
    }
    try {
      applyExternalSession(await externalSessionGatewayRef.current.commitStagedOperation(session.sessionId));
    } catch (error) {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
    }
  }, [applyExternalSession, controller, store]);

  const handleCancelStagedFileOperation = useCallback(async () => {
    const session = externalSessionRef.current;
    if (session === null) {
      return;
    }
    try {
      applyExternalSession(await externalSessionGatewayRef.current.cancelStagedOperation(session.sessionId));
    } catch (error) {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
    }
  }, [applyExternalSession, controller, store]);

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
    externalSession,
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
    handleCancelStagedFileOperation,
    handleCommitStagedFileOperation,
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

function editorStateSignature(state: {
  readonly content: string;
  readonly fileName: string;
  readonly filePath: string | null;
  readonly isDirty: boolean;
}): string {
  return JSON.stringify([state.content, state.fileName, state.filePath, state.isDirty]);
}

function sessionSignature(session: ExternalDocumentSession): string {
  return editorStateSignature(session);
}

function commandErrorCode(error: unknown): string | null {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return null;
}
