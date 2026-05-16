import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeAppExit,
  completeWindowClose,
  type ExitRequestKind,
  listenForAppExitRequests,
  listenForWindowCloseRequests,
} from "../../infra/appExit";
import { isTauri } from "../../runtime/runtime";

type UseConfirmSaveOnExitOptions = {
  readonly enabled: boolean;
  readonly isDirty: boolean;
  readonly onErrorRaise: (message: string) => void;
  readonly onSaveDocument: () => Promise<boolean>;
};

export type ConfirmSaveOnExitState = {
  readonly isOpen: boolean;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
};

function toExitErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "終了処理に失敗しました。";
}

export function useConfirmSaveOnExit({
  enabled,
  isDirty,
  onErrorRaise,
  onSaveDocument,
}: UseConfirmSaveOnExitOptions): ConfirmSaveOnExitState {
  const [pendingRequest, setPendingRequest] = useState<ExitRequestKind | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const enabledRef = useRef(enabled);
  const isDirtyRef = useRef(isDirty);
  const isSavingRef = useRef(isSaving);
  const onErrorRaiseRef = useRef(onErrorRaise);
  const onSaveDocumentRef = useRef(onSaveDocument);
  const pendingRequestRef = useRef<ExitRequestKind | null>(pendingRequest);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    onErrorRaiseRef.current = onErrorRaise;
  }, [onErrorRaise]);

  useEffect(() => {
    onSaveDocumentRef.current = onSaveDocument;
  }, [onSaveDocument]);

  useEffect(() => {
    pendingRequestRef.current = pendingRequest;
  }, [pendingRequest]);

  const completeExitRequest = useCallback(async (request: ExitRequestKind) => {
    if (request === "app-exit") {
      await completeAppExit();
      return;
    }

    await completeWindowClose();
  }, []);

  const handleExitRequest = useCallback((request: ExitRequestKind) => {
    if (!enabledRef.current || pendingRequestRef.current !== null) {
      return;
    }

    if (!isDirtyRef.current) {
      void completeExitRequest(request).catch((error) => {
        onErrorRaiseRef.current(toExitErrorMessage(error));
      });
      return;
    }

    pendingRequestRef.current = request;
    setPendingRequest(request);
  }, [completeExitRequest]);

  useEffect(() => {
    let disposed = false;
    let unlistenAppExit: (() => void) | null = null;
    let unlistenWindowClose: (() => void) | null = null;

    void listenForAppExitRequests(() => {
      handleExitRequest("app-exit");
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      unlistenAppExit = unlisten;
    }).catch((error) => {
      onErrorRaiseRef.current(toExitErrorMessage(error));
    });

    void listenForWindowCloseRequests(() => {
      handleExitRequest("window-close");
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      unlistenWindowClose = unlisten;
    }).catch((error) => {
      onErrorRaiseRef.current(toExitErrorMessage(error));
    });

    return () => {
      disposed = true;
      unlistenAppExit?.();
      unlistenWindowClose?.();
    };
  }, [handleExitRequest]);

  useEffect(() => {
    if (isTauri()) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!enabledRef.current || !isDirtyRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const handleCancel = useCallback(() => {
    if (isSavingRef.current) {
      return;
    }

    pendingRequestRef.current = null;
    setPendingRequest(null);
  }, []);

  const handleDiscard = useCallback(() => {
    const request = pendingRequestRef.current;

    if (request === null || isSavingRef.current) {
      return;
    }

    pendingRequestRef.current = null;
    setPendingRequest(null);
    void completeExitRequest(request).catch((error) => {
      onErrorRaiseRef.current(toExitErrorMessage(error));
    });
  }, [completeExitRequest]);

  const handleSave = useCallback(() => {
    const request = pendingRequestRef.current;

    if (request === null || isSavingRef.current) {
      return;
    }

    setIsSaving(true);
    isSavingRef.current = true;

    void onSaveDocumentRef.current()
      .then((saved) => {
        if (!saved) {
          return;
        }

        pendingRequestRef.current = null;
        setPendingRequest(null);
        void completeExitRequest(request).catch((error) => {
          onErrorRaiseRef.current(toExitErrorMessage(error));
        });
      })
      .catch((error) => {
        onErrorRaiseRef.current(toExitErrorMessage(error));
      })
      .finally(() => {
        isSavingRef.current = false;
        setIsSaving(false);
      });
  }, [completeExitRequest]);

  return {
    isOpen: pendingRequest !== null,
    isSaving,
    onCancel: handleCancel,
    onDiscard: handleDiscard,
    onSave: handleSave,
  };
}
