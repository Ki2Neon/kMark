import { ensureMarkdownExtension } from "../domain/editor";

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

export async function readMarkdownFile(file: File): Promise<{ fileName: string; content: string }> {
  return {
    fileName: file.name,
    content: await file.text(),
  };
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