export type KmarkParamType =
  | "enum"
  | "number"
  | "length"
  | "color"
  | "boolean"
  | "string"
  | "identifier";

export type KmarkParamContext =
  | "single"
  | "scope"
  | "page"
  | "image"
  | "video"
  | "text"
  | "shape"
  | "table"
  | "toc";

export type KmarkParamSpec = {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly type: KmarkParamType;
  readonly contexts: readonly KmarkParamContext[];
  readonly values?: readonly string[];
  readonly defaultValue?: string;
  readonly insertText?: string;
  readonly description: string;
  readonly examples?: readonly string[];
  readonly allowMultiple?: boolean;
  readonly deprecated?: boolean;
  readonly priority?: number;
};

export type KmarkSnippetSpec = {
  readonly label: string;
  readonly description: string;
  readonly contexts: readonly KmarkParamContext[];
  readonly insertText: string;
  readonly filterText?: string;
  readonly priority?: number;
  readonly examples?: readonly string[];
};

export type KmarkCompletionMode =
  | "directive-start"
  | "parameter-name"
  | "parameter-value"
  | "snippet"
  | "scope-open"
  | "scope-close"
  | "page-preset"
  | "style-define"
  | "style-use"
  | "unknown";

export type KmarkReplaceRange = {
  readonly start: number;
  readonly end: number;
};

export type KmarkCompletionContext = {
  readonly active: boolean;
  readonly mode: KmarkCompletionMode;
  readonly lineText: string;
  readonly cursorInLine: number;
  readonly directiveText: string;
  readonly currentParamName?: string;
  readonly currentValuePrefix?: string;
  readonly paramPrefix?: string;
  readonly contexts: readonly KmarkParamContext[];
  readonly replaceRange: KmarkReplaceRange;
  readonly usedParamNames: ReadonlySet<string>;
  readonly suffixAfterCursor: string;
};

export type KmarkCompletionItemKind = "parameter" | "value" | "snippet" | "style" | "path";
export type KmarkPathCompletionEntryKind = "directory" | "file";

export type KmarkPathCompletionEntry = {
  readonly label: string;
  readonly insertText: string;
  readonly relativePath: string;
  readonly entryKind: KmarkPathCompletionEntryKind;
};

export type KmarkCompletionSection =
  | "image"
  | "video"
  | "page"
  | "scope"
  | "table"
  | "text"
  | "style"
  | "toc"
  | "snippet"
  | "general";

export type KmarkCompletionItem = {
  readonly label: string;
  readonly insertText: string;
  readonly description: string;
  readonly detail?: string;
  readonly kind: KmarkCompletionItemKind;
  readonly pathEntryKind?: KmarkPathCompletionEntryKind;
  readonly section?: KmarkCompletionSection;
  readonly snippet?: boolean;
  readonly priority?: number;
  readonly sortText?: string;
};

export type KmarkCompletionResult = {
  readonly context: KmarkCompletionContext;
  readonly items: readonly KmarkCompletionItem[];
};

export type KmarkValidationWarning = {
  readonly message: string;
  readonly range: KmarkReplaceRange;
};
