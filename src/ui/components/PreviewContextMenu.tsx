import { memo, type CSSProperties, type RefObject } from "react";
import { MenuIcon } from "./MenuIcon";

export type PreviewContextMenuSourceOption = {
  readonly id: string;
  readonly isSelected: boolean;
  readonly label: string;
};

type PreviewContextMenuProps = {
  readonly ariaLabel: string;
  readonly fullscreenLabel?: string;
  readonly hasModelCameraTarget: boolean;
  readonly hasModelCameraTargets: boolean;
  readonly menuRef: RefObject<HTMLDivElement | null>;
  readonly onAllModelCamerasReset?: () => void;
  readonly onFit: () => void;
  readonly onFullFit?: () => void;
  readonly onFullscreenToggle?: () => void;
  readonly onModelCameraReset?: () => void;
  readonly onModelViewpointSave?: () => void;
  readonly onSourceSelect?: (sourceOptionId: string) => void;
  readonly sourceOptions?: readonly PreviewContextMenuSourceOption[];
  readonly style?: CSSProperties;
};

function PreviewContextMenuComponent({
  ariaLabel,
  fullscreenLabel = "Fullscreen",
  hasModelCameraTarget,
  hasModelCameraTargets,
  menuRef,
  onAllModelCamerasReset,
  onFit,
  onFullFit,
  onFullscreenToggle,
  onModelCameraReset,
  onModelViewpointSave,
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
          <MenuIcon name={sourceOption.isSelected ? "check" : "source"} />
          <span className="preview-context-menu__label">{sourceOption.label}</span>
        </button>
      ))}
      <button type="button" className="preview-context-menu__item" role="menuitem" onClick={onFit}>
        <MenuIcon name="fit-width" />
        <span className="preview-context-menu__label">Fit</span>
      </button>
      {onFullFit === undefined ? null : (
        <button type="button" className="preview-context-menu__item" role="menuitem" onClick={onFullFit}>
          <MenuIcon name="fit-page" />
          <span className="preview-context-menu__label">Fit All</span>
        </button>
      )}
      {onFullscreenToggle === undefined ? null : (
        <button type="button" className="preview-context-menu__item" role="menuitem" onClick={onFullscreenToggle}>
          <MenuIcon name="fullscreen" />
          <span className="preview-context-menu__label">{fullscreenLabel}</span>
        </button>
      )}
      {hasModelCameraTarget && onModelViewpointSave !== undefined ? (
        <button type="button" className="preview-context-menu__item" role="menuitem" onClick={onModelViewpointSave}>
          <MenuIcon name="save" />
          <span className="preview-context-menu__label">画角を保存</span>
        </button>
      ) : null}
      {hasModelCameraTarget && onModelCameraReset !== undefined ? (
        <button type="button" className="preview-context-menu__item" role="menuitem" onClick={onModelCameraReset}>
          <MenuIcon name="reset" />
          <span className="preview-context-menu__label">3D: Reset View</span>
        </button>
      ) : null}
      {hasModelCameraTargets && onAllModelCamerasReset !== undefined ? (
        <button type="button" className="preview-context-menu__item" role="menuitem" onClick={onAllModelCamerasReset}>
          <MenuIcon name="reset-all" />
          <span className="preview-context-menu__label">3D: Reset All Views</span>
        </button>
      ) : null}
    </div>
  );
}

export const PreviewContextMenu = memo(PreviewContextMenuComponent);
