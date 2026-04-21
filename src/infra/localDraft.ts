import { type StoredDraft } from "../domain/editor";

export const LOCAL_DRAFT_STORAGE_KEY = "kmark:draft:v1";

export function loadLocalDraft(): StoredDraft | null {
  try {
    const draft = window.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY);

    if (draft === null) {
      return null;
    }

    const parsedDraft = JSON.parse(draft) as Partial<StoredDraft>;

    if (typeof parsedDraft.content !== "string" || typeof parsedDraft.fileName !== "string") {
      return null;
    }

    return {
      content: parsedDraft.content,
      fileName: parsedDraft.fileName,
      savedAt: typeof parsedDraft.savedAt === "number" ? parsedDraft.savedAt : null,
    };
  } catch {
    return null;
  }
}

export function persistLocalDraft(draft: StoredDraft): void {
  try {
    window.localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage failures to keep typing uninterrupted.
  }
}