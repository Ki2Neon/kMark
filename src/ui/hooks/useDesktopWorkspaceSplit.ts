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
import {
  DEFAULT_DESKTOP_SPLIT_RATIO,
  MAX_DESKTOP_SPLIT_RATIO,
  MIN_DESKTOP_SPLIT_RATIO,
  loadDesktopSplitRatio,
  persistDesktopSplitRatio,
} from "../../infra/editorLayout";

const DESKTOP_DIVIDER_WIDTH = 8;
const DESKTOP_MIN_PANEL_WIDTH = 180;
const DESKTOP_SPLIT_KEYBOARD_STEP = 5;

function clampDesktopSplitRatio(splitRatio: number, containerWidth: number): number {
  if (containerWidth <= DESKTOP_MIN_PANEL_WIDTH * 2) {
    return DEFAULT_DESKTOP_SPLIT_RATIO;
  }

  const minRatio = Math.max(
    MIN_DESKTOP_SPLIT_RATIO,
    (DESKTOP_MIN_PANEL_WIDTH / containerWidth) * 100,
  );
  const maxRatio = Math.min(MAX_DESKTOP_SPLIT_RATIO, 100 - minRatio);

  return Math.min(maxRatio, Math.max(minRatio, splitRatio));
}

type UseDesktopWorkspaceSplitOptions = {
  readonly layoutMode: "desktop" | "mobile";
};

export function useDesktopWorkspaceSplit({ layoutMode }: UseDesktopWorkspaceSplitOptions) {
  const desktopWorkspaceRef = useRef<HTMLElement | null>(null);
  const activeDividerPointerIdRef = useRef<number | null>(null);
  const [desktopSplitRatio, setDesktopSplitRatio] = useState<number>(
    () => loadDesktopSplitRatio() ?? DEFAULT_DESKTOP_SPLIT_RATIO,
  );
  const [isDesktopResizing, setIsDesktopResizing] = useState(false);
  const desktopSplitRatioRef = useRef(desktopSplitRatio);

  useEffect(() => {
    desktopSplitRatioRef.current = desktopSplitRatio;
  }, [desktopSplitRatio]);

  const desktopLayoutStyle = useMemo(
    () => ({ "--desktop-split-ratio": `${desktopSplitRatio}` } as CSSProperties),
    [desktopSplitRatio],
  );

  const setDesktopSplitRatioValue = useCallback((nextRatio: number) => {
    desktopSplitRatioRef.current = nextRatio;
    setDesktopSplitRatio(nextRatio);
  }, []);

  const updateDesktopSplitRatioFromClientX = useCallback((clientX: number) => {
    const workspace = desktopWorkspaceRef.current;

    if (workspace === null) {
      return;
    }

    const workspaceBounds = workspace.getBoundingClientRect();
    const availableWidth = workspaceBounds.width - DESKTOP_DIVIDER_WIDTH;

    if (availableWidth <= 0) {
      return;
    }

    const nextRatio = clampDesktopSplitRatio(
      ((clientX - workspaceBounds.left - DESKTOP_DIVIDER_WIDTH / 2) / availableWidth) * 100,
      availableWidth,
    );

    setDesktopSplitRatioValue(nextRatio);
  }, [setDesktopSplitRatioValue]);

  const commitDesktopSplitRatio = useCallback((splitRatio: number) => {
    persistDesktopSplitRatio(splitRatio);
  }, []);

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

      const availableWidth = workspace.getBoundingClientRect().width - DESKTOP_DIVIDER_WIDTH;

      if (event.key === "Home") {
        event.preventDefault();
        const nextRatio = clampDesktopSplitRatio(MIN_DESKTOP_SPLIT_RATIO, availableWidth);
        setDesktopSplitRatioValue(nextRatio);
        commitDesktopSplitRatio(nextRatio);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        const nextRatio = clampDesktopSplitRatio(MAX_DESKTOP_SPLIT_RATIO, availableWidth);
        setDesktopSplitRatioValue(nextRatio);
        commitDesktopSplitRatio(nextRatio);
        return;
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();

      const delta = event.key === "ArrowLeft" ? -DESKTOP_SPLIT_KEYBOARD_STEP : DESKTOP_SPLIT_KEYBOARD_STEP;
      const nextRatio = clampDesktopSplitRatio(desktopSplitRatioRef.current + delta, availableWidth);

      setDesktopSplitRatioValue(nextRatio);
      commitDesktopSplitRatio(nextRatio);
    },
    [commitDesktopSplitRatio, setDesktopSplitRatioValue],
  );

  const handleDividerDoubleClick = useCallback(() => {
    setDesktopSplitRatioValue(DEFAULT_DESKTOP_SPLIT_RATIO);
    commitDesktopSplitRatio(DEFAULT_DESKTOP_SPLIT_RATIO);
  }, [commitDesktopSplitRatio, setDesktopSplitRatioValue]);

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
    maximumDesktopSplitRatio: MAX_DESKTOP_SPLIT_RATIO,
    minimumDesktopSplitRatio: MIN_DESKTOP_SPLIT_RATIO,
  };
}
