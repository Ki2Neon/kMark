import { type StateEnvelope } from "../contracts/generated";
import { reportStateStorageIssue } from "./stateRecovery";

type StoreMessage = {
  readonly type: "updated";
};

type NormalizedWebState<T> = {
  readonly text: string | null;
  readonly value: T;
};

type WebJsonStateStoreOptions<T> = {
  readonly fileName: string;
  readonly storageKey: string;
  readonly normalize: (text: string | null) => Promise<NormalizedWebState<T>>;
};

type WebJsonStateStore<T> = {
  load(): Promise<T>;
  persist(value: T): Promise<T>;
  listen(callback: (value: T) => void): Promise<() => void>;
};

type NavigatorStorageManager = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

type NavigatorLockManager = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

type NavigatorWithLocks = Navigator & {
  readonly locks?: NavigatorLockManager;
};

type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

type SlotCandidate<T> = {
  readonly index: number;
  readonly envelope: StateEnvelope<T>;
};

const WEB_STATE_DIRECTORY_NAME = "kmark-state";
const BROADCAST_CHANNEL_NAMESPACE = "kmark:state";
const STATE_SCHEMA_VERSION = 1;
const STATE_SLOT_COUNT = 2;
const MAX_CORRUPT_FILES_PER_SLOT = 3;

const channelByName = new Map<string, BroadcastChannel>();
const fallbackLockTails = new Map<string, Promise<void>>();
let quarantineSequence = 0;

class UnsupportedStateSchemaError extends Error {
  constructor(location: string, found: number) {
    super(
      `保存データは新しい版の kMark で作成されています。データを上書きせず停止します: ${location} `
      + `(schema ${found} > ${STATE_SCHEMA_VERSION})`,
    );
    this.name = "UnsupportedStateSchemaError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBroadcastChannel(channelName: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  let channel = channelByName.get(channelName);

  if (channel === undefined) {
    channel = new BroadcastChannel(`${BROADCAST_CHANNEL_NAMESPACE}:${channelName}`);
    channelByName.set(channelName, channel);
  }

  return channel;
}

function getStorageManager(): NavigatorStorageManager | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  return (navigator.storage as NavigatorStorageManager | undefined) ?? null;
}

async function getOpfsDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const storageManager = getStorageManager();

  if (storageManager === null || typeof storageManager.getDirectory !== "function") {
    return null;
  }

  const rootDirectory = await storageManager.getDirectory();
  return rootDirectory.getDirectoryHandle(WEB_STATE_DIRECTORY_NAME, { create: true });
}

async function readStateText(fileName: string, storageKey: string): Promise<string | null> {
  const opfsDirectoryHandle = await getOpfsDirectoryHandle();

  if (opfsDirectoryHandle !== null) {
    try {
      const fileHandle = await opfsDirectoryHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        return null;
      }

      throw error;
    }
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(storageKey);
}

async function removeState(fileName: string, storageKey: string): Promise<void> {
  const opfsDirectoryHandle = await getOpfsDirectoryHandle();

  if (opfsDirectoryHandle !== null) {
    try {
      await opfsDirectoryHandle.removeEntry(fileName);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) {
        throw error;
      }
    }
    return;
  }

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(storageKey);
  }
}

async function writeStateText(fileName: string, storageKey: string, text: string): Promise<void> {
  const opfsDirectoryHandle = await getOpfsDirectoryHandle();

  if (opfsDirectoryHandle !== null) {
    const fileHandle = await opfsDirectoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
    return;
  }

  if (typeof window === "undefined") {
    throw new Error("ブラウザー永続化を利用できません。");
  }

  window.localStorage.setItem(storageKey, text);
}

function stateFileStem(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function slotFileName(fileName: string, index: number): string {
  return `${stateFileStem(fileName)}.slot-${index}.json`;
}

function slotStorageKey(storageKey: string, index: number): string {
  return `${storageKey}:slot:${index}`;
}

function nextQuarantineSuffix(): string {
  quarantineSequence = (quarantineSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now()}-${quarantineSequence}`;
}

async function pruneOpfsQuarantineFiles(prefix: string): Promise<void> {
  const directory = await getOpfsDirectoryHandle() as DirectoryHandleWithEntries | null;
  if (directory === null || typeof directory.entries !== "function") {
    return;
  }

  const names: string[] = [];
  for await (const [name] of directory.entries()) {
    if (name.startsWith(prefix)) {
      names.push(name);
    }
  }
  names.sort();
  await Promise.all(
    names.slice(0, Math.max(0, names.length - MAX_CORRUPT_FILES_PER_SLOT))
      .map((name) => directory.removeEntry(name)),
  );
}

function pruneLocalStorageQuarantineKeys(prefix: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key): key is string => key !== null && key.startsWith(prefix))
    .sort();
  keys.slice(0, Math.max(0, keys.length - MAX_CORRUPT_FILES_PER_SLOT))
    .forEach((key) => window.localStorage.removeItem(key));
}

async function quarantineCorruptState(
  fileName: string,
  storageKey: string,
  rawText: string,
): Promise<void> {
  const suffix = nextQuarantineSuffix();
  const quarantineFilePrefix = `${fileName}.corrupt-`;
  const quarantineStoragePrefix = `${storageKey}:corrupt:`;
  await writeStateText(
    `${quarantineFilePrefix}${suffix}`,
    `${quarantineStoragePrefix}${suffix}`,
    rawText,
  );
  await removeState(fileName, storageKey);
  await pruneOpfsQuarantineFiles(quarantineFilePrefix);
  pruneLocalStorageQuarantineKeys(quarantineStoragePrefix);
  reportStateStorageIssue({
    fatal: false,
    message: `破損した保存データを隔離し 保存済み世代から復旧しました: ${fileName}`,
  });
}

function reportFutureSchema(location: string, found: number): never {
  const error = new UnsupportedStateSchemaError(location, found);
  reportStateStorageIssue({ fatal: true, message: error.message });
  throw error;
}

async function readSlotCandidate<T>(
  fileName: string,
  storageKey: string,
  index: number,
  normalize: (text: string | null) => Promise<NormalizedWebState<T>>,
): Promise<SlotCandidate<T> | null> {
  const currentFileName = slotFileName(fileName, index);
  const currentStorageKey = slotStorageKey(storageKey, index);
  const rawText = await readStateText(currentFileName, currentStorageKey);
  if (rawText === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(rawText);
    if (!isRecord(parsed)) {
      throw new Error("state envelope must be an object");
    }

    const schemaVersion = parsed.schemaVersion;
    if (typeof schemaVersion === "number" && schemaVersion > STATE_SCHEMA_VERSION) {
      reportFutureSchema(currentFileName, schemaVersion);
    }
    if (schemaVersion !== STATE_SCHEMA_VERSION) {
      throw new Error("unsupported state schema");
    }

    const revision = parsed.revision;
    if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
      throw new Error("invalid state revision");
    }

    const normalized = await normalize(JSON.stringify(parsed.payload));
    return {
      index,
      envelope: {
        schemaVersion: STATE_SCHEMA_VERSION,
        revision: revision as number,
        payload: normalized.value,
      },
    };
  } catch (error) {
    if (error instanceof UnsupportedStateSchemaError) {
      throw error;
    }
    await quarantineCorruptState(currentFileName, currentStorageKey, rawText);
    return null;
  }
}

async function writeEnvelope<T>(
  fileName: string,
  storageKey: string,
  index: number,
  envelope: StateEnvelope<T>,
): Promise<void> {
  const currentFileName = slotFileName(fileName, index);
  const currentStorageKey = slotStorageKey(storageKey, index);
  const text = JSON.stringify(envelope);
  await writeStateText(currentFileName, currentStorageKey, text);

  const verifiedText = await readStateText(currentFileName, currentStorageKey);
  const verified: unknown = verifiedText === null ? null : JSON.parse(verifiedText);
  if (
    !isRecord(verified)
    || verified.schemaVersion !== envelope.schemaVersion
    || verified.revision !== envelope.revision
    || !("payload" in verified)
    || JSON.stringify(verified.payload) !== JSON.stringify(envelope.payload)
  ) {
    throw new Error(`保存データの書込検証に失敗しました: ${currentFileName}`);
  }
}

async function withFallbackLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const previous = fallbackLockTails.get(name) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.catch(() => {}).then(() => gate);
  fallbackLockTails.set(name, current);
  await previous.catch(() => {});

  try {
    return await operation();
  } finally {
    release();
    if (fallbackLockTails.get(name) === current) {
      fallbackLockTails.delete(name);
    }
  }
}

async function withStateLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const lockManager = typeof navigator === "undefined"
    ? undefined
    : (navigator as NavigatorWithLocks).locks;
  if (lockManager !== undefined) {
    return lockManager.request(`${BROADCAST_CHANNEL_NAMESPACE}:${name}`, operation);
  }
  return withFallbackLock(name, operation);
}

function notifyStateUpdated(channelName: string): void {
  const channel = getBroadcastChannel(channelName);

  if (channel !== null) {
    channel.postMessage({ type: "updated" } satisfies StoreMessage);
    return;
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${BROADCAST_CHANNEL_NAMESPACE}:${channelName}:ping`, `${Date.now()}`);
  }
}

export function createWebJsonStateStore<T>({
  fileName,
  storageKey,
  normalize,
}: WebJsonStateStoreOptions<T>): WebJsonStateStore<T> {
  const channelName = fileName;

  async function readSlots(): Promise<SlotCandidate<T>[]> {
    const candidates = await Promise.all(
      Array.from({ length: STATE_SLOT_COUNT }, (_, index) => (
        readSlotCandidate(fileName, storageKey, index, normalize)
      )),
    );
    return candidates.filter((candidate): candidate is SlotCandidate<T> => candidate !== null);
  }

  async function loadState(): Promise<T> {
    return withStateLock(channelName, async () => {
      const candidates = await readSlots();
      const newest = candidates.sort((left, right) => (
        right.envelope.revision - left.envelope.revision || right.index - left.index
      ))[0];
      if (newest !== undefined) {
        return newest.envelope.payload;
      }

      const legacyText = await readStateText(fileName, storageKey);
      if (legacyText === null) {
        return (await normalize(null)).value;
      }

      try {
        const parsedLegacy: unknown = JSON.parse(legacyText);
        if (
          isRecord(parsedLegacy)
          && typeof parsedLegacy.schemaVersion === "number"
          && parsedLegacy.schemaVersion > STATE_SCHEMA_VERSION
        ) {
          reportFutureSchema(fileName, parsedLegacy.schemaVersion);
        }
        const normalized = await normalize(legacyText);
        await writeEnvelope(fileName, storageKey, 0, {
          schemaVersion: STATE_SCHEMA_VERSION,
          revision: 1,
          payload: normalized.value,
        });
        return normalized.value;
      } catch (error) {
        if (error instanceof UnsupportedStateSchemaError) {
          throw error;
        }
        await quarantineCorruptState(fileName, storageKey, legacyText);
        return (await normalize(null)).value;
      }
    });
  }

  async function persistState(value: T): Promise<T> {
    const normalized = await normalize(JSON.stringify(value));
    const persisted = await withStateLock(channelName, async () => {
      const candidates = await readSlots();
      const currentRevision = candidates.reduce(
        (revision, candidate) => Math.max(revision, candidate.envelope.revision),
        0,
      );
      if (currentRevision >= Number.MAX_SAFE_INTEGER) {
        throw new Error(`保存データのrevision上限へ到達しました: ${fileName}`);
      }

      const occupiedIndexes = new Set(candidates.map((candidate) => candidate.index));
      const targetIndex = Array.from({ length: STATE_SLOT_COUNT }, (_, index) => index)
        .find((index) => !occupiedIndexes.has(index))
        ?? candidates.sort((left, right) => (
          left.envelope.revision - right.envelope.revision || left.index - right.index
        ))[0]?.index
        ?? 0;
      await writeEnvelope(fileName, storageKey, targetIndex, {
        schemaVersion: STATE_SCHEMA_VERSION,
        revision: currentRevision + 1,
        payload: normalized.value,
      });
      return normalized.value;
    });
    notifyStateUpdated(channelName);
    return persisted;
  }

  async function listenState(callback: (value: T) => void): Promise<() => void> {
    const channel = getBroadcastChannel(channelName);

    if (channel !== null) {
      const handleMessage = () => {
        void loadState().then(callback).catch(() => {});
      };

      channel.addEventListener("message", handleMessage);
      return () => channel.removeEventListener("message", handleMessage);
    }

    if (typeof window === "undefined") {
      return () => {};
    }

    const pingKey = `${BROADCAST_CHANNEL_NAMESPACE}:${channelName}:ping`;
    const observedKeys = new Set([
      storageKey,
      pingKey,
      ...Array.from({ length: STATE_SLOT_COUNT }, (_, index) => slotStorageKey(storageKey, index)),
    ]);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || !observedKeys.has(event.key)) {
        return;
      }
      void loadState().then(callback).catch(() => {});
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }

  return {
    load: loadState,
    persist: persistState,
    listen: listenState,
  };
}
