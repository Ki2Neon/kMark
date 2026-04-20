import { ensureMarkdownExtension } from "../domain/editor";

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