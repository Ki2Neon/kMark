import { memo, type CSSProperties, type RefObject } from "react";

export type PreviewContextMenuSourceOption = {
  readonly id: string;
  readonly isSelected: boolean;
  readonly label: string;
};

type PreviewContextMenuProps = {
  readonly ariaLabel: string;
  readonly fullscreenLabel?: string;
  readonly hasModelCameraTarget: boolean;
  readonly menuRef: RefObject<HTMLDivElement | null>;
  readonly onFit: () => void;
  readonly onFullFit?: () => void;
  readonly onFullscreenToggle?: () => void;
  readonly onModelCameraReset?: () => void;
  readonly onSourceSelect?: (sourceOptionId: string) => void;
  readonly sourceOptions?: readonly PreviewContextMenuSourceOption[];
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
  onSourceSelect,
  sourceOptions = [],
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
      {sourceOptions.map((sourceOption) => (
        <button
          key={sourceOption.id}
          type="button"
          className="preview-context-menu__item preview-context-menu__item--source"
          role="menuitemradio"
          aria-checked={sourceOption.isSelected}
          onClick={() => onSourceSelect?.(sourceOption.id)}
        >
          {sourceOption.isSelected ? "✓ " : ""}
          {sourceOption.label}
        </button>
      ))}
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
