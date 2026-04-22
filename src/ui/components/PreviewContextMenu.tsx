import { memo, type CSSProperties, type RefObject } from "react";

type PreviewContextMenuProps = {
  readonly ariaLabel: string;
  readonly menuRef: RefObject<HTMLDivElement | null>;
  readonly onFit: () => void;
  readonly style?: CSSProperties;
};

function PreviewContextMenuComponent({ ariaLabel, menuRef, onFit, style }: PreviewContextMenuProps) {
  return (
    <div
      ref={menuRef}
      className="preview-window__context-menu"
      role="menu"
      aria-label={ariaLabel}
      style={style}
    >
      <button type="button" className="preview-window__context-menu-item" role="menuitem" onClick={onFit}>
        Fit
      </button>
    </div>
  );
}

export const PreviewContextMenu = memo(PreviewContextMenuComponent);