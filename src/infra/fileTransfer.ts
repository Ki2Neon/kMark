import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type ExternalMarkdownDocument } from "../domain/externalMarkdownDocument";
import { ensureMarkdownExtension } from "../domain/editor";
import { invokeTauriCommand } from "./tauriCommand";

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

function getPickerWindow(): PickerWindow {
  return window as PickerWindow;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function supportsNativeOpenPicker(): boolean {
  return typeof getPickerWindow().showOpenFilePicker === "function";
}

export async function pickMarkdownDocument(): Promise<{
  fileName: string;
  content: string;
  fileHandle: MarkdownFileHandle | null;
} | null> {
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

  return listen(MARKDOWN_OPEN_REQUESTED_EVENT, () => {
    callback();
  });
}

export function downloadMarkdownDocument(fileName: string, content: string): void {
  const anchor = document.createElement("a");
  const objectUrl = window.URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
  );

  anchor.href = objectUrl;
  anchor.download = ensureMarkdownExtension(fileName);
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.append(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
}

export async function saveMarkdownDocumentAs(fileName: string, content: string): Promise<{
  fileName: string;
  fileHandle: MarkdownFileHandle | null;
} | null> {
  const normalizedFileName = ensureMarkdownExtension(fileName);
  const pickerWindow = getPickerWindow();

  if (typeof pickerWindow.showSaveFilePicker === "function") {
    try {
      const fileHandle = await pickerWindow.showSaveFilePicker({
        suggestedName: normalizedFileName,
        types: MARKDOWN_PICKER_TYPES,
      });

      await overwriteMarkdownDocument(fileHandle, content);

      return {
        fileName: ensureMarkdownExtension(fileHandle.name),
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

  const nextFileName = ensureMarkdownExtension(promptedFileName);
  downloadMarkdownDocument(nextFileName, content);

  return {
    fileName: nextFileName,
    fileHandle: null,
  };
}
