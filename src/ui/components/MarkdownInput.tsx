import { lazy, memo, Suspense } from "react";
import { type LayoutMode } from "../../domain/editor";
import { type EditFontId, type MultiCursorModifier } from "../../domain/editorPreferences";
import { type AppThemeId } from "../../domain/theme";

const DesktopMarkdownInput = lazy(async () => {
  const module = await import("./DesktopMarkdownInput");

  return {
    default: module.DesktopMarkdownInput,
  };
});

type MarkdownInputProps = {
  readonly appThemeId: AppThemeId;
  readonly content: string;
  readonly currentDocumentFilePath?: string | null;
  readonly editFontId: EditFontId;
  readonly layoutMode: LayoutMode;
  readonly lineWrappingEnabled: boolean;
  readonly multiCursorModifier: MultiCursorModifier;
  readonly showLineNumbers: boolean;
  readonly onAssetDrop?: (droppedFilePaths: readonly string[]) => Promise<string | null>;
  readonly onAssetPaste?: (files: readonly PastedMarkdownAssetFile[]) => Promise<string | null>;
  readonly onContentChange: (content: string) => void;
  readonly onCursorLineChange?: (lineNumber: number) => void;
  readonly onFocusChange?: (isFocused: boolean) => void;
  readonly requestedLineSelection?: {
    readonly lineNumber: number;
    readonly requestId: number;
  } | null;
  readonly showMobileInputHelperBar?: boolean;
};

export type PastedMarkdownAssetFile = {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: readonly number[];
};

function MarkdownInputComponent({
  appThemeId,
  content,
  currentDocumentFilePath = null,
  editFontId,
  layoutMode,
  lineWrappingEnabled,
  multiCursorModifier,
  showLineNumbers,
  onAssetDrop,
  onAssetPaste,
  onContentChange,
  onCursorLineChange,
  onFocusChange,
  requestedLineSelection,
  showMobileInputHelperBar = false,
}: MarkdownInputProps) {
  return (
    <section className="section section--edit" aria-label="Edit">
      <div className="edit-section__editor">
        <Suspense fallback={null}>
          <DesktopMarkdownInput
            appThemeId={appThemeId}
            blurOnEscapeWhenSelectionEmpty={layoutMode === "mobile"}
            content={content}
            currentDocumentFilePath={currentDocumentFilePath}
            editFontId={editFontId}
            lineWrappingEnabled={lineWrappingEnabled}
            multiCursorModifier={multiCursorModifier}
            showLineNumbers={showLineNumbers}
            onAssetDrop={onAssetDrop}
            onAssetPaste={onAssetPaste}
            onContentChange={onContentChange}
            onCursorLineChange={onCursorLineChange}
            onFocusChange={onFocusChange}
            requestedLineSelection={requestedLineSelection}
            showMobileInputHelperBar={showMobileInputHelperBar}
          />
        </Suspense>
      </div>
    </section>
  );
}

export const MarkdownInput = memo(MarkdownInputComponent);
