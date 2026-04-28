import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { type LayoutMode } from "../../domain/editor";

const MOBILE_SECTION_ORDER_WITH_PREVIEW = ["menu", "edit", "preview"] as const;
const MOBILE_SECTION_ORDER_WITHOUT_PREVIEW = ["menu", "edit"] as const;
const MOBILE_SWIPE_THRESHOLD_PX = 40;
const MOBILE_SLIDE_TRANSITION_MS = 180;
const MOBILE_SLIDE_TRANSITION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export type MobileSectionId = "menu" | "edit" | "preview";

function getMobileSectionIndex(section: MobileSectionId, sectionOrder: readonly MobileSectionId[]): number {
  return sectionOrder.indexOf(section);
}

type UseMobileSectionNavigationOptions = {
  readonly blurActiveElement: () => void;
  readonly isEditFocused: boolean;
  readonly isPreviewVisible: boolean;
  readonly layoutMode: LayoutMode;
};

export function useMobileSectionNavigation({
  blurActiveElement,
  isEditFocused,
  isPreviewVisible,
  layoutMode,
}: UseMobileSectionNavigationOptions) {
  const mobileTrackRef = useRef<HTMLElement | null>(null);
  const mobileSwipePointerIdRef = useRef<number | null>(null);
  const mobileSwipeStartXRef = useRef<number | null>(null);
  const mobileSwipeStartYRef = useRef<number | null>(null);
  const mobileSwipeStartIndexRef = useRef(0);
  const mobileSwipeAxisRef = useRef<"horizontal" | "vertical" | null>(null);
  const mobileDragOffsetPxRef = useRef(0);
  const mobileSectionBeforeMenuRef = useRef<Exclude<MobileSectionId, "menu">>("edit");
  const pendingMobileSectionRef = useRef<MobileSectionId | null>(null);

  const [isMobileDragging, setIsMobileDragging] = useState(false);
  const [mobileDragOffsetPx, setMobileDragOffsetPx] = useState(0);
  const [mobileSection, setMobileSection] = useState<MobileSectionId>("edit");
  const [mobileViewportWidth, setMobileViewportWidth] = useState<number>(() => {
    if (typeof window === "undefined") {
      return 0;
    }

    return window.innerWidth;
  });

  const mobileSectionOrder = isPreviewVisible ? MOBILE_SECTION_ORDER_WITH_PREVIEW : MOBILE_SECTION_ORDER_WITHOUT_PREVIEW;
  const mobileSectionIndex = useMemo(() => {
    const nextIndex = getMobileSectionIndex(mobileSection, mobileSectionOrder);

    return nextIndex === -1 ? getMobileSectionIndex("edit", mobileSectionOrder) : nextIndex;
  }, [mobileSection, mobileSectionOrder]);

  const mobileTrackInnerStyle = useMemo(
    () => ({
      transform: `translate3d(${(-mobileSectionIndex * mobileViewportWidth) + mobileDragOffsetPx}px, 0, 0)`,
      transitionDuration: isMobileDragging ? "0ms" : `${MOBILE_SLIDE_TRANSITION_MS}ms`,
      transitionTimingFunction: isMobileDragging ? "linear" : MOBILE_SLIDE_TRANSITION_EASING,
    } as CSSProperties),
    [isMobileDragging, mobileDragOffsetPx, mobileSectionIndex, mobileViewportWidth],
  );

  const mobileNavStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${mobileSectionOrder.length}, minmax(0, 1fr))` } as CSSProperties),
    [mobileSectionOrder.length],
  );

  const syncMobileViewportWidth = useCallback(() => {
    const track = mobileTrackRef.current;
    const nextWidth = track?.clientWidth ?? (typeof window === "undefined" ? 0 : window.innerWidth);

    setMobileViewportWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
  }, []);

  const resetMobileDrag = useCallback(() => {
    setIsMobileDragging(false);
    setMobileDragOffsetPx(0);
    mobileDragOffsetPxRef.current = 0;
  }, []);

  const requestMobileSection = useCallback(
    (section: MobileSectionId) => {
      if (!isPreviewVisible && section === "preview") {
        return;
      }

      if (section === "menu" && mobileSection !== "menu") {
        mobileSectionBeforeMenuRef.current = mobileSection;
      }

      if (section !== "edit") {
        blurActiveElement();
      }

      resetMobileDrag();
      setMobileSection(section);
    },
    [blurActiveElement, isPreviewVisible, mobileSection, resetMobileDrag],
  );

  const dismissMobileMenu = useCallback(() => {
    if (mobileSection !== "menu") {
      return;
    }

    const previousMobileSection = !isPreviewVisible && mobileSectionBeforeMenuRef.current === "preview"
      ? "edit"
      : mobileSectionBeforeMenuRef.current;

    requestMobileSection(previousMobileSection);
  }, [isPreviewVisible, mobileSection, requestMobileSection]);

  const clearMobileSwipeState = useCallback(() => {
    mobileSwipePointerIdRef.current = null;
    mobileSwipeStartXRef.current = null;
    mobileSwipeStartYRef.current = null;
    mobileSwipeAxisRef.current = null;
  }, []);

  useEffect(() => {
    const handleViewportResize = () => {
      syncMobileViewportWidth();
    };

    window.addEventListener("resize", handleViewportResize);

    return () => {
      window.removeEventListener("resize", handleViewportResize);
    };
  }, [syncMobileViewportWidth]);

  useEffect(() => {
    if (layoutMode === "desktop") {
      pendingMobileSectionRef.current = null;
      return;
    }

    syncMobileViewportWidth();
    resetMobileDrag();

    const animationFrameId = window.requestAnimationFrame(() => {
      const nextMobileSection = pendingMobileSectionRef.current ?? "edit";
      pendingMobileSectionRef.current = null;
      setMobileSection(nextMobileSection);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [layoutMode, resetMobileDrag, syncMobileViewportWidth]);

  useEffect(() => {
    syncMobileViewportWidth();
  }, [layoutMode, syncMobileViewportWidth]);

  useEffect(() => {
    if (mobileSection !== "menu") {
      mobileSectionBeforeMenuRef.current = mobileSection;
    }
  }, [mobileSection]);

  useEffect(() => {
    if (isPreviewVisible || mobileSection !== "preview") {
      return;
    }

    pendingMobileSectionRef.current = "edit";
    resetMobileDrag();
    setMobileSection("edit");
  }, [isPreviewVisible, mobileSection, resetMobileDrag]);

  const prepareForLayoutModeChange = useCallback((nextLayoutMode: LayoutMode) => {
    resetMobileDrag();

    if (nextLayoutMode === "mobile") {
      pendingMobileSectionRef.current = "menu";
      syncMobileViewportWidth();
    }
  }, [resetMobileDrag, syncMobileViewportWidth]);

  const handleMobileTrackPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || layoutMode !== "mobile") {
      return;
    }

    const eventTarget = event.target;

    if (!(eventTarget instanceof HTMLElement)) {
      return;
    }

    if (eventTarget.closest("button, input, select, label, a") !== null) {
      return;
    }

    if (mobileSection === "edit" && isEditFocused) {
      return;
    }

    mobileSwipePointerIdRef.current = event.pointerId;
    mobileSwipeStartXRef.current = event.clientX;
    mobileSwipeStartYRef.current = event.clientY;
    mobileSwipeStartIndexRef.current = mobileSectionIndex;
    mobileSwipeAxisRef.current = null;
    mobileDragOffsetPxRef.current = 0;
    resetMobileDrag();
  }, [isEditFocused, layoutMode, mobileSection, mobileSectionIndex, resetMobileDrag]);

  const handleMobileTrackPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (mobileSwipePointerIdRef.current !== event.pointerId) {
      return;
    }

    const startX = mobileSwipeStartXRef.current;
    const startY = mobileSwipeStartYRef.current;

    if (startX === null || startY === null) {
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (mobileSwipeAxisRef.current === null) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) {
        return;
      }

      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        clearMobileSwipeState();
        return;
      }

      mobileSwipeAxisRef.current = "horizontal";
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setIsMobileDragging(true);
    }

    if (mobileSwipeAxisRef.current !== "horizontal") {
      return;
    }

    const baseIndex = mobileSwipeStartIndexRef.current;
    let nextOffset = deltaX;

    if ((baseIndex === 0 && nextOffset > 0) || (baseIndex === mobileSectionOrder.length - 1 && nextOffset < 0)) {
      nextOffset = 0;
    }

    mobileDragOffsetPxRef.current = nextOffset;
    setMobileDragOffsetPx(nextOffset);
  }, [clearMobileSwipeState, mobileSectionOrder.length]);

  const handleMobileTrackPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (mobileSwipePointerIdRef.current !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const axis = mobileSwipeAxisRef.current;
      const baseIndex = mobileSwipeStartIndexRef.current;
      const width = mobileViewportWidth > 0 ? mobileViewportWidth : event.currentTarget.clientWidth;
      const currentOffset = mobileDragOffsetPxRef.current;

      clearMobileSwipeState();
      resetMobileDrag();

      if (axis !== "horizontal" || width <= 0) {
        return;
      }

      const threshold = Math.max(MOBILE_SWIPE_THRESHOLD_PX, Math.min(80, width * 0.12));
      let targetIndex = baseIndex;

      if (Math.abs(currentOffset) >= threshold) {
        targetIndex = currentOffset < 0
          ? Math.min(baseIndex + 1, mobileSectionOrder.length - 1)
          : Math.max(baseIndex - 1, 0);
      }

      const nextSection = mobileSectionOrder[targetIndex] ?? "edit";

      if (nextSection !== "edit") {
        blurActiveElement();
      }

      setMobileSection(nextSection);
    },
    [blurActiveElement, clearMobileSwipeState, mobileSectionOrder, mobileViewportWidth, resetMobileDrag],
  );

  return {
    dismissMobileMenu,
    handleMobileTrackPointerDown,
    handleMobileTrackPointerEnd,
    handleMobileTrackPointerMove,
    isMobileDragging,
    mobileNavStyle,
    mobileSection,
    mobileSectionOrder,
    mobileTrackInnerStyle,
    mobileTrackRef,
    prepareForLayoutModeChange,
    requestMobileSection,
    resetMobileDrag,
  };
}
