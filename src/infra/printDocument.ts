import {
  A4_MARGIN_BOTTOM_MM,
  A4_MARGIN_LEFT_MM,
  A4_MARGIN_RIGHT_MM,
  A4_MARGIN_TOP_MM,
  A4_PAGE_HEIGHT_MM,
  A4_PAGE_WIDTH_MM,
  type PreviewDisplayMode,
} from "../domain/preview";

type StandardPrintMarkdownDocumentOptions = {
  readonly displayMode: Extract<PreviewDisplayMode, "standard">;
  readonly title: string;
  readonly html: string;
};

type A4PrintMarkdownDocumentOptions = {
  readonly displayMode: Extract<PreviewDisplayMode, "a4">;
  readonly title: string;
};

type A4PrintPreviewPage = {
  readonly frameStyle: string;
  readonly html: string;
  readonly pageChromeHtml: string;
  readonly pageNumberHtml: string;
  readonly pageName: string;
  readonly pageHeight: string;
  readonly pageWidth: string;
};

type PrintMarkdownDocumentOptions =
  | StandardPrintMarkdownDocumentOptions
  | A4PrintMarkdownDocumentOptions;
type PrintMarkdownDocumentRuntimeOptions = {
  readonly preparePrintWindow?: (printWindow: Window) => Promise<(() => void) | void> | (() => void) | void;
};

const PRINT_DOCUMENT_LOAD_TIMEOUT_MS = 3000;
const PRINT_DIALOG_FALLBACK_TIMEOUT_MS = 2000;
const A4_PRINT_DIALOG_FALLBACK_TIMEOUT_MS = 60000;
const KMARK_PRINT_ROOT_ID = "kmark-print-root";
const PRINT_DOCUMENT_ROOT_ATTRIBUTE_NAMES = ["data-app-theme", "data-preview-colors"] as const;

type StandardPrintPreviewContent = {
  readonly html: string;
  readonly style: string;
};

// Normal print output is derived from the active preview stylesheet.
// This fallback is only for environments where CSSOM stylesheet access is blocked.
const PRINT_DOCUMENT_FALLBACK_STYLE = `
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #ffffff;
  }

  body {
    color: #111111;
    font-family: "Aptos", "Segoe UI Variable", "Segoe UI", sans-serif;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .markdown-body {
    --markdown-body-font-size: var(--kmark-font-size, 1rem);
    max-width: none;
    font-family: var(--kmark-font-family, inherit);
    font-size: var(--markdown-body-font-size);
    color: #111111;
  }

  .markdown-body > :first-child {
    margin-top: 0;
  }

  .markdown-body h1,
  .markdown-body h2,
  .markdown-body h3,
  .markdown-body h4,
  .markdown-body h5,
  .markdown-body h6 {
    color: #111111;
    font-family: var(--kmark-heading-font-family, inherit);
    line-height: 1.2;
  }

  .markdown-body h1 {
    font-size: 1.8em;
  }

  .markdown-body h2 {
    margin-top: 1.2963em;
    font-size: 1.35em;
  }

  .markdown-body p,
  .markdown-body ul,
  .markdown-body ol,
  .markdown-body dl,
  .markdown-body blockquote,
  .markdown-body .kmark-toc,
  .markdown-body .kmark-callout,
  .markdown-body .kmark-mermaid-block,
  .markdown-body pre,
  .markdown-body table {
    margin: 1em 0;
  }

  .markdown-body a {
    color: inherit;
  }

  .markdown-body img,
  .markdown-body video,
  .markdown-body .kmark-model-viewer,
  .markdown-body .kmark-model-error {
    max-width: 100%;
    box-sizing: content-box;
  }

  .markdown-body .kmark-model-viewer {
    position: relative;
    display: inline-block;
    min-width: 220px;
    height: 360px;
    overflow: hidden;
    border: 0.75pt solid #d7d7d7;
    border-radius: 4pt;
    background: #ffffff;
  }

  .markdown-body .kmark-model-canvas,
  .markdown-body .kmark-model-canvas > canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .markdown-body .kmark-model-status,
  .markdown-body .kmark-model-error {
    display: block;
    padding: 0.75em 0.9em;
    border: 0.75pt solid #d7d7d7;
    border-radius: 4pt;
    background: #fff5f5;
    color: #991b1b;
    white-space: pre-wrap;
  }

  .markdown-body video[poster] {
    display: inline-block;
    overflow: hidden;
    background-color: #000;
    object-fit: contain;
    object-position: center center;
  }

  .markdown-body .kmark-video-frame {
    position: relative;
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    background-color: #000;
    line-height: 0;
    vertical-align: baseline;
    box-sizing: content-box;
  }

  .markdown-body .kmark-video-frame > video {
    display: block;
    max-width: 100%;
  }

  .markdown-body .kmark-video-frame > .kmark-video-poster-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background-color: #000;
    object-fit: contain;
    object-position: center center;
    pointer-events: none;
    user-select: none;
    box-sizing: border-box;
  }

  .markdown-body .kmark-video-frame[data-kmark-video-load-state="failed"] > .kmark-video-poster-image {
    display: none;
  }

  .markdown-body .kmark-mermaid-block {
    max-width: 100%;
    overflow-x: auto;
    overflow-y: visible;
    padding: 0.75em;
    border: 0.75pt solid #d7d7d7;
    border-radius: 4pt;
    background: var(--kmark-mermaid-surface-bg, #ffffff);
    isolation: isolate;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .markdown-body .kmark-mermaid-block--image-params:not(.kmark-mermaid-error) {
    overflow: visible;
    padding: 0;
    border-width: 0;
    border-radius: 0;
    background: transparent;
  }

  .markdown-body .kmark-mermaid-rendered {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    max-width: 100%;
    overflow: visible;
  }

  .markdown-body .kmark-mermaid-block[data-kmark-mermaid-align="left"] .kmark-mermaid-rendered {
    justify-content: flex-start;
  }

  .markdown-body .kmark-mermaid-block[data-kmark-mermaid-align="right"] .kmark-mermaid-rendered {
    justify-content: flex-end;
  }

  .markdown-body .kmark-mermaid-rendered svg {
    display: block;
    flex: 0 1 auto;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
    height: auto;
    background: var(--kmark-mermaid-svg-bg, transparent);
  }

  .markdown-body .kmark-mermaid-block--gantt .kmark-mermaid-rendered svg {
    background: var(--kmark-mermaid-svg-bg, #ffffff);
  }

  .markdown-body .kmark-mermaid-block--gantt .kmark-mermaid-rendered svg text {
    font-size: var(--kmark-mermaid-font-size);
  }

  .markdown-body .kmark-mermaid-block--gantt .kmark-mermaid-rendered svg .taskText,
  .markdown-body .kmark-mermaid-block--gantt .kmark-mermaid-rendered svg .taskTextOutsideRight,
  .markdown-body .kmark-mermaid-block--gantt .kmark-mermaid-rendered svg .taskTextOutsideLeft {
    dominant-baseline: middle;
  }

  .markdown-body .kmark-mermaid-block--gantt .kmark-mermaid-rendered svg :is(
    text.taskText,
    text.taskText0,
    text.taskText1,
    text.taskText2,
    text.taskText3,
    text.activeText0,
    text.activeText1,
    text.activeText2,
    text.activeText3,
    text.activeCritText0,
    text.activeCritText1,
    text.activeCritText2,
    text.activeCritText3,
    text.critText0,
    text.critText1,
    text.critText2,
    text.critText3,
    text.doneText0,
    text.doneText1,
    text.doneText2,
    text.doneText3,
    text.doneCritText0,
    text.doneCritText1,
    text.doneCritText2,
    text.doneCritText3
  ):not(#kmark-mermaid-gantt-bar-text-color-override) {
    fill: #111111 !important;
    color: #111111 !important;
  }

  .markdown-body .kmark-mermaid-block--gantt .kmark-mermaid-rendered svg :is(
    text.taskText,
    text.taskText0,
    text.taskText1,
    text.taskText2,
    text.taskText3,
    text.activeText0,
    text.activeText1,
    text.activeText2,
    text.activeText3,
    text.activeCritText0,
    text.activeCritText1,
    text.activeCritText2,
    text.activeCritText3,
    text.critText0,
    text.critText1,
    text.critText2,
    text.critText3,
    text.doneText0,
    text.doneText1,
    text.doneText2,
    text.doneText3,
    text.doneCritText0,
    text.doneCritText1,
    text.doneCritText2,
    text.doneCritText3
  ) > tspan:not(#kmark-mermaid-gantt-bar-text-color-override) {
    fill: #111111 !important;
    color: #111111 !important;
  }

  .markdown-body .kmark-mermaid-block--gantt .kmark-mermaid-rendered svg :is(rect, path):is(
    .task,
    .task0,
    .task1,
    .task2,
    .task3,
    .active0,
    .active1,
    .active2,
    .active3,
    .activeCrit0,
    .activeCrit1,
    .activeCrit2,
    .activeCrit3,
    .crit0,
    .crit1,
    .crit2,
    .crit3,
    .done0,
    .done1,
    .done2,
    .done3,
    .doneCrit0,
    .doneCrit1,
    .doneCrit2,
    .doneCrit3
  ):not(#kmark-mermaid-gantt-bar-border-color-override) {
    stroke: #111111 !important;
  }

  .markdown-body .kmark-mermaid-block--gantt .kmark-mermaid-rendered svg .grid .tick line,
  .markdown-body .kmark-mermaid-block--gantt .kmark-mermaid-rendered svg .grid path {
    opacity: 1;
  }

  .markdown-body .kmark-mermaid-error {
    border-color: #dc2626;
    background: #fff5f5;
  }

  .markdown-body .kmark-mermaid-error-title {
    margin-bottom: 0.45em;
    color: #991b1b;
    font-weight: 700;
  }

  .markdown-body .kmark-mermaid-error-message {
    margin: 0 0 0.75em;
    white-space: pre-wrap;
  }

  .markdown-body .kmark-mermaid-source {
    margin-top: 0.75em;
  }

  .markdown-body .kmark-mermaid-source pre {
    margin-top: 0.5em;
    margin-bottom: 0;
  }

  .markdown-body dt {
    margin-top: 0.85em;
    font-weight: 700;
    line-height: 1.45;
  }

  .markdown-body dt:first-child {
    margin-top: 0;
  }

  .markdown-body dd {
    margin: 0.25em 0 0 1.5em;
  }

  .markdown-body dd + dt {
    margin-top: 1em;
  }

  .markdown-body dd + dd {
    margin-top: 0.35em;
  }

  .markdown-body dd > :first-child {
    margin-top: 0;
  }

  .markdown-body dd > :last-child {
    margin-bottom: 0;
  }

  .markdown-body .kmark-toc {
    max-width: 100%;
    padding: 0;
    color: #111111;
    box-sizing: border-box;
  }

  .markdown-body .kmark-toc__title {
    margin-bottom: 0.45em;
    font-weight: 750;
    line-height: 1.3;
  }

  .markdown-body .kmark-toc__list {
    margin: 0;
    padding-left: 0;
    list-style: none;
  }

  .markdown-body .kmark-toc__list--nested {
    margin-top: 0;
    padding-left: 0;
  }

  .markdown-body .kmark-toc__item {
    margin: 0;
    line-height: 1.38;
  }

  .markdown-body .kmark-toc__header,
  .markdown-body .kmark-toc__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(2.6em, 4.6em);
    gap: 2.4em;
    align-items: baseline;
    padding: 0.1em 0.35em;
  }

  .markdown-body .kmark-toc__header {
    margin-bottom: 0.2em;
    border-top: 1px solid #dddddd;
    border-bottom: 1px solid #d2d2d2;
    background: rgb(0 0 0 / 4%);
    color: #555555;
    font-size: 0.9em;
    font-weight: 700;
    line-height: 1.35;
  }

  .markdown-body .kmark-toc__row {
    min-height: 1.55em;
  }

  .markdown-body .kmark-toc__row--odd {
    background: rgb(0 0 0 / 3.5%);
  }

  .markdown-body .kmark-toc__row--even {
    background: rgb(0 0 0 / 1.4%);
  }

  .markdown-body .kmark-toc__link,
  .markdown-body .kmark-toc__text {
    min-width: 0;
    padding-left: var(--kmark-toc-row-indent, 0);
    box-sizing: border-box;
    overflow-wrap: anywhere;
  }

  .markdown-body .kmark-toc__header-page,
  .markdown-body .kmark-toc__page {
    justify-self: start;
    white-space: nowrap;
  }

  .markdown-body .kmark-toc__page {
    color: #555555;
    font-variant-numeric: tabular-nums;
  }

  .markdown-body .markdown-task-checkbox {
    display: block;
    width: 1.14em;
    height: 1.14em;
    margin: 0;
    border: 0.16em solid #111111;
    background: #ffffff;
    border-radius: 0;
    box-shadow: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .markdown-body .markdown-task-checkbox svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .markdown-body .markdown-task-checkbox path {
    fill: none;
    stroke: #ffffff;
    stroke-width: 3.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .markdown-body .markdown-task-checkbox[data-checked="true"] {
    background: #111111;
  }

  .markdown-body .markdown-task-checkbox[data-checked="false"] svg {
    visibility: hidden;
  }

  .markdown-body :is(ul, ol):has(> li > .markdown-task-checkbox),
  .markdown-body :is(ul, ol):has(> li > p:first-child > .markdown-task-checkbox) {
    padding-left: 0;
  }

  .markdown-body li:has(> .markdown-task-checkbox),
  .markdown-body li:has(> p:first-child > .markdown-task-checkbox) {
    position: relative;
    padding-left: 2.14em;
    list-style: none;
    min-height: 1.5em;
  }

  .markdown-body li:has(> p:first-child > .markdown-task-checkbox) > p:first-child {
    margin-top: 0;
  }

  .markdown-body li > .markdown-task-checkbox,
  .markdown-body li > p:first-child > .markdown-task-checkbox {
    position: absolute;
    left: 0;
    top: 0.14em;
  }

  .markdown-body blockquote {
    margin-left: 0;
    padding-left: 9pt;
    border-left: 1.5pt solid #d7d7d7;
    color: #555555;
  }

  .markdown-body .kmark-callout {
    --kmark-callout-bg: #f4f8ff;
    --kmark-callout-border-color: #2f5fb3;
    --kmark-callout-title-color: #1f4f9a;
    --kmark-callout-text-color: #111111;
    --kmark-callout-icon-color: var(--kmark-callout-title-color);
    max-width: 100%;
    padding: 0.85em 1em 0.95em;
    border: 0.75pt solid #b9c9e8;
    border-left: 3.5pt solid var(--kmark-callout-border-color);
    border-radius: 5pt;
    background: var(--kmark-callout-bg);
    color: var(--kmark-callout-text-color);
    overflow-wrap: anywhere;
    break-inside: auto;
    page-break-inside: auto;
  }

  .markdown-body .kmark-callout--tip {
    --kmark-callout-bg: #f1fbf8;
    --kmark-callout-border-color: #0f766e;
    --kmark-callout-title-color: #0f766e;
  }

  .markdown-body .kmark-callout--important {
    --kmark-callout-bg: #f7f3ff;
    --kmark-callout-border-color: #6d28d9;
    --kmark-callout-title-color: #5b21b6;
  }

  .markdown-body .kmark-callout--warning {
    --kmark-callout-bg: #fff8eb;
    --kmark-callout-border-color: #b45309;
    --kmark-callout-title-color: #92400e;
  }

  .markdown-body .kmark-callout--caution {
    --kmark-callout-bg: #fff4f4;
    --kmark-callout-border-color: #b91c1c;
    --kmark-callout-title-color: #991b1b;
  }

  .markdown-body .kmark-callout__title {
    display: flex;
    align-items: center;
    gap: 0.55em;
    color: var(--kmark-callout-title-color);
    font-weight: 750;
    line-height: 1.3;
    break-after: avoid;
    page-break-after: avoid;
  }

  .markdown-body .kmark-callout__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 1.18em;
    height: 1.18em;
    border: 0.12em solid var(--kmark-callout-icon-color);
    border-radius: 999px;
    color: var(--kmark-callout-icon-color);
    font-size: 0.92em;
    font-weight: 800;
    line-height: 1;
  }

  .markdown-body .kmark-callout__icon::before {
    content: "i";
  }

  .markdown-body .kmark-callout--tip .kmark-callout__icon::before {
    content: "T";
  }

  .markdown-body .kmark-callout--important .kmark-callout__icon,
  .markdown-body .kmark-callout--warning .kmark-callout__icon,
  .markdown-body .kmark-callout--caution .kmark-callout__icon {
    border-radius: 2pt;
  }

  .markdown-body .kmark-callout--important .kmark-callout__icon::before,
  .markdown-body .kmark-callout--warning .kmark-callout__icon::before,
  .markdown-body .kmark-callout--caution .kmark-callout__icon::before {
    content: "!";
  }

  .markdown-body .kmark-callout__body {
    min-width: 0;
    margin-top: 0.55em;
  }

  .markdown-body .kmark-callout__body > :first-child {
    margin-top: 0;
  }

  .markdown-body .kmark-callout__body > :last-child {
    margin-bottom: 0;
  }

  .markdown-body .kmark-callout__body :is(pre, table) {
    max-width: 100%;
  }

  .markdown-body .kmark-page-valign {
    box-sizing: border-box;
    max-width: 100%;
  }

  .markdown-body .kmark-page-flex-spacer {
    display: block;
    flex: 0 0 auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    pointer-events: none;
    user-select: none;
  }

  .markdown-body:not(.markdown-body--a4) .kmark-page-flex-spacer {
    display: none;
  }

  .kmark-page-header,
  .kmark-page-footer {
    position: absolute;
    left: var(--kmark-page-margin-left, ${A4_MARGIN_LEFT_MM}mm);
    right: var(--kmark-page-margin-right, ${A4_MARGIN_RIGHT_MM}mm);
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
    align-items: center;
    gap: 4mm;
    color: #111111;
    font-family: var(--kmark-font-family, inherit);
    font-size: var(--kmark-page-chrome-font-size, 10pt);
    line-height: 1.2;
    pointer-events: none;
    user-select: none;
  }

  .kmark-page-header {
    top: var(--kmark-page-header-margin-top, calc(var(--kmark-page-margin-top, ${A4_MARGIN_TOP_MM}mm) - 1.2em));
  }

  .kmark-page-footer {
    bottom: var(--kmark-page-footer-margin-bottom, calc(var(--kmark-page-margin-bottom, ${A4_MARGIN_BOTTOM_MM}mm) - 1.2em));
  }

  .kmark-page-header__left,
  .kmark-page-header__center,
  .kmark-page-header__right,
  .kmark-page-footer__left,
  .kmark-page-footer__center,
  .kmark-page-footer__right {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kmark-page-header__left,
  .kmark-page-footer__left {
    text-align: left;
  }

  .kmark-page-header__center,
  .kmark-page-footer__center {
    text-align: center;
  }

  .kmark-page-header__right,
  .kmark-page-footer__right {
    text-align: right;
  }

  .kmark-page-header__text,
  .kmark-page-footer__text {
    box-sizing: border-box;
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: top;
    white-space: nowrap;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .kmark-page-number {
    position: absolute;
    z-index: 1;
    --kmark-page-number-content-top: var(--kmark-page-margin-top, ${A4_MARGIN_TOP_MM}mm);
    --kmark-page-number-content-right: var(--kmark-page-margin-right, ${A4_MARGIN_RIGHT_MM}mm);
    --kmark-page-number-content-bottom: var(--kmark-page-margin-bottom, ${A4_MARGIN_BOTTOM_MM}mm);
    --kmark-page-number-content-left: var(--kmark-page-margin-left, ${A4_MARGIN_LEFT_MM}mm);
    --kmark-page-number-top-row-bottom: calc(100% - var(--kmark-page-number-content-top));
    --kmark-page-number-bottom-row-top: calc(100% - var(--kmark-page-number-content-bottom));
    color: var(--kmark-page-number-color, #666);
    font-size: var(--kmark-page-number-font-size, 10pt);
    line-height: 1;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
  }

  .kmark-page-number--bottom-center {
    left: 50%;
    top: var(--kmark-page-number-bottom-row-top);
    transform: translateX(-50%);
  }

  .kmark-page-number--bottom-right {
    top: var(--kmark-page-number-bottom-row-top);
    right: var(--kmark-page-number-content-right);
  }

  .kmark-page-number--bottom-left {
    top: var(--kmark-page-number-bottom-row-top);
    left: var(--kmark-page-number-content-left);
  }

  .kmark-page-number--top-center {
    left: 50%;
    bottom: var(--kmark-page-number-top-row-bottom);
    transform: translateX(-50%);
  }

  .kmark-page-number--top-right {
    right: var(--kmark-page-number-content-right);
    bottom: var(--kmark-page-number-top-row-bottom);
  }

  .kmark-page-number--top-left {
    left: var(--kmark-page-number-content-left);
    bottom: var(--kmark-page-number-top-row-bottom);
  }

  .markdown-body code {
    padding: 0.08em 0.3em;
    font-family: "Iosevka Term", "Cascadia Code", Consolas, monospace;
    font-size: 0.92em;
    background: #f3f3f3;
    color: #111111;
    border-radius: 2pt;
  }

  .markdown-body pre {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: visible;
    padding: 9pt;
    border: 0.75pt solid #d0d0d0;
    border-left: 3pt solid #8a8a8a;
    background: #f5f5f5;
    color: #111111;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .markdown-body pre code {
    display: block;
    width: auto;
    min-width: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    white-space: inherit;
    overflow-wrap: inherit;
    word-break: inherit;
  }

  .markdown-body table {
    --kmark-table-cell-padding-x: 0.75em;
    --kmark-table-cell-padding-y: 0.65em;
    --preview-table-cell-padding-x: var(--kmark-table-cell-padding-x);
    --preview-table-cell-padding-y: var(--kmark-table-cell-padding-y);
    --preview-table-font-scale: 1;
    width: 100%;
    border-collapse: collapse;
    font-size: calc(1em * var(--preview-table-font-scale));
  }

  .markdown-body th,
  .markdown-body td {
    padding: var(--preview-table-cell-padding-y) var(--preview-table-cell-padding-x);
    border: 0.75pt solid #d7d7d7;
    text-align: left;
  }

  .markdown-body th {
    background: #f5f5f5;
  }
`;

const PRINT_DOCUMENT_PREVIEW_DERIVED_OVERRIDE_STYLE = `
  html,
  body {
    height: auto !important;
    min-height: 0 !important;
    margin: 0;
    padding: 0;
    overflow: visible !important;
    background: var(--preview-surface, #ffffff);
    color: var(--preview-text, #111111);
    touch-action: auto;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: var(--app-font-family, "Aptos", "Segoe UI Variable", "Segoe UI", sans-serif);
    line-height: 1.5;
  }

  .markdown-body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .kmark-page-header__text,
  .kmark-page-footer__text {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
`;

function getDocumentStyleSheetText(styleSheet: CSSStyleSheet): string {
  if (styleSheet.disabled) {
    return "";
  }

  try {
    return Array.from(styleSheet.cssRules)
      .map((rule) => rule.cssText)
      .join("\n");
  } catch {
    return "";
  }
}

function getPreviewSourceStyleText(): string {
  if (typeof document === "undefined") {
    return "";
  }

  return Array.from(document.styleSheets)
    .map((styleSheet) => getDocumentStyleSheetText(styleSheet))
    .filter((styleText) => styleText.trim().length > 0)
    .join("\n\n");
}

function createPreviewDerivedPrintDocumentStyle(): string {
  const previewSourceStyleText = getPreviewSourceStyleText();
  const sourceStyleText = previewSourceStyleText.trim().length > 0
    ? previewSourceStyleText
    : PRINT_DOCUMENT_FALLBACK_STYLE;

  return `${sourceStyleText}\n${PRINT_DOCUMENT_PREVIEW_DERIVED_OVERRIDE_STYLE}`;
}

function createStandardPrintDocumentStyle(): string {
  return `
  @page {
    margin: 12mm;
  }

  ${createPreviewDerivedPrintDocumentStyle()}
`;
}

function createA4PrintDocumentBaseStyle(): string {
  return `
  @page {
    margin: 0;
  }

  ${createPreviewDerivedPrintDocumentStyle()}

  #${KMARK_PRINT_ROOT_ID} {
    display: block;
    position: static;
    width: auto;
    height: auto;
    min-height: 0;
    overflow: visible;
    background: var(--preview-surface, #ffffff);
  }

  #${KMARK_PRINT_ROOT_ID} * {
    box-sizing: border-box;
  }

  #${KMARK_PRINT_ROOT_ID} .preview-section__page-frame {
    display: block;
    position: relative;
    width: var(--kmark-page-width, ${A4_PAGE_WIDTH_MM}mm);
    height: var(--kmark-page-height, ${A4_PAGE_HEIGHT_MM}mm);
    margin: 0;
    padding:
      var(--kmark-page-margin-top, ${A4_MARGIN_TOP_MM}mm)
      var(--kmark-page-margin-right, ${A4_MARGIN_RIGHT_MM}mm)
      var(--kmark-page-margin-bottom, ${A4_MARGIN_BOTTOM_MM}mm)
      var(--kmark-page-margin-left, ${A4_MARGIN_LEFT_MM}mm);
    box-sizing: border-box;
    overflow: hidden;
    background: var(--preview-surface, #ffffff);
    border: 0;
    box-shadow: none;
    transform: none;
    zoom: 1;
    break-after: page;
    break-inside: avoid-page;
    page-break-after: always;
    page-break-inside: avoid;
  }

  #${KMARK_PRINT_ROOT_ID} .preview-section__page-frame:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 {
    min-height: 100%;
    padding: 0;
    font-size: var(--kmark-font-size, 10.5pt);
    overflow: hidden;
    orphans: 3;
    widows: 3;
  }

  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h1,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h2,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h3,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h4,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h5,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 h6 {
    page-break-after: avoid;
  }

  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 blockquote,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 .kmark-callout__title,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 figure,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 pre,
  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 tr {
    page-break-inside: avoid;
  }

  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 table {
    page-break-inside: auto;
  }

  #${KMARK_PRINT_ROOT_ID} .markdown-body--a4 thead {
    page-break-inside: avoid;
  }

  @media print {
    html,
    body,
    #${KMARK_PRINT_ROOT_ID} {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }
  }
`;
}

function createA4PrintDocumentStyle(pages: readonly A4PrintPreviewPage[]): string {
  const namedPageRules = pages
    .map((page) => `
      @page ${page.pageName} {
        size: ${page.pageWidth} ${page.pageHeight};
        margin: 0;
      }

      #${KMARK_PRINT_ROOT_ID} .kmark-print-page[data-kmark-print-page="${page.pageName}"] {
        page: ${page.pageName};
      }
    `)
    .join("");

  return `${createA4PrintDocumentBaseStyle()}\n${namedPageRules}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function createOptionalHtmlAttribute(name: string, value: string | null): string {
  const normalizedValue = value?.trim() ?? "";

  return normalizedValue.length > 0 ? ` ${name}="${escapeHtml(normalizedValue)}"` : "";
}

function createCurrentDocumentRootAttributes(): string {
  const root = document.documentElement;
  const copiedAttributes = PRINT_DOCUMENT_ROOT_ATTRIBUTE_NAMES
    .map((attributeName) => createOptionalHtmlAttribute(attributeName, root.getAttribute(attributeName)))
    .join("");

  return `lang="ja"${copiedAttributes}${createOptionalHtmlAttribute("style", root.getAttribute("style"))}`;
}

function createOptionalStyleAttribute(style: string): string {
  return createOptionalHtmlAttribute("style", style);
}

function getElementCustomPropertyStyle(element: HTMLElement): string {
  const declarations: string[] = [];

  for (let index = 0; index < element.style.length; index += 1) {
    const propertyName = element.style.item(index);

    if (!propertyName.startsWith("--")) {
      continue;
    }

    const propertyValue = element.style.getPropertyValue(propertyName).trim();

    if (propertyValue.length === 0) {
      continue;
    }

    declarations.push(`${propertyName}: ${propertyValue};`);
  }

  return declarations.join(" ");
}

function isVisiblePreviewElement(element: HTMLElement): boolean {
  if (!element.isConnected || element.getClientRects().length === 0) {
    return false;
  }

  const style = window.getComputedStyle(element);

  return style.display !== "none" && style.visibility !== "hidden";
}

function getDisplayedPreviewA4PageFrameElements(): readonly HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".preview-section__page-frame"))
    .filter((pageFrame) => !pageFrame.classList.contains("kmark-print-page"))
    .filter((pageFrame) => pageFrame.closest(`#${KMARK_PRINT_ROOT_ID}`) === null)
    .filter(isVisiblePreviewElement);
}

function getPageFrameCssLength(pageFrame: HTMLElement, propertyName: string, fallback: string): string {
  const inlineValue = pageFrame.style.getPropertyValue(propertyName).trim();

  if (inlineValue.length > 0) {
    return inlineValue;
  }

  const computedValue = window.getComputedStyle(pageFrame).getPropertyValue(propertyName).trim();

  return computedValue.length > 0 ? computedValue : fallback;
}

function getDirectPageChromeHtml(pageFrame: HTMLElement): string {
  return Array.from(pageFrame.children)
    .filter((child): child is HTMLElement => (
      child instanceof HTMLElement
      && (child.classList.contains("kmark-page-header") || child.classList.contains("kmark-page-footer"))
    ))
    .map((child) => child.outerHTML)
    .join("");
}

function getDisplayedPreviewA4Pages(): readonly A4PrintPreviewPage[] {
  return getDisplayedPreviewA4PageFrameElements()
    .map((pageFrame, index) => ({
      frameStyle: pageFrame.getAttribute("style") ?? "",
      html: pageFrame.querySelector<HTMLElement>(".markdown-body--a4")?.innerHTML ?? pageFrame.innerHTML,
      pageChromeHtml: getDirectPageChromeHtml(pageFrame),
      pageNumberHtml: pageFrame.querySelector<HTMLElement>(".kmark-page-number")?.outerHTML ?? "",
      pageName: `kmark-print-page-${index + 1}`,
      pageHeight: getPageFrameCssLength(pageFrame, "--kmark-page-height", `${A4_PAGE_HEIGHT_MM}mm`),
      pageWidth: getPageFrameCssLength(pageFrame, "--kmark-page-width", `${A4_PAGE_WIDTH_MM}mm`),
    }))
    .filter((page) => page.html.trim().length > 0);
}

function getDisplayedStandardPreviewContent(
  options: StandardPrintMarkdownDocumentOptions,
): StandardPrintPreviewContent {
  const previewContent = document.querySelector<HTMLElement>(".preview-section__standard-content.markdown-body");

  if (
    previewContent === null
    || previewContent.closest(`#${KMARK_PRINT_ROOT_ID}`) !== null
    || !isVisiblePreviewElement(previewContent)
  ) {
    return {
      html: options.html,
      style: "",
    };
  }

  return {
    html: previewContent.innerHTML,
    style: getElementCustomPropertyStyle(previewContent),
  };
}

function createA4PrintDocumentMarkup(options: A4PrintMarkdownDocumentOptions, pages: readonly A4PrintPreviewPage[]): string {
  const pageMarkup = pages
    .map((page) => `
      <div class="preview-section__page-frame kmark-print-page" data-kmark-print-page="${page.pageName}" style="${escapeHtml(page.frameStyle)}">
        ${page.pageChromeHtml}
        <main class="preview-section__page kmark-page-body markdown-body markdown-body--a4 print-page">${page.html}</main>
        ${page.pageNumberHtml}
      </div>
    `)
    .join("");

  return `<!doctype html>
<html ${createCurrentDocumentRootAttributes()}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>${createA4PrintDocumentStyle(pages)}</style>
  </head>
  <body>
    <div id="${KMARK_PRINT_ROOT_ID}">
      ${pageMarkup}
    </div>
  </body>
</html>`;
}

function printA4MarkdownDocument(
  options: A4PrintMarkdownDocumentOptions,
  runtimeOptions: PrintMarkdownDocumentRuntimeOptions,
): Promise<void> {
  const pages = getDisplayedPreviewA4Pages();

  if (pages.length === 0) {
    return Promise.reject(new Error("表示中のA4プレビューページがありません。"));
  }

  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.position = "fixed";
    iframe.style.left = "0";
    iframe.style.top = "0";
    iframe.style.width = "100vw";
    iframe.style.height = "100vh";
    iframe.style.border = "0";
    iframe.style.zIndex = "-1";
    iframe.style.opacity = "1";
    iframe.style.pointerEvents = "none";

    let isSettled = false;
    let loadTimeoutId: number | null = null;
    let fallbackTimeoutId: number | null = null;
    let printWindowCleanup: (() => void) | null = null;

    const cleanup = () => {
      if (loadTimeoutId !== null) {
        window.clearTimeout(loadTimeoutId);
      }

      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId);
      }

      printWindowCleanup?.();
      printWindowCleanup = null;
      iframe.onload = null;
      iframe.onerror = null;
      iframe.remove();
    };

    const finish = (callback: () => void) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      cleanup();
      callback();
    };

    iframe.onerror = () => {
      finish(() => reject(new Error("A4印刷画面の生成に失敗しました。")));
    };

    iframe.onload = () => {
      const printWindow = iframe.contentWindow;

      if (printWindow === null) {
        finish(() => reject(new Error("A4印刷画面を開けませんでした。")));
        return;
      }

      if (loadTimeoutId !== null) {
        window.clearTimeout(loadTimeoutId);
        loadTimeoutId = null;
      }

      const prepareAndPrint = async () => {
        try {
          printWindowCleanup = await runtimeOptions.preparePrintWindow?.(printWindow) ?? null;
        } catch (error) {
          finish(() => reject(error instanceof Error ? error : new Error("A4印刷画面の準備に失敗しました。")));
          return;
        }

        const finalizeSuccess = () => {
          printWindow.removeEventListener("afterprint", finalizeSuccess);
          finish(resolve);
        };

        printWindow.addEventListener("afterprint", finalizeSuccess, { once: true });
        fallbackTimeoutId = window.setTimeout(finalizeSuccess, A4_PRINT_DIALOG_FALLBACK_TIMEOUT_MS);

        try {
          printWindow.focus();
          printWindow.print();
        } catch (error) {
          printWindow.removeEventListener("afterprint", finalizeSuccess);
          finish(() => reject(error instanceof Error ? error : new Error("印刷に失敗しました。")));
        }
      };

      void prepareAndPrint();
    };

    loadTimeoutId = window.setTimeout(() => {
      finish(() => reject(new Error("A4印刷画面の準備に時間がかかりすぎています。")));
    }, PRINT_DOCUMENT_LOAD_TIMEOUT_MS);

    iframe.srcdoc = createA4PrintDocumentMarkup(options, pages);
    document.body.append(iframe);
  });
}

function createPrintDocumentMarkup(options: StandardPrintMarkdownDocumentOptions): string {
  const previewContent = getDisplayedStandardPreviewContent(options);
  const bodyMarkup = `<article class="preview-section__standard-content markdown-body"${createOptionalStyleAttribute(previewContent.style)}>${previewContent.html}</article>`;

  return `<!doctype html>
<html ${createCurrentDocumentRootAttributes()}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>${createStandardPrintDocumentStyle()}</style>
  </head>
  <body>
    ${bodyMarkup}
  </body>
</html>`;
}

export function printMarkdownDocument(
  options: PrintMarkdownDocumentOptions,
  runtimeOptions: PrintMarkdownDocumentRuntimeOptions = {},
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("この環境では印刷できません。"));
  }

  if (options.displayMode === "a4") {
    return printA4MarkdownDocument(options, runtimeOptions);
  }

  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.position = "fixed";
    iframe.style.left = "0";
    iframe.style.top = "0";
    iframe.style.width = "100vw";
    iframe.style.height = "100vh";
    iframe.style.border = "0";
    iframe.style.zIndex = "-1";
    iframe.style.opacity = "1";
    iframe.style.pointerEvents = "none";

    let isSettled = false;
    let loadTimeoutId: number | null = null;
    let fallbackTimeoutId: number | null = null;
    let printWindowCleanup: (() => void) | null = null;

    const cleanup = () => {
      if (loadTimeoutId !== null) {
        window.clearTimeout(loadTimeoutId);
      }

      if (fallbackTimeoutId !== null) {
        window.clearTimeout(fallbackTimeoutId);
      }

      printWindowCleanup?.();
      printWindowCleanup = null;
      iframe.onload = null;
      iframe.onerror = null;
      iframe.remove();
    };

    const finish = (callback: () => void) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      cleanup();
      callback();
    };

    iframe.onerror = () => {
      finish(() => reject(new Error("印刷画面の生成に失敗しました。")));
    };

    iframe.onload = () => {
      const printWindow = iframe.contentWindow;

      if (printWindow === null) {
        finish(() => reject(new Error("印刷画面を開けませんでした。")));
        return;
      }

      if (loadTimeoutId !== null) {
        window.clearTimeout(loadTimeoutId);
        loadTimeoutId = null;
      }

      const prepareAndPrint = async () => {
        try {
          printWindowCleanup = await runtimeOptions.preparePrintWindow?.(printWindow) ?? null;
        } catch (error) {
          finish(() => reject(error instanceof Error ? error : new Error("印刷画面の準備に失敗しました。")));
          return;
        }

        const finalizeSuccess = () => {
          finish(resolve);
        };

        printWindow.addEventListener("afterprint", finalizeSuccess, { once: true });
        fallbackTimeoutId = window.setTimeout(finalizeSuccess, PRINT_DIALOG_FALLBACK_TIMEOUT_MS);

        try {
          printWindow.focus();
          printWindow.print();
        } catch (error) {
          printWindow.removeEventListener("afterprint", finalizeSuccess);
          finish(() => reject(error instanceof Error ? error : new Error("印刷に失敗しました。")));
        }
      };

      void prepareAndPrint();
    };

    loadTimeoutId = window.setTimeout(() => {
      finish(() => reject(new Error("印刷画面の準備に時間がかかりすぎています。")));
    }, PRINT_DOCUMENT_LOAD_TIMEOUT_MS);

    iframe.srcdoc = createPrintDocumentMarkup(options);
    document.body.append(iframe);
  });
}
