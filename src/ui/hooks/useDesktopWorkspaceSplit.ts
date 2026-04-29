import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createBrowserEditorLayoutGateway } from "../../adapters/browser/browserEditorLayoutGateway";
import { DesktopWorkspaceSplitController } from "../../application/desktopWorkspaceSplit/desktopWorkspaceSplitController";

type UseDesktopWorkspaceSplitOptions = {
  readonly layoutMode: "desktop" | "mobile";
};

export function useDesktopWorkspaceSplit({ layoutMode }: UseDesktopWorkspaceSplitOptions) {
  const controllerRef = useRef<DesktopWorkspaceSplitController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = new DesktopWorkspaceSplitController({
      gateway: createBrowserEditorLayoutGateway(),
    });
  }

  const controller = controllerRef.current;
  const desktopWorkspaceRef = useRef<HTMLElement | null>(null);
  const activeDividerPointerIdRef = useRef<number | null>(null);
  const [desktopSplitRatio, setDesktopSplitRatio] = useState<number>(
    () => controller.createState(),
  );
  const [isDesktopResizing, setIsDesktopResizing] = useState(false);
  const desktopSplitRatioRef = useRef(desktopSplitRatio);

  useEffect(() => {
    desktopSplitRatioRef.current = desktopSplitRatio;
  }, [desktopSplitRatio]);

  const setDesktopSplitRatioValue = useCallback((nextRatio: number) => {
    desktopSplitRatioRef.current = nextRatio;
    setDesktopSplitRatio(nextRatio);
  }, []);

  useEffect(() => {
    let isActive = true;
    let unsubscribe = () => {};

    void controller.loadRatio().then((loadedRatio) => {
      if (!isActive) {
        return;
      }

      setDesktopSplitRatioValue(loadedRatio);
    }).catch(() => {});

    void controller.subscribeToRatio((nextRatio) => {
      if (!isActive) {
        return;
      }

      setDesktopSplitRatioValue(nextRatio);
    }).then((nextUnsubscribe) => {
      if (!isActive) {
        nextUnsubscribe();
        return;
      }

      unsubscribe = nextUnsubscribe;
    }).catch(() => {});

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [controller, setDesktopSplitRatioValue]);

  const desktopLayoutStyle = useMemo(
    () => ({ "--desktop-split-ratio": `${desktopSplitRatio}` } as CSSProperties),
    [desktopSplitRatio],
  );

  const updateDesktopSplitRatioFromClientX = useCallback((clientX: number) => {
    const workspace = desktopWorkspaceRef.current;

    if (workspace === null) {
      return;
    }

    const workspaceBounds = workspace.getBoundingClientRect();
    const nextRatio = controller.resolvePointerRatio(clientX, workspaceBounds.left, workspaceBounds.width);

    if (nextRatio !== null) {
      setDesktopSplitRatioValue(nextRatio);
    }
  }, [controller, setDesktopSplitRatioValue]);

  const commitDesktopSplitRatio = useCallback((splitRatio: number) => {
    void controller.persistRatio(splitRatio).then((nextRatio) => {
      setDesktopSplitRatioValue(nextRatio);
    }).catch(() => {
      void controller.loadRatio().then((nextRatio) => {
        setDesktopSplitRatioValue(nextRatio);
      }).catch(() => {});
    });
  }, [controller, setDesktopSplitRatioValue]);

  const handleDividerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (layoutMode !== "desktop") {
        return;
      }

      activeDividerPointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDesktopResizing(true);
      updateDesktopSplitRatioFromClientX(event.clientX);
    },
    [layoutMode, updateDesktopSplitRatioFromClientX],
  );

  const handleDividerPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activeDividerPointerIdRef.current !== event.pointerId) {
        return;
      }

      updateDesktopSplitRatioFromClientX(event.clientX);
    },
    [updateDesktopSplitRatioFromClientX],
  );

  const handleDividerPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activeDividerPointerIdRef.current !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      activeDividerPointerIdRef.current = null;
      setIsDesktopResizing(false);
      commitDesktopSplitRatio(desktopSplitRatioRef.current);
    },
    [commitDesktopSplitRatio],
  );

  const handleDividerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const workspace = desktopWorkspaceRef.current;

      if (workspace === null) {
        return;
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        if (event.key !== "Home" && event.key !== "End") {
          return;
        }
      }

      const nextRatio = controller.resolveKeyboardRatio(
        event.key,
        desktopSplitRatioRef.current,
        workspace.getBoundingClientRect().width,
      );

      if (nextRatio === null) {
        return;
      }

      event.preventDefault();
      setDesktopSplitRatioValue(nextRatio);
      commitDesktopSplitRatio(nextRatio);
    },
    [commitDesktopSplitRatio, controller, setDesktopSplitRatioValue],
  );

  const handleDividerDoubleClick = useCallback(() => {
    const nextRatio = controller.resetRatio();
    setDesktopSplitRatioValue(nextRatio);
    commitDesktopSplitRatio(nextRatio);
  }, [commitDesktopSplitRatio, controller, setDesktopSplitRatioValue]);

  return {
    desktopLayoutStyle,
    desktopSplitRatio,
    desktopWorkspaceRef,
    handleDividerDoubleClick,
    handleDividerKeyDown,
    handleDividerPointerDown,
    handleDividerPointerEnd,
    handleDividerPointerMove,
    isDesktopResizing,
    maximumDesktopSplitRatio: controller.getMaximumRatio(),
    minimumDesktopSplitRatio: controller.getMinimumRatio(),
  };
}
