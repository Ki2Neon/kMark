import { memo, type CSSProperties, type RefObject } from "react";

type PreviewContextMenuProps = {
  readonly ariaLabel: string;
  readonly fullscreenLabel?: string;
  readonly hasModelCameraTarget: boolean;
  readonly menuRef: RefObject<HTMLDivElement | null>;
  readonly onFit: () => void;
  readonly onFullFit?: () => void;
  readonly onFullscreenToggle?: () => void;
  readonly onModelCameraReset?: () => void;
  readonly style?: CSSProperties;
};

function PreviewContextMenuComponent({
  ariaLabel,
  fullscreenLabel = "Fullscreen",
  hasModelCameraTarget,
  menuRef,
  onFit,
  onFullFit,
  onFullscreenToggle,
  onModelCameraReset,
  style,
}: PreviewContextMenuProps) {
  return (
    <div
      ref={menuRef}
      className="preview-context-menu"
      role="menu"
      aria-label={ariaLabel}
      style={style}
    >
      <button type="button" className="preview-context-menu__item" role="menuitem" onClick={onFit}>
        Fit
      </button>
      {onFullFit === undefined ? null : (
        <button type="button" className="preview-context-menu__item" role="menuitem" onClick={onFullFit}>
          Fit All
        </button>
      )}
      {onFullscreenToggle === undefined ? null : (
        <button type="button" className="preview-context-menu__item" role="menuitem" onClick={onFullscreenToggle}>
          {fullscreenLabel}
        </button>
      )}
      {hasModelCameraTarget && onModelCameraReset !== undefined ? (
        <button type="button" className="preview-context-menu__item" role="menuitem" onClick={onModelCameraReset}>
          Reset 3D View
        </button>
      ) : null}
    </div>
  );
}

export const PreviewContextMenu = memo(PreviewContextMenuComponent);
