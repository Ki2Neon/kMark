import { useCallback, useEffect, useRef } from "react";
import { createBrowserPreviewWindowSessionGateway } from "../../adapters/browser/browserPreviewWindowSessionGateway";
import { PreviewWindowSessionController } from "../../application/previewWindowSession/previewWindowSessionController";
import { toCommandErrorMessage } from "../../infra/tauriCommand";

function toPreviewWindowErrorMessage(error: unknown): string {
  return toCommandErrorMessage(error, "プレビューウィンドウを開けませんでした。");
}

type UsePreviewWindowSessionOptions = {
  readonly activeSourceLine: number | null;
  readonly content: string;
  readonly enabled?: boolean;
  readonly fileName: string;
  readonly onError: (message: string) => void;
  readonly onJumpToSourceLine: (lineNumber: number) => void;
};

export function usePreviewWindowSession({
  activeSourceLine,
  content,
  enabled = true,
  fileName,
  onError,
  onJumpToSourceLine,
}: UsePreviewWindowSessionOptions) {
  const controllerRef = useRef<PreviewWindowSessionController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = new PreviewWindowSessionController({
      gateway: createBrowserPreviewWindowSessionGateway(),
    });
  }

  const controller = controllerRef.current;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void controller.syncPreviewState(
      {
        content,
        fileName,
      },
      activeSourceLine,
    ).catch((error) => {
      onError(toPreviewWindowErrorMessage(error));
    });
  }, [activeSourceLine, content, controller, enabled, fileName, onError]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void controller.subscribeToEditJumpRequests((previewWindowEditJumpRequest) => {
      if (isDisposed) {
        return;
      }

      onJumpToSourceLine(previewWindowEditJumpRequest.lineNumber);
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    }).catch((error) => {
      if (isDisposed) {
        return;
      }

      onError(toPreviewWindowErrorMessage(error));
    });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [controller, enabled, onError, onJumpToSourceLine]);

  const handleOpenPreviewWindow = useCallback(() => {
    void (async () => {
      try {
        if (!enabled) {
          return;
        }

        await controller.openPreviewWindow(
          {
            content,
            fileName,
          },
          activeSourceLine,
        );
      } catch (error) {
        onError(toPreviewWindowErrorMessage(error));
      }
    })();
  }, [activeSourceLine, content, controller, enabled, fileName, onError]);

  return {
    openPreviewWindow: handleOpenPreviewWindow,
  };
}
