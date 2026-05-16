import { normalizeMarkdownFileName } from "../adapters/browser/browserRustCore";
import { type ExternalMarkdownDocument } from "../domain/externalMarkdownDocument";
import { isTauri } from "../runtime/runtime";
import { invokeTauriCommand, listenTauriEvent } from "./tauriCommand";

type MarkdownPickerType = {
  readonly description: string;
  readonly accept: Record<string, readonly string[]>;
};

type MarkdownWritableStream = {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
};

export type MarkdownFileHandle = {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<MarkdownWritableStream>;
};

type PickerWindow = Window & typeof globalThis & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: readonly MarkdownPickerType[];
  }) => Promise<MarkdownFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    excludeAcceptAllOption?: boolean;
    types?: readonly MarkdownPickerType[];
  }) => Promise<MarkdownFileHandle>;
};

const MARKDOWN_PICKER_TYPES: readonly MarkdownPickerType[] = [
  {
    description: "Markdown",
    accept: {
      "text/markdown": [".md", ".markdown", ".mdown", ".mkd"],
      "text/plain": [".txt"],
    },
  },
];

const MARKDOWN_OPEN_REQUESTED_EVENT = "markdown-open-requested";
const OPEN_MARKDOWN_DOCUMENT_DIALOG_COMMAND = "open_markdown_document_dialog";
const OPEN_MARKDOWN_DOCUMENT_FOLDER_COMMAND = "open_markdown_document_folder";
const READ_MARKDOWN_DOCUMENT_AT_PATH_COMMAND = "read_markdown_document_at_path";
const SAVE_MARKDOWN_DOCUMENT_AS_DIALOG_COMMAND = "save_markdown_document_as_dialog";

type TauriMarkdownDocumentPayload = {
  readonly fileName: string;
  readonly filePath: string;
  readonly content: string;
};

type TauriSavedMarkdownDocumentPayload = {
  readonly fileName: string;
  readonly filePath: string;
};

function getPickerWindow(): PickerWindow {
  return window as PickerWindow;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function supportsNativeOpenPicker(): boolean {
  return isTauri() || typeof getPickerWindow().showOpenFilePicker === "function";
}

export async function pickMarkdownDocument(): Promise<{
  fileName: string;
  filePath: string | null;
  content: string;
  fileHandle: MarkdownFileHandle | null;
} | null> {
  if (isTauri()) {
    return invokeTauriCommand<TauriMarkdownDocumentPayload | null>(
      OPEN_MARKDOWN_DOCUMENT_DIALOG_COMMAND,
      {},
      "Markdown ファイルを開けませんでした。",
    ).then((result) => result === null
      ? null
      : {
          fileName: result.fileName,
          filePath: result.filePath,
          content: result.content,
          fileHandle: null,
        });
  }

  const pickerWindow = getPickerWindow();

  if (typeof pickerWindow.showOpenFilePicker !== "function") {
    return null;
  }

  try {
    const [fileHandle] = await pickerWindow.showOpenFilePicker({
      multiple: false,
      types: MARKDOWN_PICKER_TYPES,
    });

    if (fileHandle === undefined) {
      return null;
    }

    const file = await fileHandle.getFile();
    const result = await readMarkdownFile(file);

    return {
      ...result,
      filePath: null,
      fileHandle,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }

    throw error;
  }
}

export async function overwriteMarkdownDocument(fileHandle: MarkdownFileHandle, content: string): Promise<void> {
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function overwriteMarkdownDocumentAtPath(filePath: string, content: string): Promise<void> {
  if (!isTauri()) {
    throw new Error("Tauri 環境でのみ利用できます。");
  }

  await invokeTauriCommand<void>(
    "write_markdown_document",
    {
      path: filePath,
      content,
    },
    "Markdown ファイルの保存に失敗しました。",
  );
}

export async function readMarkdownDocumentAtPath(filePath: string): Promise<{
  fileName: string;
  filePath: string;
  content: string;
}> {
  if (!isTauri()) {
    throw new Error("Tauri 環境でのみ利用できます。");
  }

  return invokeTauriCommand<TauriMarkdownDocumentPayload>(
    READ_MARKDOWN_DOCUMENT_AT_PATH_COMMAND,
    { path: filePath },
    "Markdown ファイルを開けませんでした。",
  );
}

export async function openMarkdownDocumentFolder(filePath: string): Promise<void> {
  if (!isTauri()) {
    throw new Error("この環境ではMarkdownファイルのフォルダーを開けません。");
  }

  await invokeTauriCommand<void>(
    OPEN_MARKDOWN_DOCUMENT_FOLDER_COMMAND,
    { path: filePath },
    "Markdown ファイルのフォルダーを開けませんでした。",
  );
}

export async function readMarkdownFile(file: File): Promise<{ fileName: string; content: string }> {
  return {
    fileName: file.name,
    content: await file.text(),
  };
}

export async function takePendingTauriMarkdownOpenRequests(): Promise<readonly ExternalMarkdownDocument[]> {
  if (!isTauri()) {
    return [];
  }

  return invokeTauriCommand<ExternalMarkdownDocument[]>(
    "take_pending_markdown_open_requests",
    {},
    "起動時 Markdown 要求の取得に失敗しました。",
  );
}

export async function clearPendingTauriMarkdownOpenRequests(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invokeTauriCommand<void>(
    "clear_pending_markdown_open_requests",
    {},
    "起動時 Markdown 要求の消去に失敗しました。",
  );
}

export async function listenForTauriMarkdownOpenRequests(callback: () => void): Promise<() => void> {
  if (!isTauri()) {
    return () => {};
  }

  return listenTauriEvent<unknown>(MARKDOWN_OPEN_REQUESTED_EVENT, () => {
    callback();
  });
}

export function downloadMarkdownDocument(fileName: string, content: string): void {
  const anchor = document.createElement("a");
  const objectUrl = window.URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
  );

  anchor.href = objectUrl;
  anchor.download = normalizeMarkdownFileName(fileName);
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.append(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
}

export async function saveMarkdownDocumentAs(fileName: string, content: string): Promise<{
  fileName: string;
  filePath: string | null;
  fileHandle: MarkdownFileHandle | null;
} | null> {
  const normalizedFileName = normalizeMarkdownFileName(fileName);

  if (isTauri()) {
    return invokeTauriCommand<TauriSavedMarkdownDocumentPayload | null>(
      SAVE_MARKDOWN_DOCUMENT_AS_DIALOG_COMMAND,
      {
        fileName: normalizedFileName,
        content,
      },
      "Markdown ファイルの保存に失敗しました。",
    ).then((result) => result === null
      ? null
      : {
          fileName: result.fileName,
          filePath: result.filePath,
          fileHandle: null,
        });
  }

  const pickerWindow = getPickerWindow();

  if (typeof pickerWindow.showSaveFilePicker === "function") {
    try {
      const fileHandle = await pickerWindow.showSaveFilePicker({
        suggestedName: normalizedFileName,
        types: MARKDOWN_PICKER_TYPES,
      });

      await overwriteMarkdownDocument(fileHandle, content);

      return {
        fileName: normalizeMarkdownFileName(fileHandle.name),
        filePath: null,
        fileHandle,
      };
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }

      throw error;
    }
  }

  const promptedFileName = window.prompt("保存するファイル名", normalizedFileName);

  if (promptedFileName === null) {
    return null;
  }

  const nextFileName = normalizeMarkdownFileName(promptedFileName);
  downloadMarkdownDocument(nextFileName, content);

  return {
    fileName: nextFileName,
    filePath: null,
    fileHandle: null,
  };
}
