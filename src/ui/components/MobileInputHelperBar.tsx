import { memo, useEffect, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

export type MobileEditorInsertAdapter = {
  readonly insertText: (text: string) => void;
  readonly focusEditor: () => void;
  readonly saveSelection?: () => void;
  readonly restoreSelection?: () => void;
};

type MobileInputHelperCommand = {
  readonly id: string;
  readonly label: string;
  readonly insert: string;
};

const MOBILE_INPUT_HELPER_COMMANDS: readonly MobileInputHelperCommand[] = [
  { id: "hyphen", label: "-", insert: "-" },
  { id: "sharp", label: "#", insert: "#" },
  { id: "colon", label: ":", insert: ":" },
  { id: "kmark", label: "kmark", insert: "<!-- kmark -->" },
  { id: "brace-open", label: "{", insert: "{" },
  { id: "brace-close", label: "}", insert: "}" },
];

function setupMobileHelperViewportOffset(setBottomOffset: (px: number) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const viewport = window.visualViewport;

  if (viewport === undefined || viewport === null) {
    setBottomOffset(0);
    return () => {};
  }

  const update = () => {
    const bottomOffset = window.innerHeight - viewport.height - viewport.offsetTop;
    setBottomOffset(Math.max(0, Math.round(bottomOffset)));
  };

  update();

  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);

  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
  };
}

type MobileInputHelperBarProps = {
  readonly insertAdapter: MobileEditorInsertAdapter;
};

function MobileInputHelperBarComponent({ insertAdapter }: MobileInputHelperBarProps) {
  const [bottomOffset, setBottomOffset] = useState(0);

  useEffect(() => setupMobileHelperViewportOffset(setBottomOffset), []);

  const handlePressStart = (
    event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>,
  ) => {
    insertAdapter.saveSelection?.();
    event.preventDefault();
  };

  return (
    <div
      className="mobile-input-helper-bar"
      style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom))` }}
      role="toolbar"
      aria-label="Markdown 入力補助"
    >
      {MOBILE_INPUT_HELPER_COMMANDS.map((command) => (
        <button
          key={command.id}
          type="button"
          onPointerDown={handlePressStart}
          onMouseDown={handlePressStart}
          onClick={() => {
            insertAdapter.restoreSelection?.();
            insertAdapter.insertText(command.insert);
            insertAdapter.focusEditor();
          }}
        >
          {command.label}
        </button>
      ))}
    </div>
  );
}

export const MobileInputHelperBar = memo(MobileInputHelperBarComponent);
