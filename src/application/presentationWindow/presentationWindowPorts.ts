import {
  type PageStyle,
  type PreviewDisplayMode,
  type PreviewTextStyle,
  type RenderedPreviewPage,
} from "../../domain/preview";

export const PRESENTATION_WINDOW_SNAPSHOT_VERSION = 1;

export type PresentationWindowSnapshot = {
  readonly version: typeof PRESENTATION_WINDOW_SNAPSHOT_VERSION;
  readonly createdAtEpochMs: number;
  readonly title: string;
  readonly displayMode: PreviewDisplayMode;
  readonly html: string;
  readonly pageHtmls: readonly string[];
  readonly pages: readonly RenderedPreviewPage[];
  readonly defaultPageStyle: PageStyle;
  readonly defaultTextStyle: PreviewTextStyle;
};

export type PresentationWindowGateway = {
  open(snapshot: PresentationWindowSnapshot): Promise<void>;
  load(snapshotKey: string | null): Promise<PresentationWindowSnapshot | null>;
};
