import { type CommandErrorPayload } from "../contracts/generated";
import { isTauri, invokeRuntimeCommand, listenRuntimeEvent } from "../runtime/runtime";

export type { CommandErrorPayload } from "../contracts/generated";

type CommandError = Error & {
  readonly code?: string;
  readonly detail?: string | null;
};

function isCommandErrorPayload(value: unknown): value is CommandErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<CommandErrorPayload>;

  return typeof candidate.code === "string" && typeof candidate.message === "string";
}

function resolveCommandErrorPayload(value: unknown): CommandErrorPayload | null {
  if (isCommandErrorPayload(value)) {
    return value;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as {
    readonly error?: unknown;
    readonly payload?: unknown;
  };

  return resolveCommandErrorPayload(candidate.payload)
    ?? resolveCommandErrorPayload(candidate.error);
}

function createCommandError(payload: unknown, fallbackMessage: string): CommandError {
  const commandErrorPayload = resolveCommandErrorPayload(payload);

  if (commandErrorPayload !== null) {
    const error = new Error(commandErrorPayload.message) as CommandError;
    Object.defineProperties(error, {
      code: {
        value: commandErrorPayload.code,
        enumerable: true,
      },
      detail: {
        value: commandErrorPayload.detail ?? null,
        enumerable: true,
      },
    });

    return error;
  }

  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload as CommandError;
  }

  if (typeof payload === "string" && payload.trim().length > 0) {
    return new Error(payload) as CommandError;
  }

  return new Error(fallbackMessage) as CommandError;
}

export function toCommandErrorMessage(payload: unknown, fallbackMessage: string): string {
  return createCommandError(payload, fallbackMessage).message;
}

export async function invokeTauriCommand<T>(
  command: string,
  args: Record<string, unknown>,
  fallbackMessage: string,
): Promise<T> {
  if (!isTauri()) {
    throw new Error("Tauri 環境が必要です。");
  }

  const request = args.request as {
    readonly sessionId?: string;
    readonly batch?: { readonly clientId?: string; readonly batchId?: number; readonly expectedRevision?: number };
  } | undefined;
  const sessionId = request?.sessionId ?? (typeof args.sessionId === "string" ? args.sessionId : undefined);
  const revision = request?.batch?.expectedRevision
    ?? (typeof args.expectedRevision === "number" ? args.expectedRevision : undefined)
    ?? (typeof args.revision === "number" ? args.revision : undefined);
  const operationId = request?.batch?.clientId && request.batch.batchId !== undefined
    ? `${request.batch.clientId}:${request.batch.batchId}`
    : (typeof revision === "number" && command === "render_editor_session_preview" ? `preview-${revision}` : undefined)
      ?? (typeof revision === "number" && command === "write_editor_session_markdown_document" ? `save-${revision}` : undefined);
  const trace = { command, sessionId, operationId, revision };
  console.info("[kmark:ipc] begin", trace);
  try {
    const result = await invokeRuntimeCommand<T>(command, args);
    const resultRevision = typeof result === "object" && result !== null && "revision" in result
      ? (result as { revision?: unknown }).revision
      : undefined;
    console.info("[kmark:ipc] end", { ...trace, resultRevision });
    return result;
  } catch (error) {
    console.error("[kmark:ipc] error", trace);
    throw createCommandError(error, fallbackMessage);
  }
}

export async function listenTauriEvent<T>(
  eventName: string,
  callback: (payload: T) => void,
): Promise<() => void> {
  if (!isTauri()) {
    throw new Error("Tauri 環境が必要です。");
  }

  return listenRuntimeEvent<T>(eventName, callback);
}
