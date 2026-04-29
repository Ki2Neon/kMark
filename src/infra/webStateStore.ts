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

const WEB_STATE_DIRECTORY_NAME = "kmark-state";
const BROADCAST_CHANNEL_NAMESPACE = "kmark:state";

const channelByName = new Map<string, BroadcastChannel>();

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

async function writeStateText(fileName: string, storageKey: string, text: string | null): Promise<void> {
  const opfsDirectoryHandle = await getOpfsDirectoryHandle();

  if (opfsDirectoryHandle !== null) {
    const fileHandle = await opfsDirectoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text ?? "");
    await writable.close();
    return;
  }

  if (typeof window === "undefined") {
    throw new Error("ブラウザー永続化を利用できません。");
  }

  if (text === null) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, text);
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

  async function loadState(): Promise<T> {
    const rawText = await readStateText(fileName, storageKey);
    const normalizedState = await normalize(rawText);

    if (rawText !== normalizedState.text) {
      await writeStateText(fileName, storageKey, normalizedState.text);
    }

    return normalizedState.value;
  }

  async function persistState(value: T): Promise<T> {
    const normalizedState = await normalize(JSON.stringify(value));
    await writeStateText(fileName, storageKey, normalizedState.text);
    notifyStateUpdated(channelName);
    return normalizedState.value;
  }

  async function listenState(callback: (value: T) => void): Promise<() => void> {
    const channel = getBroadcastChannel(channelName);

    if (channel !== null) {
      const handleMessage = () => {
        void loadState().then(callback).catch(() => {});
      };

      channel.addEventListener("message", handleMessage);
      return () => {
        channel.removeEventListener("message", handleMessage);
      };
    }

    if (typeof window === "undefined") {
      return () => {};
    }

    const pingKey = `${BROADCAST_CHANNEL_NAMESPACE}:${channelName}:ping`;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== pingKey) {
        return;
      }

      void loadState().then(callback).catch(() => {});
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }

  return {
    load: loadState,
    persist: persistState,
    listen: listenState,
  };
}
