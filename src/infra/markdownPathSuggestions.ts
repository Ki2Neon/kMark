import { isTauri } from "../runtime/runtime";
import { invokeTauriCommand } from "./tauriCommand";
import { type KmarkPathCompletionFilter } from "../features/kmark-completion/adapter/codeMirrorKmarkCompletionSource";
import { type KmarkPathCompletionEntry } from "../features/kmark-completion/core/types";

const LIST_MARKDOWN_PATH_SUGGESTIONS_COMMAND = "list_markdown_path_suggestions";

export async function listMarkdownPathSuggestions(input: {
  readonly filter: KmarkPathCompletionFilter;
  readonly input: string;
  readonly markdownFilePath: string;
}): Promise<readonly KmarkPathCompletionEntry[]> {
  if (!isTauri()) {
    return [];
  }

  try {
    return await invokeTauriCommand<readonly KmarkPathCompletionEntry[]>(
      LIST_MARKDOWN_PATH_SUGGESTIONS_COMMAND,
      {
        filter: input.filter,
        input: input.input,
        markdownFilePath: input.markdownFilePath,
      },
      "Path候補の取得に失敗しました。",
    );
  } catch {
    return [];
  }
}
