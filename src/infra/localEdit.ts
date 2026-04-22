import { type StoredEdit } from "../domain/editor";

export const LOCAL_EDIT_STORAGE_KEY = "kmark:edit:v1";

export function loadLocalEdit(): StoredEdit | null {
  try {
    const edit = window.localStorage.getItem(LOCAL_EDIT_STORAGE_KEY);

    if (edit === null) {
      return null;
    }

    const parsedEdit = JSON.parse(edit) as Partial<StoredEdit>;

    if (typeof parsedEdit.content !== "string" || typeof parsedEdit.fileName !== "string") {
      return null;
    }

    return {
      content: parsedEdit.content,
      fileName: parsedEdit.fileName,
      savedAt: typeof parsedEdit.savedAt === "number" ? parsedEdit.savedAt : null,
    };
  } catch {
    return null;
  }
}

export function persistLocalEdit(edit: StoredEdit): void {
  try {
    window.localStorage.setItem(LOCAL_EDIT_STORAGE_KEY, JSON.stringify(edit));
  } catch {
    // Ignore storage failures to keep typing uninterrupted.
  }
}