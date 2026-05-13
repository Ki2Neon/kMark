import { isTauri, setRuntimeWindowTitle } from "../runtime/runtime";

export function syncWindowTitle(title: string) {
  document.title = title;

  if (!isTauri()) {
    return;
  }

  void setRuntimeWindowTitle(title)
    .catch(() => {
      // Ignore title-sync failures and keep the document title updated.
    });
}
