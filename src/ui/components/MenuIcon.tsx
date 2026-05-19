import { memo, type ReactNode } from "react";

export type MenuIconName =
  | "arrow-left"
  | "check"
  | "document"
  | "fit-page"
  | "fit-width"
  | "folder"
  | "fullscreen"
  | "history"
  | "new-file"
  | "open-file"
  | "print"
  | "reset"
  | "reset-all"
  | "save"
  | "save-as"
  | "source"
  | "subwindow";

type MenuIconProps = {
  readonly className?: string;
  readonly name: MenuIconName;
};

function renderMenuIconPath(name: MenuIconName): ReactNode {
  switch (name) {
    case "arrow-left":
      return <path d="M10.5 4.5 5 10l5.5 5.5M5.75 10H16" />;
    case "check":
      return <path d="m5 10.5 3 3 7-7" />;
    case "document":
      return <path d="M6 3.5h5l3 3V16.5H6zM11 3.5V7h3" />;
    case "fit-page":
      return (
        <>
          <path d="M5 3.5h10v13H5z" />
          <path d="M7.5 6h5M7.5 9h5M7.5 12h5" />
        </>
      );
    case "fit-width":
      return (
        <>
          <path d="M4 6.5h12v7H4z" />
          <path d="m7 10-2-2m0 0-2 2m2-2v4M13 10l2-2m0 0 2 2m-2-2v4" />
        </>
      );
    case "folder":
      return <path d="M3.5 6.5h5l1.4 2H16.5v7H3.5z" />;
    case "fullscreen":
      return <path d="M4.5 8V4.5H8M12 4.5h3.5V8M15.5 12v3.5H12M8 15.5H4.5V12" />;
    case "history":
      return (
        <>
          <path d="M5 7.5H2.5V5" />
          <path d="M4.3 7.2A6 6 0 1 1 5.8 14" />
          <path d="M10 6.5v4l2.5 1.5" />
        </>
      );
    case "new-file":
      return <path d="M6 3.5h6l2 2V16.5H6zM11 3.5V6h3M10 8.5v5M7.5 11h5" />;
    case "open-file":
      return <path d="M4.5 5.5h4l1.5 2h5.5v7H4.5zM10 10.5h6l-1.2 4H4.5" />;
    case "print":
      return <path d="M6.5 7V3.5h7V7M6.5 14.5H4V8h12v6.5h-2.5M6.5 12h7v4.5h-7z" />;
    case "reset":
      return (
        <>
          <path d="M5 7.5H2.5V5" />
          <path d="M4.3 7.2A6 6 0 1 1 5.8 14" />
        </>
      );
    case "reset-all":
      return (
        <>
          <path d="M4 6.5H2V4.5" />
          <path d="M3.5 6.2A4.5 4.5 0 0 1 11 4.5" />
          <path d="M16 13.5h2v2" />
          <path d="M16.5 13.8A4.5 4.5 0 0 1 9 15.5" />
        </>
      );
    case "save":
      return <path d="M4.5 4.5h9l2 2v9h-11zM7 4.5V8h6M7 15.5v-4h6v4" />;
    case "save-as":
      return (
        <>
          <path d="M4.5 4.5h8l2 2v4.5M7 4.5V8h5" />
          <path d="M6.5 15.5h4l5-5-4-4-5 5zM10.5 7.5l4 4" />
        </>
      );
    case "source":
      return <path d="m8 6-4 4 4 4M12 6l4 4-4 4" />;
    case "subwindow":
      return <path d="M3.5 5.5h9v7h-9zM7.5 9.5h9v7h-9z" />;
    default:
      return null;
  }
}

function MenuIconComponent({ className, name }: MenuIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className === undefined ? "menu-icon" : `menu-icon ${className}`}
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      >
        {renderMenuIconPath(name)}
      </g>
    </svg>
  );
}

export const MenuIcon = memo(MenuIconComponent);
