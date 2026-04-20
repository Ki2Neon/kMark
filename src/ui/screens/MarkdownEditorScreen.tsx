import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type UIEvent,
} from "react";
import { selectStartupLayoutMode, type LayoutMode } from "../../domain/editor";
import { MenuSection } from "../components/MenuSection";
import { MarkdownInput } from "../components/MarkdownInput";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { useMarkdownEditor } from "../hooks/useMarkdownEditor";

const ACCEPTED_MARKDOWN_FILES = ".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain";
const MOBILE_SECTION_ORDER = ["menu", "draft", "preview"] as const;

type MobileSectionId = (typeof MOBILE_SECTION_ORDER)[number];

function detectLayoutMode(): LayoutMode {
  if (typeof window === "undefined") {
    return "desktop";
  }

  const navigatorWithUAData = navigator as Navigator & {
    readonly userAgentData?: {
      readonly mobile?: boolean;
    };
  };

  return selectStartupLayoutMode({
    viewportWidth: window.innerWidth,
    isMobileUserAgent:
      navigatorWithUAData.userAgentData?.mobile === true ||
      /android|iphone|ipad|ipod/iu.test(navigator.userAgent),
  });
}

export function MarkdownEditorScreen() {
  const {
    content,
    errorMessage,
    fileName,
    isDirty,
    previewHtml,
    stats,
    statusLabel,
    confirmDiscard,
    handleContentChange,
    handleErrorClear,
    handleFileNameChange,
    handlePickedFile,
    handleResetDocument,
    handleSaveDocument,
  } = useMarkdownEditor();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mobileTrackRef = useRef<HTMLElement | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => detectLayoutMode());
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<MobileSectionId>("draft");

  const scrollToMobileSection = useCallback((section: MobileSectionId, behavior: ScrollBehavior) => {
    const track = mobileTrackRef.current;

    if (track === null) {
      return;
    }

    const nextIndex = MOBILE_SECTION_ORDER.indexOf(section);
    track.scrollTo({
      left: track.clientWidth * nextIndex,
      behavior,
    });
  }, []);

  const closeDesktopMenu = useCallback(() => {
    setIsDesktopMenuOpen(false);
  }, []);

  const toggleDesktopMenu = useCallback(() => {
    setIsDesktopMenuOpen((currentValue) => !currentValue);
  }, []);

  const handleLayoutSync = useCallback(() => {
    setLayoutMode(detectLayoutMode());
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleLayoutSync);

    return () => {
      window.removeEventListener("resize", handleLayoutSync);
    };
  }, [handleLayoutSync]);

  useEffect(() => {
    if (layoutMode === "desktop") {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      setMobileSection("draft");
      scrollToMobileSection("draft", "auto");
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [layoutMode, scrollToMobileSection]);

  const handleRequestOpen = useCallback(() => {
    if (!confirmDiscard()) {
      return;
    }

    closeDesktopMenu();
    fileInputRef.current?.click();
  }, [closeDesktopMenu, confirmDiscard]);

  const handleRequestSave = useCallback(() => {
    closeDesktopMenu();
    void handleSaveDocument();
  }, [closeDesktopMenu, handleSaveDocument]);

  const handleRequestNew = useCallback(() => {
    if (!confirmDiscard()) {
      return;
    }

    closeDesktopMenu();
    handleResetDocument();
  }, [closeDesktopMenu, confirmDiscard, handleResetDocument]);

  const handleFileSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0] ?? null;

      void handlePickedFile(file);
      event.currentTarget.value = "";
    },
    [handlePickedFile],
  );

  const handleMobileTrackScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const container = event.currentTarget;
    const nextIndex = Math.round(container.scrollLeft / Math.max(container.clientWidth, 1));
    const nextSection = MOBILE_SECTION_ORDER[Math.max(0, Math.min(nextIndex, MOBILE_SECTION_ORDER.length - 1))];

    startTransition(() => {
      setMobileSection(nextSection);
    });
  }, []);

  const handleMobileSectionRequest = useCallback(
    (section: MobileSectionId) => {
      setMobileSection(section);
      scrollToMobileSection(section, "smooth");
    },
    [scrollToMobileSection],
  );

  const handleOverlayClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        closeDesktopMenu();
      }
    },
    [closeDesktopMenu],
  );

  const saveDocumentEvent = useEffectEvent(() => {
    void handleSaveDocument();
  });

  const openDocumentEvent = useEffectEvent(() => {
    if (!confirmDiscard()) {
      return;
    }

    if (layoutMode === "desktop") {
      setIsDesktopMenuOpen(false);
    }

    fileInputRef.current?.click();
  });

  const newDocumentEvent = useEffectEvent(() => {
    if (!confirmDiscard()) {
      return;
    }

    if (layoutMode === "desktop") {
      setIsDesktopMenuOpen(false);
    }

    handleResetDocument();
  });

  const menuToggleEvent = useEffectEvent(() => {
    if (layoutMode === "desktop") {
      toggleDesktopMenu();
      return;
    }

    handleMobileSectionRequest("menu");
  });

  const dismissMenuEvent = useEffectEvent(() => {
    if (layoutMode === "desktop") {
      setIsDesktopMenuOpen(false);
    }
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissMenuEvent();
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        saveDocumentEvent();
        return;
      }

      if (key === "b" && event.shiftKey) {
        event.preventDefault();
        menuToggleEvent();
        return;
      }

      if (key === "o") {
        event.preventDefault();
        openDocumentEvent();
        return;
      }

      if (key === "n") {
        event.preventDefault();
        newDocumentEvent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissMenuEvent, menuToggleEvent, newDocumentEvent, openDocumentEvent, saveDocumentEvent]);

  return (
    <main className={`editor-shell editor-shell--${layoutMode}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_MARKDOWN_FILES}
        className="visually-hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileSelection}
      />

      {layoutMode === "desktop" ? (
        <button
          type="button"
          className="editor-shell__menu-launcher"
          aria-label="メニューを開く"
          aria-expanded={isDesktopMenuOpen}
          onClick={toggleDesktopMenu}
        >
          <span>Menu</span>
          <small>Ctrl / Cmd + Shift + B</small>
        </button>
      ) : null}

      {errorMessage !== null ? (
        <section className="editor-shell__banner" role="alert">
          <span>{errorMessage}</span>
          <button type="button" onClick={handleErrorClear}>
            閉じる
          </button>
        </section>
      ) : null}

      {layoutMode === "desktop" ? (
        <>
          <section className="workspace-grid" aria-label="メインワークスペース">
            <MarkdownInput content={content} onContentChange={handleContentChange} />
            <MarkdownPreview html={previewHtml} />
          </section>

          {isDesktopMenuOpen ? (
            <div className="editor-shell__overlay" onClick={handleOverlayClick}>
              <div className="editor-shell__sidebar" role="dialog" aria-modal="true" aria-label="メニュー">
                <MenuSection
                  fileName={fileName}
                  isDirty={isDirty}
                  layoutMode={layoutMode}
                  stats={stats}
                  statusLabel={statusLabel}
                  onClose={closeDesktopMenu}
                  onFileNameChange={handleFileNameChange}
                  onNewDocument={handleRequestNew}
                  onOpenDocument={handleRequestOpen}
                  onSaveDocument={handleRequestSave}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <section
            ref={mobileTrackRef}
            className="editor-shell__mobile-track"
            aria-label="モバイルワークスペース"
            onScroll={handleMobileTrackScroll}
          >
            <div className="editor-shell__mobile-slide">
              <MenuSection
                fileName={fileName}
                isDirty={isDirty}
                layoutMode={layoutMode}
                stats={stats}
                statusLabel={statusLabel}
                onFileNameChange={handleFileNameChange}
                onNewDocument={handleRequestNew}
                onOpenDocument={handleRequestOpen}
                onSaveDocument={handleRequestSave}
              />
            </div>
            <div className="editor-shell__mobile-slide">
              <MarkdownInput content={content} onContentChange={handleContentChange} />
            </div>
            <div className="editor-shell__mobile-slide">
              <MarkdownPreview html={previewHtml} />
            </div>
          </section>

          <nav className="editor-shell__mobile-nav" aria-label="セクション移動">
            {MOBILE_SECTION_ORDER.map((section) => (
              <button
                key={section}
                type="button"
                className={mobileSection === section ? "is-active" : undefined}
                onClick={() => handleMobileSectionRequest(section)}
              >
                {section}
              </button>
            ))}
          </nav>
        </>
      )}
    </main>
  );
}