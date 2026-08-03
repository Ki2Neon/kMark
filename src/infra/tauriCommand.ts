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

  try {
    return await invokeRuntimeCommand<T>(command, args);
  } catch (error) {
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
