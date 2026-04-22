import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { type PreviewDisplayMode } from "../../domain/preview";

const PREVIEW_CONTEXT_MENU_WIDTH_PX = 132;
const PREVIEW_CONTEXT_MENU_HEIGHT_PX = 52;

export const MIN_PREVIEW_ZOOM_SCALE = 0.05;
export const MAX_PREVIEW_ZOOM_SCALE = 10;

type PreviewContextMenuState = {
  readonly x: number;
  readonly y: number;
};

type UsePreviewInteractionOptions = {
  readonly displayMode: PreviewDisplayMode;
  readonly isAvailable?: boolean;
};

export function clampPreviewZoomScale(zoomScale: number): number {
  return Math.round(Math.min(MAX_PREVIEW_ZOOM_SCALE, Math.max(MIN_PREVIEW_ZOOM_SCALE, zoomScale)) * 100) / 100;
}

export function usePreviewInteraction({ displayMode, isAvailable = true }: UsePreviewInteractionOptions) {
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenuState, setContextMenuState] = useState<PreviewContextMenuState | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  const contextMenuStyle = useMemo<CSSProperties | undefined>(
    () => (contextMenuState === null
      ? undefined
      : {
          left: `${contextMenuState.x}px`,
          top: `${contextMenuState.y}px`,
        }),
    [contextMenuState],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  const handleZoomFit = useCallback(() => {
    setZoomScale(1);
    closeContextMenu();
  }, [closeContextMenu]);

  const handleZoomScaleChange = useCallback((nextZoomScale: number) => {
    setZoomScale(clampPreviewZoomScale(nextZoomScale));
  }, []);

  const handlePreviewContextMenu = useCallback((clientX: number, clientY: number) => {
    const nextX = Math.max(8, Math.min(clientX, window.innerWidth - PREVIEW_CONTEXT_MENU_WIDTH_PX - 8));
    const nextY = Math.max(8, Math.min(clientY, window.innerHeight - PREVIEW_CONTEXT_MENU_HEIGHT_PX - 8));

    setContextMenuState({ x: nextX, y: nextY });
  }, []);

  useEffect(() => {
    if (displayMode !== "a4") {
      return;
    }

    setZoomScale(1);
  }, [displayMode]);

  useEffect(() => {
    if (isAvailable) {
      return;
    }

    closeContextMenu();
  }, [closeContextMenu, isAvailable]);

  useEffect(() => {
    if (contextMenuState === null) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const eventTarget = event.target;

      if (eventTarget instanceof Node && contextMenuRef.current?.contains(eventTarget)) {
        return;
      }

      closeContextMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    const handleWindowBlur = () => {
      closeContextMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("resize", handleWindowBlur);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("resize", handleWindowBlur);
    };
  }, [closeContextMenu, contextMenuState]);

  return {
    contextMenuRef,
    contextMenuState,
    contextMenuStyle,
    handlePreviewContextMenu,
    handleZoomFit,
    handleZoomScaleChange,
    zoomScale,
  };
}