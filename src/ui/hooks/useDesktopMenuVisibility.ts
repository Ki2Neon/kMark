import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

type UseDesktopMenuVisibilityOptions = {
  readonly transitionMs: number;
};

export function useDesktopMenuVisibility({ transitionMs }: UseDesktopMenuVisibilityOptions) {
  const desktopMenuCloseTimeoutRef = useRef<number | null>(null);
  const [isDesktopMenuMounted, setIsDesktopMenuMounted] = useState(false);
  const [isDesktopMenuVisible, setIsDesktopMenuVisible] = useState(false);

  const clearDesktopMenuTimers = useCallback(() => {
    if (desktopMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(desktopMenuCloseTimeoutRef.current);
      desktopMenuCloseTimeoutRef.current = null;
    }
  }, []);

  const closeDesktopMenuImmediately = useCallback(() => {
    clearDesktopMenuTimers();
    setIsDesktopMenuVisible(false);
    setIsDesktopMenuMounted(false);
  }, [clearDesktopMenuTimers]);

  const closeDesktopMenu = useCallback(() => {
    clearDesktopMenuTimers();
    setIsDesktopMenuVisible(false);
    desktopMenuCloseTimeoutRef.current = window.setTimeout(() => {
      setIsDesktopMenuMounted(false);
      desktopMenuCloseTimeoutRef.current = null;
    }, transitionMs);
  }, [clearDesktopMenuTimers, transitionMs]);

  const openDesktopMenu = useCallback(() => {
    clearDesktopMenuTimers();
    setIsDesktopMenuMounted(true);
    setIsDesktopMenuVisible(true);
  }, [clearDesktopMenuTimers]);

  const toggleDesktopMenu = useCallback(() => {
    if (isDesktopMenuMounted && isDesktopMenuVisible) {
      closeDesktopMenu();
      return;
    }

    openDesktopMenu();
  }, [closeDesktopMenu, isDesktopMenuMounted, isDesktopMenuVisible, openDesktopMenu]);

  const handleOverlayClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        closeDesktopMenu();
      }
    },
    [closeDesktopMenu],
  );

  useEffect(() => {
    return () => {
      clearDesktopMenuTimers();
    };
  }, [clearDesktopMenuTimers]);

  return {
    closeDesktopMenu,
    closeDesktopMenuImmediately,
    handleOverlayClick,
    isDesktopMenuMounted,
    isDesktopMenuVisible,
    toggleDesktopMenu,
  };
}
