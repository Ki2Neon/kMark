import { createElement, StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import "../../../src/App.css";
import { type EditorTransaction } from "../../../src/application/editorSession/editorDocumentPort";
import { DesktopMarkdownInput, type MarkdownEditorHandle } from "../../../src/ui/components/DesktopMarkdownInput";
import { initializeKmarkWeb } from "../../../src/wasm/kmarkWeb";
import App from "../../../src/App";

function press(target: Element, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    key: shiftKey ? key.toUpperCase() : key,
    keyCode: key.toUpperCase().charCodeAt(0),
    shiftKey,
  });
  target.dispatchEvent(event);
  return event;
}

function enterText(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: text.slice(-1) || "a" }));
}

test("Edit search and replace shortcuts use CodeMirror's panel and mutation path", async () => {
  await initializeKmarkWeb();
  const host = document.createElement("div");
  host.style.height = "360px";
  document.body.append(host);
  const root = createRoot(host);
  const handle: { current: MarkdownEditorHandle | null } = { current: null };
  const transactions: EditorTransaction[] = [];

  try {
    flushSync(() => root.render(createElement(DesktopMarkdownInput, {
      appThemeId: "vscode-dark",
      document: { key: "search-test", content: "alpha beta alpha" },
      editFontId: "Iosevka Term",
      lineWrappingEnabled: true,
      multiCursorModifier: "alt",
      showLineNumbers: true,
      onEditorHandleChange: (nextHandle) => { handle.current = nextHandle; },
      onTransaction: (transaction) => { transactions.push(transaction); },
    })));

    const editor = host.querySelector<HTMLElement>(".cm-content");
    expect(editor).not.toBeNull();
    editor!.focus();

    expect(press(editor!, "f", true).defaultPrevented).toBe(true);
    const initialFindField = host.querySelector<HTMLInputElement>(".cm-search input[name=search]");
    expect(document.activeElement).toBe(initialFindField);
    expect(host.querySelector(".cm-search input[name=replace]")).not.toBeNull();
    initialFindField!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    editor!.focus();

    const findShortcut = press(editor!, "f");
    expect(findShortcut.defaultPrevented).toBe(true);
    const findField = host.querySelector<HTMLInputElement>(".cm-search input[name=search]");
    expect(findField).not.toBeNull();
    expect(document.activeElement).toBe(findField);

    enterText(findField!, "alpha");
    await vi.waitFor(() => expect(host.querySelectorAll(".cm-searchMatch").length).toBeGreaterThan(0));

    findField!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    expect(host.querySelector(".cm-search")).toBeNull();
    editor!.focus();
    const replaceShortcut = press(editor!, "f", true);
    expect(replaceShortcut.defaultPrevented).toBe(true);
    const replaceField = host.querySelector<HTMLInputElement>(".cm-search input[name=replace]");
    expect(document.activeElement).toBe(replaceField);
    enterText(replaceField!, "gamma");
    host.querySelector<HTMLButtonElement>(".cm-search button[name=replaceAll]")!.click();

    expect(handle.current?.getSnapshot()).toBe("gamma beta gamma");
    expect(transactions).toEqual([{
      beforeLengthUtf16: 16,
      changes: [
        { fromUtf16: 0, toUtf16: 5, insert: "gamma" },
        { fromUtf16: 11, toUtf16: 16, insert: "gamma" },
      ],
    }]);
    replaceField!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    expect(host.querySelector(".cm-search")).toBeNull();
    editor!.focus();
    expect(press(editor!, "z").defaultPrevented).toBe(true);
    expect(handle.current?.getSnapshot()).toBe("alpha beta alpha");
  } finally {
    flushSync(() => root.unmount());
    host.remove();
  }
});

test("the full app opens Edit search and replace with or without editor focus", async () => {
  await initializeKmarkWeb();
  const host = document.createElement("div");
  host.id = "root";
  document.body.append(host);
  const root = createRoot(host);

  try {
    flushSync(() => root.render(createElement(StrictMode, null, createElement(App))));
    await vi.waitFor(() => expect(host.querySelector(".cm-content")).not.toBeNull());
    const editor = host.querySelector<HTMLElement>(".cm-content")!;
    editor.focus();
    expect(document.activeElement).toBe(editor);
    expect(press(editor, "f").defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(host.querySelector(".cm-search input[name=search]")).not.toBeNull());
    host.querySelector<HTMLInputElement>(".cm-search input[name=search]")!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
    );
    expect(host.querySelector(".cm-search")).toBeNull();
    editor.focus();
    expect(press(editor, "f", true).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(host.querySelector(".cm-search input[name=replace]")).not.toBeNull());
    host.querySelector<HTMLInputElement>(".cm-search input[name=search]")!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
    );
    editor.blur();
    expect(press(host, "f").defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(host.querySelector(".cm-search input[name=search]")).not.toBeNull());
    host.querySelector<HTMLInputElement>(".cm-search input[name=search]")!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
    );
    expect(press(host, "f", true).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(host.querySelector(".cm-search input[name=replace]")).not.toBeNull());
  } finally {
    flushSync(() => root.unmount());
    host.remove();
  }
});
