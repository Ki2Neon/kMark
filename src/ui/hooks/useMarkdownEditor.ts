import { startTransition, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createBrowserDraftStore } from "../../adapters/browser/browserDraftStore";
import { createBrowserEditorStateRules } from "../../adapters/browser/browserEditorStateRules";
import { createBrowserMarkdownAssetImporter } from "../../adapters/browser/browserMarkdownAssetImporter";
import { createBrowserMarkdownDocumentGateway } from "../../adapters/browser/browserMarkdownDocumentGateway";
import { createBrowserMarkdownDocumentPrinter } from "../../adapters/browser/browserMarkdownDocumentPrinter";
import { createBrowserMarkdownRenderer } from "../../adapters/browser/browserMarkdownRenderer";
import { createBrowserRecentFileStore } from "../../adapters/browser/browserRecentFileStore";
import { createEditorDocumentGateway } from "../../adapters/editor/createEditorDocumentGateway";
import { EditorMutationQueue } from "../../adapters/editor/editorMutationQueue";
import { createTauriExternalDocumentSessionGateway } from "../../adapters/tauri/tauriExternalDocumentSessionGateway";
import {
  type EditorDocumentSessionSnapshot,
  type EditorTransaction,
} from "../../application/editorSession/editorDocumentPort";
import {
  EditorSessionController,
  toEditorSessionErrorMessage,
  type EditorSessionStore,
} from "../../application/editorSession/editorSessionController";
import {
  type ExternalDocumentSession,
  type MarkdownAssetDataFile,
  type MarkdownDocumentSaveSource,
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
import { type MarkdownEditorHandle } from "../components/DesktopMarkdownInput";

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
  const editorDocumentGatewayRef = useRef<ReturnType<typeof createEditorDocumentGateway> | null>(null);
  const mutationQueueRef = useRef<EditorMutationQueue | null>(null);
  const activeDocumentSessionRef = useRef<EditorDocumentSessionSnapshot | null>(null);
  const editorHandleRef = useRef<MarkdownEditorHandle | null>(null);
  const documentBindingRef = useRef<{ key: string; content: string } | null>(null);
  const documentKeySequenceRef = useRef(0);
  const fatalRecoveryRef = useRef<((sessionId: string, error: unknown) => void) | null>(null);
  const fatalRecoverySessionRef = useRef<string | null>(null);

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

  if (editorDocumentGatewayRef.current === null) {
    editorDocumentGatewayRef.current = createEditorDocumentGateway();
  }

  const controller = controllerRef.current;
  const initialBootstrapRef = useRef<ReturnType<EditorSessionController["createInitialState"]> | null>(null);
  if (initialBootstrapRef.current === null) {
    initialBootstrapRef.current = controller.createInitialState(startupEditMode);
  }
  const initialBootstrap = initialBootstrapRef.current;
  const reducer = useMemo(() => createEditorSessionReducer(rulesRef.current!), []);
  const [isReady, setIsReady] = useState(false);
  const [recentFiles, setRecentFiles] = useState<readonly RecentFile[]>([]);
  const [plantumlRenderEpoch, reloadPlantUml] = useReducer((epoch: number) => epoch + 1, 0);
  const [contentEpoch, markContentChanged] = useReducer((epoch: number) => epoch + 1, 0);
  const [state, dispatch] = useReducer(reducer, initialBootstrap.initialState);
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

  if (documentBindingRef.current === null) {
    documentBindingRef.current = {
      key: "editor-document-pending",
      content: initialBootstrap.content,
    };
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const createMutationQueue = useCallback((session: EditorDocumentSessionSnapshot) => {
    mutationQueueRef.current = new EditorMutationQueue(
      editorDocumentGatewayRef.current!,
      session.sessionId,
      session.revision,
      session.documentLengthUtf16,
      {
        onAcknowledged: (ack) => {
          const active = activeDocumentSessionRef.current;
          if (active !== null && active.sessionId === session.sessionId) {
            activeDocumentSessionRef.current = {
              ...active,
              revision: ack.revision,
              documentLengthUtf16: ack.documentLengthUtf16,
              isDirty: true,
            };
          }
          const current = externalSessionRef.current;
          if (current !== null && current.sessionId === session.sessionId) {
            const updated = { ...current, revision: ack.revision, isDirty: true };
            externalSessionRef.current = updated;
            setExternalSession(updated);
          }
        },
        onFailed: (error) => fatalRecoveryRef.current?.(session.sessionId, error),
      },
    );
  }, []);

  const installAuthoritativeSession = useCallback((
    session: EditorDocumentSessionSnapshot,
    external: ExternalDocumentSession | null = null,
  ) => {
    documentKeySequenceRef.current += 1;
    documentBindingRef.current = {
      key: `${session.sessionId}:${documentKeySequenceRef.current}`,
      content: session.content,
    };
    activeDocumentSessionRef.current = session;
    createMutationQueue(session);
    const externalValue = external ?? (
      externalSessionGatewayRef.current.isSupported()
        ? toExternalDocumentSession(session)
        : null
    );
    externalSessionRef.current = externalValue;
    setExternalSession(externalValue);
    controller.loadApplicationSession(store, session);
    markContentChanged();
    reloadPlantUml();
  }, [controller, createMutationQueue, store]);

  const applyRemoteSession = useCallback((session: ExternalDocumentSession) => {
    const snapshot = toEditorDocumentSessionSnapshot(session);
    editorHandleRef.current?.applyRemoteContent(session.content);
    documentBindingRef.current = {
      key: documentBindingRef.current?.key ?? session.sessionId,
      content: session.content,
    };
    activeDocumentSessionRef.current = snapshot;
    createMutationQueue(snapshot);
    externalSessionRef.current = session;
    setExternalSession(session);
    controller.loadApplicationSession(store, session);
    markContentChanged();
    reloadPlantUml();
  }, [controller, createMutationQueue, store]);

  fatalRecoveryRef.current = (sessionId, error) => {
    if (
      activeDocumentSessionRef.current?.sessionId !== sessionId
      || fatalRecoverySessionRef.current === sessionId
    ) {
      return;
    }
    fatalRecoverySessionRef.current = sessionId;
    controller.raiseError(store, toEditorSessionErrorMessage(error));
    void controller.persistDraft(
      stateRef.current,
      () => getCurrentEditorContent(editorHandleRef.current, documentBindingRef.current),
      activeDocumentSessionRef.current?.lineEnding ?? "lf",
      null,
      null,
    )
      .then(() => editorDocumentGatewayRef.current!.getSnapshot(sessionId))
      .then((authoritative) => {
        if (activeDocumentSessionRef.current?.sessionId === sessionId) {
          installAuthoritativeSession(authoritative);
        }
      })
      .catch((recoveryError) => {
        controller.raiseError(store, toEditorSessionErrorMessage(recoveryError));
      })
      .finally(() => {
        if (fatalRecoverySessionRef.current === sessionId) {
          fatalRecoverySessionRef.current = null;
        }
      });
  };

  useEffect(() => {
    const gateway = externalSessionGatewayRef.current;
    if (!isReady || !gateway.isSupported()) {
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void gateway.listen((event) => {
      const current = externalSessionRef.current;
      if (current === null || current.sessionId !== event.sessionId || current.revision >= event.revision) {
        return;
      }
      void (async () => {
        try {
          await mutationQueueRef.current?.flush();
          const session = await gateway.get(event.sessionId);
          if (!disposed && session.revision > (externalSessionRef.current?.revision ?? 0)) {
            applyRemoteSession(session);
          }
        } catch (error) {
          if (!disposed) {
            controller.raiseError(store, toEditorSessionErrorMessage(error));
          }
        }
      })();
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
  }, [applyRemoteSession, controller, isReady, store]);

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

    void bootstrapPromise.then(async (bootstrap) => {
      if (isDisposed) {
        return;
      }

      shouldSkipInitialEditPersistRef.current = bootstrap.shouldSkipInitialPersist;
      const externalGateway = externalSessionGatewayRef.current;
      if (externalGateway.isSupported()) {
        const external = initialExternalSessionId === null
          ? await externalGateway.register({
            fileName: bootstrap.initialState.fileName,
            filePath: bootstrap.initialState.filePath,
            content: bootstrap.content,
            isDirty: bootstrap.initialState.isDirty,
          })
          : await externalGateway.attach(initialExternalSessionId);
        if (isDisposed) {
          return;
        }
        installAuthoritativeSession(toEditorDocumentSessionSnapshot(external), external);
      } else {
        const session = initialExternalSessionId === null
          ? await editorDocumentGatewayRef.current!.bootstrap({
            fileName: bootstrap.initialState.fileName,
            filePath: bootstrap.initialState.filePath,
            content: bootstrap.content,
            isDirty: bootstrap.initialState.isDirty,
          })
          : await editorDocumentGatewayRef.current!.attach(initialExternalSessionId);
        if (isDisposed) {
          return;
        }
        installAuthoritativeSession(session);
      }
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
  }, [controller, initialDocumentMode, initialExternalSessionId, installAuthoritativeSession, startupEditMode, store]);

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

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        await mutationQueueRef.current?.flush();
        const active = activeDocumentSessionRef.current;
        await controller.persistDraft(
          stateRef.current,
          () => getCurrentEditorContent(editorHandleRef.current, documentBindingRef.current),
          active?.lineEnding ?? "lf",
          active?.sessionId ?? null,
          active?.revision ?? null,
        );
      })().catch((error) => {
        controller.raiseError(store, toEditorSessionErrorMessage(error));
      });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [contentEpoch, controller, isReady, state.fileName, state.filePath, state.lastSavedAt, store]);

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

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        await mutationQueueRef.current?.flush();
        if (disposed) {
          throw new DOMException("Preview request aborted", "AbortError");
        }
        const active = activeDocumentSessionRef.current;
        const content = active === null
          ? getCurrentEditorContent(editorHandleRef.current, documentBindingRef.current)
          : null;
        return controller.renderPreview(content, state.filePath, previewDisplayMode, {
          revision: requestId,
          documentKey: plantUmlDocumentKey,
          documentSessionId: active?.sessionId,
          documentRevision: active?.revision,
          plantumlRenderEpoch,
          plantumlHttpsHosts,
          activeSourceLine,
          signal: abortController.signal,
          onUpdate: applyRenderedPreview,
        });
      })()
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
    }, 150);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [activeSourceLine, contentEpoch, controller, currentDocumentFilePath, isReady, plantUmlDocumentKey, plantumlHttpsHosts, plantumlRenderEpoch, previewColorKey, previewDisplayMode, state.fileName, state.filePath, store]);

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

  const handleEditorTransaction = useCallback((transaction: EditorTransaction) => {
    try {
      mutationQueueRef.current?.enqueue(transaction);
      dispatch({ type: "editor/documentMutated" });
      markContentChanged();
    } catch (error) {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
    }
  }, [controller, store]);

  const handleEditorHandleChange = useCallback((handle: MarkdownEditorHandle | null) => {
    editorHandleRef.current = handle;
    if (handle !== null) {
      markContentChanged();
    }
  }, []);

  const installLoadedDocument = useCallback(async (loadedDocument: {
    readonly fileName: string;
    readonly filePath: string | null;
    readonly content: string;
  }, isDirty = false) => {
    const session = await editorDocumentGatewayRef.current!.bootstrap({
      fileName: loadedDocument.fileName,
      filePath: loadedDocument.filePath,
      content: loadedDocument.content,
      isDirty,
    });
    installAuthoritativeSession(session);
  }, [installAuthoritativeSession]);

  const flushEditorMutations = useCallback(async () => {
    await mutationQueueRef.current?.flush();
  }, []);

  const flushEditorSession = useCallback(async () => {
    await flushEditorMutations();
    const active = activeDocumentSessionRef.current;
    await controller.persistDraft(
      stateRef.current,
      () => getCurrentEditorContent(editorHandleRef.current, documentBindingRef.current),
      active?.lineEnding ?? "lf",
      active?.sessionId ?? null,
      active?.revision ?? null,
    );
  }, [controller, flushEditorMutations]);

  const applyActiveSessionSaved = useCallback((
    saved: EditorDocumentSessionSnapshot,
    preserveCachedContent = false,
  ) => {
    activeDocumentSessionRef.current = saved;
    if (!preserveCachedContent) {
      documentBindingRef.current = {
        key: documentBindingRef.current?.key ?? saved.sessionId,
        content: saved.content,
      };
    }
    const currentExternal = externalSessionRef.current;
    const updatedExternal = currentExternal === null
      ? externalSessionGatewayRef.current.isSupported()
        ? toExternalDocumentSession(saved)
        : null
      : {
        ...currentExternal,
        revision: saved.revision,
        lineEnding: saved.lineEnding,
        fileName: saved.fileName,
        filePath: saved.filePath,
        content: preserveCachedContent ? currentExternal.content : saved.content,
        isDirty: false,
      };
    externalSessionRef.current = updatedExternal;
    setExternalSession(updatedExternal);
  }, []);

  const markActiveSessionSaved = useCallback(async (
    fileName: string,
    filePath: string | null,
  ) => {
    const active = activeDocumentSessionRef.current;
    if (active === null) {
      throw new Error("保存対象のEditor Sessionがありません。");
    }
    const saved = await editorDocumentGatewayRef.current!.markSaved(
      active.sessionId,
      fileName,
      filePath,
    );
    applyActiveSessionSaved(saved);
  }, [applyActiveSessionSaved]);

  const applyRustSessionSave = useCallback((
    source: MarkdownDocumentSaveSource,
    fileName: string,
    filePath: string | null,
  ) => {
    const active = activeDocumentSessionRef.current;
    if (
      active === null
      || active.sessionId !== source.sessionId
      || active.revision !== source.revision
    ) {
      throw new Error("保存後にEditor Sessionが更新されました。再保存してください。");
    }
    applyActiveSessionSaved(
      {
        ...active,
        fileName,
        filePath,
        isDirty: false,
      },
      true,
    );
  }, [applyActiveSessionSaved]);

  const handleOpenDocumentFromPicker = useCallback(async () => {
    await executeWithErrorHandling(async () => {
      await flushEditorSession();
      const loadedDocument = await controller.openDocumentFromPicker(store);

      if (loadedDocument !== null) {
        await installLoadedDocument(loadedDocument);
        reloadPlantUml();
        if (loadedDocument.filePath !== null) {
          await applyRecentFilesRequest(() => (
            controller.recordRecentFile(loadedDocument.fileName, loadedDocument.filePath)
          ));
        }
      }
    });
  }, [applyRecentFilesRequest, controller, executeWithErrorHandling, flushEditorSession, installLoadedDocument, store]);

  const handleOpenCurrentDocumentFolder = useCallback(async () => {
    await executeWithErrorHandling(async () => {
      await flushEditorSession();
      await controller.openCurrentDocumentFolder(store);
    });
  }, [controller, executeWithErrorHandling, flushEditorSession, store]);

  const handlePickedFile = useCallback(async (file: File | null) => {
    if (file === null) {
      return;
    }

    await executeWithErrorHandling(async () => {
      await flushEditorSession();
      const loadedDocument = await controller.openDocumentFromFile(store, file);
      await installLoadedDocument(loadedDocument);
      reloadPlantUml();

      if (loadedDocument.filePath !== null) {
        await applyRecentFilesRequest(() => (
          controller.recordRecentFile(loadedDocument.fileName, loadedDocument.filePath)
        ));
      }
    });
  }, [applyRecentFilesRequest, controller, executeWithErrorHandling, flushEditorSession, installLoadedDocument, store]);

  const handleOpenRecentFile = useCallback(async (recentFile: RecentFile) => {
    await executeWithErrorHandling(async () => {
      await flushEditorSession();
      const loadedDocument = await controller.openDocumentFromRecentFile(store, recentFile);
      await installLoadedDocument(loadedDocument);
      reloadPlantUml();

      if (loadedDocument.filePath !== null) {
        await applyRecentFilesRequest(() => (
          controller.recordRecentFile(loadedDocument.fileName, loadedDocument.filePath)
        ));
      }
    });
  }, [applyRecentFilesRequest, controller, executeWithErrorHandling, flushEditorSession, installLoadedDocument, store]);

  const handleOverwriteSaveDocument = useCallback(async () => {
    let didSave = false;

    await executeWithErrorHandling(async () => {
      await flushEditorSession();
      const active = activeDocumentSessionRef.current;
      if (active === null) {
        throw new Error("保存対象のEditor Sessionがありません。");
      }
      const source: MarkdownDocumentSaveSource = {
        sessionId: active.sessionId,
        revision: active.revision,
        lineEnding: active.lineEnding,
        readCanonicalContent: () => getCurrentEditorContent(
          editorHandleRef.current,
          documentBindingRef.current,
        ),
      };
      const result = await controller.overwriteSaveDocument(store, source);
      didSave = result !== null;
      if (result !== null) {
        if (result.sessionRevision === null) {
          await markActiveSessionSaved(result.fileName, result.filePath);
        } else {
          applyRustSessionSave(source, result.fileName, result.filePath);
        }
      }
    });

    return didSave;
  }, [applyRustSessionSave, controller, executeWithErrorHandling, flushEditorSession, markActiveSessionSaved, store]);

  const handleSaveDocumentAs = useCallback(async () => {
    let didSave = false;

    await executeWithErrorHandling(async () => {
      await flushEditorSession();
      const active = activeDocumentSessionRef.current;
      if (active === null) {
        throw new Error("保存対象のEditor Sessionがありません。");
      }
      const source: MarkdownDocumentSaveSource = {
        sessionId: active.sessionId,
        revision: active.revision,
        lineEnding: active.lineEnding,
        readCanonicalContent: () => getCurrentEditorContent(
          editorHandleRef.current,
          documentBindingRef.current,
        ),
      };
      const result = await controller.saveDocumentAs(store, source);
      didSave = result !== null;
      if (result !== null) {
        if (result.sessionRevision === null) {
          await markActiveSessionSaved(result.fileName, result.filePath);
        } else {
          applyRustSessionSave(source, result.fileName, result.filePath);
        }
      }
    });

    return didSave;
  }, [applyRustSessionSave, controller, executeWithErrorHandling, flushEditorSession, markActiveSessionSaved, store]);

  const handleLoadExternalDocument = useCallback((document: ExternalMarkdownDocument) => {
    void executeWithErrorHandling(async () => {
      await flushEditorSession();
      const loadedDocument = controller.loadExternalDocument(store, document);
      await installLoadedDocument(loadedDocument);
      await applyRecentFilesRequest(() => (
        controller.recordRecentFile(loadedDocument.fileName, loadedDocument.filePath)
      ));
    });
  }, [applyRecentFilesRequest, controller, executeWithErrorHandling, flushEditorSession, installLoadedDocument, store]);

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
      await flushEditorSession();
      await controller.printDocument(
        store,
        activeDocumentSessionRef.current === null
          ? getCurrentEditorContent(editorHandleRef.current, documentBindingRef.current)
          : null,
        previewDisplayMode,
        plantumlHttpsHosts,
        plantUmlDocumentKey,
        plantumlRenderEpoch,
        activeDocumentSessionRef.current?.sessionId,
        activeDocumentSessionRef.current?.revision,
      );
    });
  }, [controller, executeWithErrorHandling, flushEditorSession, plantUmlDocumentKey, plantumlHttpsHosts, plantumlRenderEpoch, store]);

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
    void executeWithErrorHandling(async () => {
      await flushEditorSession();
      controller.resetDocument(store);
      const reset = controller.createInitialState("start-page");
      await installLoadedDocument({ ...reset.initialState, content: reset.content });
    });
  }, [controller, executeWithErrorHandling, flushEditorSession, installLoadedDocument, store]);

  const handleReloadPlantUml = useCallback(() => {
    reloadPlantUml();
  }, []);

  const handleCommitStagedFileOperation = useCallback(async () => {
    const session = externalSessionRef.current;
    if (session === null) {
      return;
    }
    try {
      await flushEditorSession();
      applyRemoteSession(await externalSessionGatewayRef.current.commitStagedOperation(session.sessionId));
    } catch (error) {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
    }
  }, [applyRemoteSession, controller, flushEditorSession, store]);

  const handleCancelStagedFileOperation = useCallback(async () => {
    const session = externalSessionRef.current;
    if (session === null) {
      return;
    }
    try {
      await flushEditorSession();
      applyRemoteSession(await externalSessionGatewayRef.current.cancelStagedOperation(session.sessionId));
    } catch (error) {
      controller.raiseError(store, toEditorSessionErrorMessage(error));
    }
  }, [applyRemoteSession, controller, flushEditorSession, store]);

  const handleErrorRaise = useCallback((message: string) => {
    controller.raiseError(store, message);
  }, [controller, store]);

  const handleErrorClear = useCallback(() => {
    controller.clearError(store);
  }, [controller, store]);

  const getContentSnapshot = useCallback(() => (
    getCurrentEditorContent(editorHandleRef.current, documentBindingRef.current)
  ), []);

  const replaceEditorContent = useCallback((content: string) => {
    editorHandleRef.current?.replaceContent(content);
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!state.isDirty) {
      return true;
    }

    return window.confirm("未保存の変更を破棄しますか？");
  }, [state.isDirty]);

  return {
    canOpenDocumentWithNativePicker: controller.supportsNativeOpenPicker(),
    document: documentBindingRef.current,
    currentDocumentFilePath,
    errorMessage: state.errorMessage,
    externalSession,
    fileName: state.fileName,
    flushEditorSession,
    isDirty: state.isDirty,
    isReady,
    recentFiles,
    previewHtml: renderedPreview.mode === "standard" ? renderedPreview.html : "",
    previewSectionHtmls: renderedPreview.mode === "standard" ? renderedPreview.sectionHtmls : undefined,
    previewPages: renderedPreview.mode === "a4" ? renderedPreview.pages : [],
    renderedPreviewMode: renderedPreview.mode,
    defaultPreviewPageStyle: renderedPreview.defaultPageStyle,
    defaultPreviewTextStyle: renderedPreview.defaultTextStyle,
    confirmDiscard,
    handleClearPendingExternalDocuments,
    getContentSnapshot,
    handleEditorHandleChange,
    handleEditorTransaction,
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
    replaceEditorContent,
    subscribeToExternalDocumentRequests,
  };
}

function getCurrentEditorContent(
  handle: MarkdownEditorHandle | null,
  binding: { readonly content: string } | null,
): string {
  return handle?.getSnapshot() ?? binding?.content ?? "";
}

function toEditorDocumentSessionSnapshot(
  session: ExternalDocumentSession,
): EditorDocumentSessionSnapshot {
  return {
    sessionId: session.sessionId,
    revision: session.revision,
    lineEnding: session.lineEnding,
    content: session.content,
    documentLengthUtf16: session.content.length,
    fileName: session.fileName,
    filePath: session.filePath,
    isDirty: session.isDirty,
  };
}

function toExternalDocumentSession(
  session: EditorDocumentSessionSnapshot,
): ExternalDocumentSession {
  return {
    instanceId: "local-web",
    sessionId: session.sessionId,
    revision: session.revision,
    lineEnding: session.lineEnding,
    fileName: session.fileName,
    filePath: session.filePath,
    content: session.content,
    isDirty: session.isDirty,
    pendingProposalId: null,
    stagedFileOperation: null,
  };
}
