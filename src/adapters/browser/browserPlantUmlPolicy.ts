export const PLANTUML_DEBOUNCE_MS = 250;
export const PLANTUML_RAW_CACHE_MAX_ENTRIES = 64;
export const PLANTUML_RAW_CACHE_MAX_BYTES = 64 * 1024 * 1024;

export type PlantUmlRawCacheEntry = {
  readonly bytes: number;
  readonly source: string;
  readonly svg: string;
};

export class PlantUmlRawSvgCache {
  readonly #entries = new Map<string, PlantUmlRawCacheEntry>();
  #bytes = 0;
  readonly maxEntries: number;
  readonly maxBytes: number;

  constructor(
    maxEntries = PLANTUML_RAW_CACHE_MAX_ENTRIES,
    maxBytes = PLANTUML_RAW_CACHE_MAX_BYTES,
  ) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  get(key: string, source: string): string | null {
    const entry = this.#entries.get(key);
    if (entry?.source !== source) {
      return null;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.svg;
  }

  put(key: string, entry: PlantUmlRawCacheEntry): void {
    const existing = this.#entries.get(key);
    if (existing !== undefined) {
      this.#bytes -= existing.bytes;
      this.#entries.delete(key);
    }
    this.#entries.set(key, entry);
    this.#bytes += entry.bytes;
    while (this.#entries.size > this.maxEntries || this.#bytes > this.maxBytes) {
      const oldestKey = this.#entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) {
        break;
      }
      const oldest = this.#entries.get(oldestKey);
      this.#entries.delete(oldestKey);
      this.#bytes -= oldest?.bytes ?? 0;
    }
  }

  clear(): void {
    this.#entries.clear();
    this.#bytes = 0;
  }

  get entryCount(): number {
    return this.#entries.size;
  }

  get byteCount(): number {
    return this.#bytes;
  }
}

export function shouldCachePlantUmlSource(source: string): boolean {
  const lower = source.toLowerCase();
  return !lower.includes("https://") && !lower.includes("http://") && !lower.includes("!includeurl");
}

export function prioritizePlantUmlItems<T>(
  items: readonly T[],
  activeSourceLine: number | null | undefined,
  sourceRange: (item: T) => readonly [number, number] | null,
): T[] {
  if (activeSourceLine === null || activeSourceLine === undefined) {
    return [...items];
  }
  const zeroBasedLine = activeSourceLine - 1;
  return [...items].sort((left, right) => {
    const contains = (item: T) => {
      const range = sourceRange(item);
      return range !== null && zeroBasedLine >= range[0] && zeroBasedLine <= range[1];
    };
    return Number(contains(right)) - Number(contains(left));
  });
}
