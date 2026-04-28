import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserPreviewWindowSessionGateway } from "../../adapters/browser/browserPreviewWindowSessionGateway";
import { PreviewWindowSessionController } from "../../application/previewWindowSession/previewWindowSessionController";

function toPreviewWindowErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "プレビューウィンドウを開けませんでした。";
}

type UsePreviewWindowSessionOptions = {
  readonly activeSourceLine: number | null;
  readonly content: string;
  readonly fileName: string;
  readonly onError: (message: string) => void;
  readonly onJumpToSourceLine: (lineNumber: number) => void;
};

export function usePreviewWindowSession({
  activeSourceLine,
  content,
  fileName,
  onError,
  onJumpToSourceLine,
}: UsePreviewWindowSessionOptions) {
  const controllerRef = useRef<PreviewWindowSessionController | null>(null);
  const lastHandledPreviewWindowJumpRequestIdRef = useRef<number | null>(null);
  const [previewWindowInstanceId, setPreviewWindowInstanceId] = useState<string | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = new PreviewWindowSessionController({
      gateway: createBrowserPreviewWindowSessionGateway(),
    });
  }

  const controller = controllerRef.current;
  const previewWindowEditJumpRequestStorageKey = useMemo(
    () => controller.getEditJumpRequestStorageKey(previewWindowInstanceId),
    [controller, previewWindowInstanceId],
  );

  useEffect(() => {
    let isDisposed = false;

    void controller.resolveInstanceId().then((nextInstanceId) => {
      if (isDisposed) {
        return;
      }

      setPreviewWindowInstanceId(nextInstanceId);
    });

    return () => {
      isDisposed = true;
    };
  }, [controller]);

  useEffect(() => {
    controller.syncPreviewState(
      previewWindowInstanceId,
      {
        content,
        fileName,
      },
      activeSourceLine,
    );
  }, [activeSourceLine, content, controller, fileName, previewWindowInstanceId]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== window.localStorage
        || previewWindowEditJumpRequestStorageKey === null
        || event.key !== previewWindowEditJumpRequestStorageKey
      ) {
        return;
      }

      const nextJumpRequest = controller.readNextEditJumpRequest(
        previewWindowInstanceId,
        lastHandledPreviewWindowJumpRequestIdRef.current,
      );

      if (nextJumpRequest === null) {
        return;
      }

      lastHandledPreviewWindowJumpRequestIdRef.current = nextJumpRequest.requestId;
      onJumpToSourceLine(nextJumpRequest.lineNumber);
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [controller, onJumpToSourceLine, previewWindowEditJumpRequestStorageKey, previewWindowInstanceId]);

  const handleOpenPreviewWindow = useCallback(() => {
    void (async () => {
      try {
        const nextInstanceId = await controller.openPreviewWindow(
          previewWindowInstanceId,
          {
            content,
            fileName,
          },
        );

        setPreviewWindowInstanceId((currentInstanceId) => currentInstanceId ?? nextInstanceId);
      } catch (error) {
        onError(toPreviewWindowErrorMessage(error));
      }
    })();
  }, [content, controller, fileName, onError, previewWindowInstanceId]);

  return {
    openPreviewWindow: handleOpenPreviewWindow,
  };
}
