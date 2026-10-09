import { getSearchQuery, openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

export function openCodeMirrorSearch(view: EditorView): boolean {
  return openSearchPanel(view);
}

export function openCodeMirrorReplace(view: EditorView): boolean {
  openSearchPanel(view);

  // Start in Find when no query exists; otherwise focus the replacement field.
  if (getSearchQuery(view.state).search.length > 0) {
    const replaceField = view.dom.querySelector<HTMLInputElement>(".cm-search input[name=replace]");
    replaceField?.focus();
    replaceField?.select();
  }

  return true;
}

export const CODE_MIRROR_SEARCH_EXTENSION: Extension = [
  EditorState.phrases.of({
    Find: "検索",
    Replace: "置換後",
    next: "次へ",
    previous: "前へ",
    all: "すべて選択",
    "match case": "大文字小文字を区別",
    regexp: "正規表現",
    "by word": "単語単位",
    replace: "置換",
    "replace all": "すべて置換",
    close: "閉じる",
  }),
  search({ top: true }),
  Prec.highest(keymap.of([
    { key: "Mod-Shift-f", run: openCodeMirrorReplace, scope: "editor search-panel" },
  ])),
  keymap.of(searchKeymap),
];
